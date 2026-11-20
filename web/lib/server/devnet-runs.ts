/**
 * Real runs for the app's Run screens (MODELMON_CHAIN=devnet).
 *
 * Starting a run gives the model a devnet wallet, mints its budget in test
 * USDC, and starts an in-process trainer that calls this server's x402
 * grading endpoint over HTTP: 402 → open channel (one deposit) → one signed
 * voucher per group of 16 rollouts. The rollouts come from the scripted demo
 * policy (not a neural model); grading, payment, settlement and the onchain
 * improvement record are real. Snapshots are built from what the grader
 * actually returned.
 */

import { randomInt } from "node:crypto";
import { env } from "./env";
import { enclave, newRunId } from "./enclave/grader";
import { emit } from "./events";
import { fundWallet } from "./faucet";
import { walletKeypair } from "./files";
import type { PublicTask } from "./gyms/solana-tx";
import { GYM_MODULES } from "./gyms";
import { SCRIPTED_PROBE, scriptedPolicy } from "./policy";
import { maybeDeployment } from "./solana";
import { TrainerClient } from "./trainer";
import type { Evolution, RunEvent, RunRecord, Settlement } from "../types";
import type { MonitorEvent, RewardPoint } from "../run-monitor";

const GROUP = 16;
/** Live demo runs stop after this many groups (the unspent deposit is refunded at settlement). */
const MAX_LIVE_GROUPS = Number(process.env.MODELMON_MAX_LIVE_GROUPS ?? 40);
const SKILL_START = 0.15;
const SKILL_END = 0.8;

type Live = {
  client?: TrainerClient;
  stop: boolean;
  done: boolean;
  error?: string;
  reps: number;
  maxReps: number;
  spent: number;
  price: number;
  history: RewardPoint[];
  rolloutScores: RewardPoint[];
  events: RunEvent[];
  skill: number;
  /** What actually happened, in order, for the run monitor. Signatures are devnet transactions. */
  timeline: MonitorEvent[];
  graderVersion?: string;
};

const g = globalThis as unknown as { __modelmon_live?: Map<string, Live> };
const live: Map<string, Live> = (g.__modelmon_live ??= new Map());

/** Only Gyms actually sealed and listed on devnet run for real. */
export function isLiveGym(gymId: string) {
  return gymId in GYM_MODULES && !!maybeDeployment()?.gyms[gymId];
}

const baseUrl = () => process.env.MODELMON_PUBLIC_URL || `http://localhost:${process.env.PORT || 3210}`;
const skillAt = (progress: number) => SKILL_START + (SKILL_END - SKILL_START) * (1 - Math.exp(-3 * progress));

export async function startLiveRun(run: RunRecord, pricePerRep: number) {
  const wallet = walletKeypair(`model-${run.modelId}`);
  await fundWallet(wallet.publicKey, { sol: 0.01, usdc: run.budget });
  const maxReps = Math.min(MAX_LIVE_GROUPS * GROUP, Math.floor(run.budget / pricePerRep / GROUP) * GROUP);
  const state: Live = {
    stop: false, done: false, reps: 0, maxReps, spent: 0, price: pricePerRep,
    history: [], rolloutScores: [], events: [], skill: SKILL_START, timeline: [],
  };
  note(state, { kind: "opened" });
  live.set(run.id, state);
  const client = new TrainerClient(baseUrl(), wallet, run.gymId, BigInt(Math.round(run.budget * 1e6)), `model ${run.modelId}`);
  state.client = client;
  void loop(run, state, client);
  return { vault: wallet.publicKey.toBase58() };
}

function note(s: Live, e: Omit<MonitorEvent, "seq" | "at">) {
  s.timeline.push({ seq: s.timeline.length + 1, at: Date.now(), ...e });
}

async function loop(run: RunRecord, s: Live, client: TrainerClient) {
  try {
    const e = await enclave();
    const rec = await e.record();
    if (rec) note(s, { kind: "verified" }); // the grader's onchain record is live for approved code
    const tasks: PublicTask[] = await client.tasks();
    let r = randomInt(1, 2 ** 30);
    const rng = () => ((r = (r * 48271) % 2147483647) / 2147483647);
    const probeAt = [0.19, 0.63].map((f) => Math.floor((s.maxReps * f) / GROUP) * GROUP);
    for (let step = 0; !s.stop && s.reps + GROUP <= s.maxReps; step++) {
      s.skill = skillAt(s.reps / Math.max(1, s.maxReps));
      const policy = scriptedPolicy(s.skill);
      const task = tasks[randomInt(tasks.length)];
      const outputs = await Promise.all(Array.from({ length: GROUP }, () => policy.answer(task, rng)));
      if (probeAt.includes(s.reps)) outputs[randomInt(GROUP)] = SCRIPTED_PROBE; // scripted hack attempt
      const group = `step-${step}`;
      note(s, { kind: "dispatched", group, worker: "devnet-trainer" });
      note(s, { kind: "submitted", group, worker: "devnet-trainer", reps: GROUP });
      const t0 = Date.now();
      const hadChannel = !!client.channel;
      const res = await client.grade(task.id, outputs, `${run.id}/step-${step}`);
      if (!hadChannel && client.channel) {
        note(s, { kind: "funded", amount: run.budget, signature: client.openSignature });
      }
      s.graderVersion = res.grader_version;
      note(s, { kind: "voucher", group, amount: Number(res.tab.cumulative) / 1e6 });
      note(s, { kind: "graded", group, worker: "devnet-trainer", reps: GROUP, reward: res.group_stats.mean, latencyMs: Date.now() - t0 });
      for (const f of res.flags) note(s, { kind: "flagged", group, reps: 1, worker: f.id });
      for (const [index, result] of res.rewards.entries()) {
        if (result.status === "ok" && result.reward !== undefined) {
          s.rolloutScores.push({ reps: res.tab.reps - res.rewards.length + index + 1, reward: result.reward });
        }
      }
      s.reps = res.tab.reps;
      s.spent = Number(res.tab.cumulative) / 1e6;
      s.history.push({ reps: s.reps, reward: res.group_stats.mean });
      if (s.history.length === 1) s.history.unshift({ reps: 0, reward: res.group_stats.mean });
      for (const f of res.flags) {
        s.events.push({ atRep: s.reps, kind: "disqualified", rollout: f.id, reason: "tried to read the grader's answer key (scripted attack)" });
      }
      await new Promise((ok) => setTimeout(ok, env.demoStepSeconds * 1000));
    }
  } catch (err) {
    s.error = (err as Error).message;
    emit({ lane: "trainer", kind: "run.error", ok: false, text: `Run ${run.id} stopped: ${s.error}` });
  } finally {
    s.done = true;
    note(s, { kind: "completed", reps: s.reps });
  }
}

