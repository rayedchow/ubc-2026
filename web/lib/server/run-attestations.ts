/**
 * "Add attestation" for a finished devnet training run.
 *
 * 1. A browser wallet signs a challenge naming the run, its payment channel,
 *    the Gym, the score and a nonce. The server checks the ed25519 signature.
 * 2. The verified sealed grader writes a `record_result` account onchain. The
 *    program accepts it only from a grader with a live record for approved code.
 *
 * What the score is: the sealed grader's mean reward on the run's first graded
 * group (before) and its last graded group (after). It is a training reward,
 * not a held-out test, and the record says so with `heldout_n = 0` (held-out
 * sealed tests always record n > 0). A held-out test needs the trained model
 * itself, which runs on the trainer's GPUs, so it is not offered here.
 *
 * How the wallet relates to the run (shown as is, never upgraded):
 * - "channel-trainer": the wallet that opened the run's payment channel.
 * - "linked": the browser wallet linked (lib/server/wallet-links.ts) to the
 *   trainer handle that owns the run's model.
 * - "unlinked": any other wallet. Allowed only while the owning trainer has no
 *   linked wallet; then it is recorded as the attesting wallet and labelled so.
 *
 * Fields in the record: run_id = sha256(run id | channel)[0..16], so there is
 * one attestation per run (the PDA is per Gym + run_id). model_before =
 * sha256(channel), model_after = sha256(wallet | wallet signature), which binds
 * the wallet's signature to the onchain record. The wallet, message and
 * signature are kept in `.modelmon/attestations.json` so the UI can show them
 * and anyone can recompute the hash.
 */

import { createHash, randomBytes } from "node:crypto";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";
import { demoRuns } from "../monitor-demo";
import { isActiveRun, type MonitorRun } from "../run-monitor";
import { HttpError } from "./api";
import { enclave } from "./enclave/grader";
import { readJson, statePath, writeJson } from "./files";
import { gymPda, hex, program, resultPda } from "./solana";
import { graderView, gymChainView } from "./verification";

export type WalletRole = "channel-trainer" | "linked" | "unlinked";
export type RunAttestation = {
  runId: string;
  gymId: string;
  channel: string;
  recordRunId: string;
  result: string;
  tx: string;
  wallet: string;
  walletRole: WalletRole;
  trainer: string;
  message: string;
  signature: string;
  walletHash: string;
  before: number;
  after: number;
  reps: number;
  recordedAt: string;
};

const INDEX = () => statePath("attestations.json");
const CHALLENGE_TTL_MS = 5 * 60_000;

const g = globalThis as unknown as {
  __modelmon_attest?: { challenges: Map<string, { message: string; expires: number }>; busy: Map<string, Promise<unknown>> };
};
const mem = (g.__modelmon_attest ??= { challenges: new Map(), busy: new Map() });

const sha256 = (...parts: (string | Uint8Array)[]) => {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest();
};

function findRun(id: string): MonitorRun {
  const run = demoRuns().find((r) => r.id === id);
  if (!run) throw new HttpError(404, "Run not found.");
  return run;
}

function score(run: MonitorRun) {
  const points = (run.scoreHistory ?? run.history).filter((p) => p.reps > 0);
  if (!points.length) return null;
  return { before: points[0].reward, after: points[points.length - 1].reward, groups: points.length };
}

function linkedWalletFor(trainer: string): string | null {
  const links = readJson<Record<string, { trainer: string }>>(statePath("wallet-links.json"), {});
  return Object.entries(links).find(([, l]) => l.trainer === trainer)?.[0] ?? null;
}

const recordRunId = (run: MonitorRun) => sha256("modelmon:training-attestation:v1|", run.id, "|", run.channel ?? "").subarray(0, 16);

export function existingAttestation(runId: string): RunAttestation | null {
  return readJson<Record<string, RunAttestation>>(INDEX(), {})[runId] ?? null;
}

/** What the run would attest, and whether it can yet. */
export async function attestationStatus(runId: string) {
  const run = findRun(runId);
  const existing = existingAttestation(runId);
  const s = score(run);
  const reason = !run.channel || run.source !== "Devnet"
    ? "Only devnet runs graded by the sealed grader can be attested."
    : isActiveRun(run.status)
      ? "The run is still training. Attest it once it finishes."
      : !s
        ? "The run has no graded groups."
        : null;
  return {
    eligible: !reason && !existing,
    reason,
    attestation: existing,
    score: s && { ...s, reps: run.reps },
    trainer: run.model.trainer,
    linkedWallet: linkedWalletFor(run.model.trainer),
  };
}

