/**
 * Training runs that happen outside this app (the GRPO and Clef jobs on Modal),
 * shown in the run monitor from what the sealed grader actually saw.
 *
 * The grader keeps a tab per payment channel: every graded group with its rep
 * count, mean reward and running total paid, plus flagged rollouts and the
 * settlement. This reads that tab from disk (it is written after every graded
 * group), so it needs nothing from the training jobs and changes nothing in
 * the grader.
 */

import fs from "node:fs";
import { Keypair } from "@solana/web3.js";
import { statePath } from "./files";
import type { MonitorEvent, MonitorModel, MonitorRun } from "../run-monitor";

type Tab = {
  channel: string;
  gymId: string;
  trainer: string;
  deposit: string;
  cumulative: string;
  reps: number;
  groups: { at: string; reps: number; mean: number; cumulative: string }[];
  flags: { at: string; rollout: string; taskId: string; reason: string }[];
  settled?: { tx: string; amount: string; leader: string; contributors: string; platform: string };
};

/** Which trainer wallet trains which app model. */
const EXTERNAL_TRAINERS: { wallet: string; modelId: string; label: string }[] = [
  { wallet: "trainer-grpo", modelId: "ember", label: "GRPO on Modal" },
  { wallet: "trainer-clef", modelId: "sprig", label: "Decision-head RL on Modal" },
];

/** A gap this long between graded groups starts a new training session on the same channel. */
const SESSION_GAP_MS = 3 * 60_000;
const LIVE_MS = 90_000;

let cache: { mtime: number; tabs: Record<string, Tab> } | null = null;
function readTabs(): Record<string, Tab> {
  const file = statePath("enclave", "grader-tabs.json");
  try {
    const mtime = fs.statSync(file).mtimeMs;
    if (!cache || cache.mtime !== mtime) cache = { mtime, tabs: JSON.parse(fs.readFileSync(file, "utf8")) };
    return cache.tabs;
  } catch {
    return {};
  }
}

function walletAddress(name: string): string | null {
  try {
    const secret = Uint8Array.from(JSON.parse(fs.readFileSync(statePath("wallets", `${name}.json`), "utf8")));
    return Keypair.fromSecretKey(secret).publicKey.toBase58();
  } catch {
    return null;
  }
}

const usd = (base: string | number) => Number(base) / 1e6;

export function externalRuns(models: Map<string, MonitorModel>, gymName: (id: string) => string): MonitorRun[] {
  const tabs = Object.values(readTabs());
  const runs: MonitorRun[] = [];
  for (const t of EXTERNAL_TRAINERS) {
    const trainer = walletAddress(t.wallet);
    const model = models.get(t.modelId);
    if (!trainer || !model) continue;
    for (const tab of tabs.filter((x) => x.trainer === trainer && x.groups.length)) {
      // Only the latest session on the channel: earlier aborted attempts were real and paid, but are not this run.
      const groups = tab.groups.map((g) => ({ ...g, t: Date.parse(g.at) }));
      let start = 0;
      for (let i = 1; i < groups.length; i++) if (groups[i].t - groups[i - 1].t > SESSION_GAP_MS) start = i;
      const session = groups.slice(start);
      const repsBefore = start ? groups[start - 1].reps : 0;
      const paidBefore = start ? usd(groups[start - 1].cumulative) : 0;
      const startedAt = session[0].t;
      const last = session[session.length - 1];
      const live = Date.now() - last.t < LIVE_MS && !tab.settled;

      const events: MonitorEvent[] = [{ seq: 1, at: startedAt - 1, kind: "opened", worker: t.label }];
      session.forEach((g, i) => {
        const reps = g.reps - (i ? session[i - 1].reps : repsBefore);
        const group = `group-${i + 1}`;
        events.push(
          { seq: events.length + 1, at: g.t - 1, kind: "submitted", group, worker: "modal", reps },
          { seq: events.length + 2, at: g.t, kind: "voucher", group, amount: usd(g.cumulative) - paidBefore },
          { seq: events.length + 3, at: g.t, kind: "graded", group, worker: "modal", reps, reward: g.mean },
        );
      });
      for (const f of tab.flags.filter((f) => Date.parse(f.at) >= startedAt)) {
        events.push({ seq: events.length + 1, at: Date.parse(f.at), kind: "flagged", reps: 1, worker: f.rollout });
      }
      if (tab.settled) events.push({ seq: events.length + 1, at: last.t + 1, kind: "settled", amount: usd(tab.settled.amount), signature: tab.settled.tx });
      events.sort((a, b) => a.at - b.at);

      runs.push({
        id: `external-${tab.channel.slice(0, 10)}`,
        model,
        gym: gymName(tab.gymId),
        gymId: tab.gymId,
        skills: [t.label],
        startedAt,
        source: "Devnet",
        status: tab.settled ? "Completed" : live ? "Training" : "Ready to settle",
        updatedAt: last.t,
        reps: last.reps - repsBefore,
        budget: usd(tab.deposit) - paidBefore,
        accepted: usd(last.cumulative) - paidBefore,
        reserved: 0,
        settled: tab.settled ? usd(tab.settled.amount) : 0,
        split: tab.settled
          ? { leader: usd(tab.settled.leader), contributors: usd(tab.settled.contributors), platform: usd(tab.settled.platform) }
          : undefined,
        attestation: "Off-chain authority reported",
        history: session.map((g) => ({ reps: g.reps - repsBefore, reward: g.mean })),
        workers: [{ id: "modal", state: live ? "Grading" : "Finished", reps: last.reps - repsBefore, heartbeatAt: last.t }],
        events,
        channel: tab.channel,
      });
    }
  }
  return runs;
}