export function liveProgress(runId: string) {
  const s = live.get(runId);
  if (!s) return null;
  const points = s.history.length ? s.history : [{ reps: 0, reward: 0 }];
  return {
    reps: s.reps,
    maxReps: s.maxReps,
    spent: s.spent,
    meanReward: points[points.length - 1].reward,
    history: points,
    rolloutScores: s.rolloutScores,
    events: s.events,
    done: s.done,
    error: s.error,
    timeline: s.timeline,
    graderVersion: s.graderVersion,
    channel: s.client?.channel?.toBase58(),
  };
}

export async function settleLiveRun(run: RunRecord, split: { leader: number; contributors: number; platform: number }): Promise<Settlement> {
  const s = live.get(run.id);
  if (!s?.client?.channel) throw new Error("This run has not opened a payment channel yet. Wait for its first graded group.");
  s.stop = true;
  while (!s.done) await new Promise((ok) => setTimeout(ok, 200));
  const e = await enclave();
  const r = await e.settle(s.client.channel.toBase58());
  if (!r.ok) throw new Error(`Settlement rejected onchain: ${r.error}`);
  const total = Number(r.amount) / 1e6;
  note(s, { kind: "settled", amount: total, signature: r.tx });
  void split;
  return {
    tx: r.tx,
    total,
    leader: Number(r.leader) / 1e6,
    contributors: Number(r.contributors) / 1e6,
    platform: Number(r.platform) / 1e6,
  };
}

/** Sealed test before (starting skill) and after (trained skill), run inside the grader, recorded onchain. */
export async function sealedTestLiveRun(run: RunRecord): Promise<Omit<Evolution, "fromHash" | "toHash"> & { fromHash: string; toHash: string }> {
  const s = live.get(run.id);
  const e = await enclave();
  const beforePolicy = scriptedPolicy(SKILL_START);
  const afterPolicy = scriptedPolicy(s?.skill ?? SKILL_START);
  const before = await e.sealedTest(run.gymId, beforePolicy);
  const after = await e.sealedTest(run.gymId, afterPolicy);
  const rec = await e.recordResult({
    gymId: run.gymId,
    runId: newRunId(),
    kind: "evolution",
    modelBefore: before.policyId,
    modelAfter: after.policyId,
    before: before.score,
    after: after.score,
    ci: after.ci,
    n: after.n,
    reps: s?.reps ?? 0,
    cost: BigInt(Math.round((run.settlement?.total ?? 0) * 1e6)),
  });
  if (!rec.ok) throw new Error(`Improvement record rejected onchain: ${rec.error}`);
  if (s) {
    note(s, { kind: "evaluated" });
    note(s, { kind: "attested", signature: rec.tx });
  }
  return {
    before: before.score,
    after: after.score,
    ci: after.ci,
    // Transfer and regression need other sealed Gyms, which are not on devnet yet. Reported as not measured.
    transfer: { gymName: "not measured on devnet yet", before: 0, after: 0 },
    regression: { before: 0, after: 0 },
    attestationTx: rec.tx,
    evolved: after.score - before.score >= 20,
    fromHash: before.policyId.slice(0, 3),
    toHash: after.policyId.slice(0, 3),
  };
}

/** A model's devnet wallet. Adding credits mints test USDC into it. */
export async function fundModelWallet(modelId: string, usdc: number): Promise<string> {
  const wallet = walletKeypair(`model-${modelId}`);
  await fundWallet(wallet.publicKey, { sol: 0.01, usdc });
  return wallet.publicKey.toBase58();
}

/** Adds an event to whichever live run owns this channel (used by the tamper demo). */
export function noteForChannel(channel: string, e: Omit<MonitorEvent, "seq" | "at">) {
  for (const s of live.values()) if (s.client?.channel?.toBase58() === channel) note(s, e);
}