function walletRole(run: MonitorRun, address: string, channelTrainer: string): WalletRole {
  if (address === channelTrainer) return "channel-trainer";
  const linked = linkedWalletFor(run.model.trainer);
  if (linked === address) return "linked";
  if (linked) {
    throw new HttpError(403, `Trainer “${run.model.trainer}” owns this run and is linked to wallet ${linked}. Sign with that wallet.`);
  }
  return "unlinked";
}

function checkAddress(address: unknown): string {
  if (typeof address !== "string") throw new HttpError(400, "Send the wallet address.");
  try {
    if (bs58.decode(address).length === 32) return address;
  } catch {}
  throw new HttpError(400, "That is not a valid Solana wallet address.");
}

/** Step 1: the message the wallet signs. */
export async function attestationChallenge(runId: string, address: unknown) {
  const wallet = checkAddress(address);
  const status = await attestationStatus(runId);
  if (status.attestation) throw new HttpError(409, "This run is already attested.");
  if (!status.eligible || !status.score) throw new HttpError(409, status.reason ?? "This run cannot be attested.");
  const run = findRun(runId);
  const s = status.score;
  const message = [
    "Modélmon: attest this training run on Solana devnet.",
    `Run: ${run.id}`,
    `Channel: ${run.channel}`,
    `Gym: ${run.gymId}`,
    `Score: training reward ${s.before.toFixed(4)} → ${s.after.toFixed(4)} (first → last graded group, ${s.reps} rollouts), graded in the sealed grader. Not a held-out test.`,
    `Wallet: ${wallet}`,
    `Nonce: ${randomBytes(16).toString("hex")}`,
    "Signing does not move funds.",
  ].join("\n");
  mem.challenges.set(`${run.id}|${wallet}`, { message, expires: Date.now() + CHALLENGE_TTL_MS });
  return { message };
}

/** Step 2: check the wallet's signature, then have the verified grader write the record. */
export async function attestRun(runId: string, input: { address?: unknown; signature?: unknown }) {
  const wallet = checkAddress(input.address);
  const prior = existingAttestation(runId);
  if (prior) return { already: true, attestation: prior };
  const pending = mem.busy.get(runId);
  if (pending) {
    await pending.catch(() => {});
    const done = existingAttestation(runId);
    if (done) return { already: true, attestation: done };
  }
  const work = (async () => {
    const run = findRun(runId);
    const key = `${run.id}|${wallet}`;
    const challenge = mem.challenges.get(key);
    mem.challenges.delete(key);
    if (!challenge || challenge.expires < Date.now()) throw new HttpError(409, "That request expired. Click Add attestation again.");
    let sig: Uint8Array;
    try {
      sig = bs58.decode(typeof input.signature === "string" ? input.signature : "");
    } catch {
      throw new HttpError(400, "The signature could not be read.");
    }
    if (sig.length !== 64 || !nacl.sign.detached.verify(new TextEncoder().encode(challenge.message), sig, bs58.decode(wallet))) {
      throw new HttpError(401, "The signature does not match this wallet.");
    }

    const status = await attestationStatus(runId);
    if (!status.eligible || !status.score) throw new HttpError(409, status.reason ?? "This run cannot be attested.");
    const s = status.score;
    const channel = await program().account.channel.fetchNullable(new PublicKey(run.channel!)).catch(() => null);
    const tab = readJson<Record<string, { trainer: string }>>(statePath("enclave", "grader-tabs.json"), {})[run.channel!];
    const channelTrainer = channel?.trainer.toBase58() ?? tab?.trainer ?? "";
    const role = walletRole(run, wallet, channelTrainer);

    const e = await enclave();
    const gym = await gymChainView(run.gymId);
    if (!gym) throw new HttpError(409, "This Gym is not registered on devnet.");
    if (gym.grader !== e.id.sign.publicKey.toBase58()) {
      throw new HttpError(409, "The Gym's grader is not the one running here, so it cannot sign this record.");
    }
    const runIdBytes = recordRunId(run);
    const gymKey = gymPda(run.gymId);
    const resultKey = resultPda(gymKey, runIdBytes);
    const onchain = await program().account.resultRecord.fetchNullable(resultKey);
    if (onchain) throw new HttpError(409, `This run already has an onchain record (${resultKey.toBase58()}).`);

    const walletHash = sha256("modelmon:attest-wallet:v1|", wallet, "|", sig).toString("hex");
    const rec = await e.recordResult({
      gymId: run.gymId,
      runId: new Uint8Array(runIdBytes),
      kind: "evolution",
      modelBefore: sha256("modelmon:training-run:v1|", run.channel!).toString("hex"),
      modelAfter: walletHash,
      before: s.before * 100,
      after: s.after * 100,
      ci: 0,
      n: 0, // not a held-out test
      reps: s.reps,
      cost: BigInt(Math.round((run.accepted ?? 0) * 1e6)),
    });
    if (!rec.ok) throw new HttpError(502, `The record was refused onchain: ${rec.error}${rec.tx ? ` (tx ${rec.tx})` : ""}`);

    const attestation: RunAttestation = {
      runId: run.id,
      gymId: run.gymId,
      channel: run.channel!,
      recordRunId: Buffer.from(runIdBytes).toString("hex"),
      result: rec.result,
      tx: rec.tx,
      wallet,
      walletRole: role,
      trainer: run.model.trainer,
      message: challenge.message,
      signature: bs58.encode(sig),
      walletHash,
      before: s.before,
      after: s.after,
      reps: s.reps,
      recordedAt: new Date().toISOString(),
    };
    const index = readJson<Record<string, RunAttestation>>(INDEX(), {});
    index[run.id] = attestation;
    writeJson(INDEX(), index, 0o644);
    resultsCache.delete(run.gymId);
    return { already: false, attestation };
  })();
  mem.busy.set(runId, work);
  try {
    return await work;
  } finally {
    mem.busy.delete(runId);
  }
}

/* ---------- Reading a Gym's records ---------- */

const resultsCache = new Map<string, { at: number; value: Promise<unknown> }>();

export type GymResult = {
  address: string;
  kind: "training-reward" | "held-out" | "badge";
  before: number;
  after: number;
  ci: number;
  heldoutN: number;
  reps: number;
  recordedAt: number;
  grader: { key: string; record: string; hardware?: string };
  wallet?: { address: string; role: WalletRole; trainer: string; signature: string; hashMatches: boolean; tx: string };
  runId?: string;
};

export function gymResults(gymId: string): Promise<GymResult[]> {
  const hit = resultsCache.get(gymId);
  if (hit && Date.now() - hit.at < 15_000) return hit.value as Promise<GymResult[]>;
  const value = (async () => {
    const gymKey = gymPda(gymId);
    const rows = await program().account.resultRecord.all([{ memcmp: { offset: 8, bytes: gymKey.toBase58() } }]);
    const index = Object.values(readJson<Record<string, RunAttestation>>(INDEX(), {}));
    const graders = new Map<string, Awaited<ReturnType<typeof graderView>>>();
    for (const key of new Set(rows.map((r) => r.account.grader.toBase58()))) graders.set(key, await graderView(key));
    return rows
      .map(({ publicKey, account: a }): GymResult => {
        const local = index.find((x) => x.result === publicKey.toBase58());
        const grader = graders.get(a.grader.toBase58())!;
        return {
          address: publicKey.toBase58(),
          kind: a.kind === 0 ? "badge" : a.heldoutN > 0 ? "held-out" : "training-reward",
          before: a.beforeBps / 10000,
          after: a.afterBps / 10000,
          ci: a.ciBps / 10000,
          heldoutN: a.heldoutN,
          reps: Number(a.reps.toString()),
          recordedAt: a.recordedAt.toNumber(),
          grader: { key: grader.key, record: grader.record, hardware: grader.hardware },
          runId: local?.runId,
          wallet: local && {
            address: local.wallet,
            role: local.walletRole,
            trainer: local.trainer,
            signature: local.signature,
            tx: local.tx,
            hashMatches:
              hex(a.modelAfter) ===
              sha256("modelmon:attest-wallet:v1|", local.wallet, "|", bs58.decode(local.signature)).toString("hex"),
          },
        };
      })
      .sort((x, y) => y.recordedAt - x.recordedAt);
  })().catch((err) => {
    resultsCache.delete(gymId);
    throw err;
  });
  resultsCache.set(gymId, { at: Date.now(), value });
  return value;
}
