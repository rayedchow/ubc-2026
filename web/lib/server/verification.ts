/**
 * Read-only views of the trust layer for the run monitor and Gym pages:
 * the onchain grader records (the SCC-shaped record Solana programs check),
 * Gym registry entries, payment channels, and what the sealed grader did with
 * each rollout of a channel.
 *
 * Everything here is read from devnet accounts, the grader's tab on disk, or
 * the grader's own event feed. Nothing is invented. Nothing secret is
 * returned: no answers, hidden checks, keys, model outputs or the RPC URL.
 */

import fs from "node:fs";
import { PublicKey } from "@solana/web3.js";
import { recentEvents } from "./events";
import { statePath } from "./files";
import { configPda, connection, graderPda, gymPda, hex, maybeDeployment, program, programId } from "./solana";

/* ---------- Small TTL cache (devnet reads are slow and rate limited) ---------- */

const g = globalThis as unknown as { __modelmon_verify_cache?: Map<string, { at: number; value: Promise<unknown> }> };
const cache = (g.__modelmon_verify_cache ??= new Map());

function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load().catch((err) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, { at: Date.now(), value });
  return value;
}

/* ---------- Off-chain facts the onchain record cannot carry ---------- */

/**
 * Gyms registered on devnet outside the local deployment file (the Phala TDX
 * grader's Gym). Only the id is listed here; every value shown is read onchain.
 */
const EXTRA_GYMS = ["solana-transactions-tdx"];

/**
 * The attestation authority's off-chain check of a hardware report, where one
 * was published. The onchain record carries hardware, code hash, slot and
 * expiry, not the quote verification itself.
 */
const OFFCHAIN_CHECKS: Record<string, { by: string; checksum: string; url: string }> = {
  ESnVHdtwfohnU4Cx6J4R3FutddQFFWSTSQfHqgpHGcz: {
    by: "Phala DCAP verification service",
    checksum: "687a91da8dbf23791b24d7a3877d6e669a724dafafd2de12983ec96835d05dfc",
    url: "https://proof.t16z.com/reports/687a91da8dbf23791b24d7a3877d6e669a724dafafd2de12983ec96835d05dfc",
  },
};

const HARDWARE = ["none", "tdx", "sev-snp"] as const;
export type HardwareName = (typeof HARDWARE)[number];

/* ---------- Program config ---------- */

export type ConfigView = {
  address: string;
  attestationAuthority: string;
  allowUnattested: boolean;
  timelockSecs: number;
  approved: string[];
  mint: string;
  treasury: string;
};

export function configView(): Promise<ConfigView> {
  return cached("config", 15_000, async () => {
    const c = await program().account.config.fetch(configPda());
    return {
      address: configPda().toBase58(),
      attestationAuthority: c.attestationAuthority.toBase58(),
      allowUnattested: c.allowUnattested,
      timelockSecs: c.timelockSecs.toNumber(),
      approved: c.approved.map((h) => hex(h)),
      mint: c.mint.toBase58(),
      treasury: c.treasury.toBase58(),
    };
  });
}

/* ---------- Grader records ---------- */

export type GraderView = {
  key: string;
  record: string;
  exists: boolean;
  hardware?: HardwareName;
  /** Who wrote the record: an attestation authority today; "scc" once SCC's program is public. */
  source?: "attestation-authority" | "scc";
  codeHash?: string;
  reportSlot?: number;
  expiresAt?: number;
  /** Not expired, at the time of the read. */
  live: boolean;
  /** The record's code hash is on the program's approved list. */
  approved: boolean;
  /** The program accepts hardware = none only while the devnet config allows it. */
  acceptedBecauseDevnet: boolean;
  offchainCheck?: { by: string; checksum: string; url: string };
};

export function graderView(key: string): Promise<GraderView> {
  return cached("grader:" + key, 10_000, async () => {
    const grader = new PublicKey(key);
    const [rec, config] = await Promise.all([
      program().account.graderRecord.fetchNullable(graderPda(grader)),
      configView(),
    ]);
    const base = { key, record: graderPda(grader).toBase58(), offchainCheck: OFFCHAIN_CHECKS[key] };
    if (!rec) return { ...base, exists: false, live: false, approved: false, acceptedBecauseDevnet: false };
    const codeHash = hex(rec.codeHash);
    const expiresAt = rec.expiresAt.toNumber();
    const hardware = HARDWARE[rec.hardware] ?? "none";
    return {
      ...base,
      exists: true,
      hardware,
      source: rec.source === 1 ? "scc" : "attestation-authority",
      codeHash,
      reportSlot: rec.reportSlot.toNumber(),
      expiresAt,
      live: expiresAt > Date.now() / 1000,
      approved: config.approved.includes(codeHash),
      acceptedBecauseDevnet: hardware === "none" && config.allowUnattested,
    };
  });
}

/* ---------- Gyms ---------- */

export type GymChainView = {
  gymId: string;
  address: string;
  grader: string;
  graderVersion: string;
  pricePerRep: number;
  split: { leaderBps: number; contributorBps: number; platformBps: number };
  trainTasks: number;
  heldoutTasks: number;
  exclusiveUntil: number | null;
  leader: string;
};

export function gymChainView(gymId: string): Promise<GymChainView | null> {
  return cached("gym:" + gymId, 20_000, async () => {
    const a = await program().account.gym.fetchNullable(gymPda(gymId));
    if (!a) return null;
    const until = a.exclusiveUntil.toNumber();
    return {
      gymId: a.gymId,
      address: gymPda(gymId).toBase58(),
      grader: a.grader.toBase58(),
      graderVersion: hex(a.graderVersion),
      pricePerRep: Number(a.pricePerRep.toString()) / 1e6,
      split: { leaderBps: a.leaderBps, contributorBps: a.contributorBps, platformBps: a.platformBps },
      trainTasks: a.trainTasks,
      heldoutTasks: a.heldoutTasks,
      exclusiveUntil: until > Date.now() / 1000 ? until : null,
      leader: a.leader.toBase58(),
    };
  });
}

export async function gymVerification(gymId: string) {
  const gym = await gymChainView(gymId);
  if (!gym) return null;
  const [grader, config] = await Promise.all([graderView(gym.grader), configView()]);
  return { programId: programId().toBase58(), gym, grader, config };
}

/** Every grader on the program the app knows about, with the Gyms each one holds. */
export function trustOverview() {
  return cached("overview", 15_000, async () => {
    const ids = [...new Set([...Object.keys(maybeDeployment()?.gyms ?? {}), ...EXTRA_GYMS])];
    const gyms = (await Promise.all(ids.map((id) => gymChainView(id).catch(() => null)))).filter(
      (x): x is GymChainView => !!x,
    );
    const keys = [...new Set(gyms.map((x) => x.grader))];
    const graders = await Promise.all(keys.map((k) => graderView(k)));
    return {
      programId: programId().toBase58(),
      config: await configView(),
      graders: graders.map((v) => ({ ...v, gyms: gyms.filter((x) => x.grader === v.key).map((x) => ({ id: x.gymId, address: x.address })) })),
    };
  });
}

/* ---------- Channels and rollouts ---------- */

type Tab = {
  channel: string;
  gymId: string;
  trainer: string;
  deposit: string;
  cumulative: string;
  signature?: string;
  reps: number;
  groups: { at: string; reps: number; mean: number; cumulative: string }[];
  flags: { at: string; rollout: string; taskId: string; reason: string }[];
  settled?: { tx: string; amount: string; leader: string; contributors: string; platform: string; refund?: string };
};

let tabCache: { mtime: number; tabs: Record<string, Tab> } | null = null;
function readTab(channel: string): Tab | undefined {
  const file = statePath("enclave", "grader-tabs.json");
  try {
    const mtime = fs.statSync(file).mtimeMs;
    if (!tabCache || tabCache.mtime !== mtime) tabCache = { mtime, tabs: JSON.parse(fs.readFileSync(file, "utf8")) };
    return tabCache.tabs[channel];
  } catch {
    return undefined;
  }
}

/** Transactions that touched the channel account: its opening deposit, the settlement, and any refused attempts. */
function channelHistory(channel: string) {
  return cached("history:" + channel, 20_000, async () => {
    const sigs = await connection().getSignaturesForAddress(new PublicKey(channel), { limit: 40 }, "confirmed");
    return sigs.map((s) => ({ signature: s.signature, ok: !s.err, at: s.blockTime ? s.blockTime * 1000 : null }));
  });
}

export type SandboxStatus = "grading" | "scored" | "flagged" | "error";
export type Sandbox = {
  /** Position in the channel's tab, counted from the first graded rollout. Stable, used in URLs. */
  rep: number;
  group: number;
  /** The trainer's rollout id within its group, when known. */
  id?: string;
  status: SandboxStatus;
  /** This rollout's own reward, from the grader's response. */
  reward?: number;
  /** Mean of its group, when the per-rollout reward is no longer in the grader's recent feed. */
  groupMean?: number;
  at: number;
};

type ScoredEvent = { at: number; groupId?: string; taskId?: string; reps: number; rewards: { id: string; status: string; reward: number | null }[] };

function feedFor(channel: string) {
  const scored: ScoredEvent[] = [];
  const requests: { at: number; groupId?: string; taskId?: string; rollouts: number }[] = [];
  const timing = new Map<string, number>();
  for (const e of recentEvents()) {
    const d = e.data as Record<string, unknown> | undefined;
    if (!d || d.channel !== channel) continue;
    const at = Date.parse(e.at);
    if (e.kind === "grade.request") {
      requests.push({ at, groupId: d.groupId as string | undefined, taskId: d.taskId as string | undefined, rollouts: Number(d.rollouts) || 0 });
    } else if (e.kind === "grade.scored") {
      scored.push({ at, groupId: d.groupId as string | undefined, taskId: d.taskId as string | undefined, reps: Number(d.reps), rewards: (d.rewards as ScoredEvent["rewards"]) ?? [] });
      const req = [...requests].reverse().find((r) => r.groupId === d.groupId && r.at <= at);
      if (req) timing.set(String(d.reps), at - req.at);
    }
  }
  // A request with no score after it is still inside the grader.
  const inFlight = requests.filter((r) => !scored.some((s) => s.at >= r.at && s.groupId === r.groupId));
  return { scored, inFlight, timing };
}

const usd = (base: string | number) => Number(base) / 1e6;

export async function channelView(channel: string, opts: { limit?: number; rep?: number } = {}) {
  const tab = readTab(channel);
  if (!tab) return null;
  const limit = Math.max(1, Math.min(60, opts.limit ?? 30));
  const feed = feedFor(channel);
  const byEnd = new Map(feed.scored.map((s) => [s.reps, s]));

  const groups = tab.groups.map((grp, i) => {
    const start = i ? tab.groups[i - 1].reps : 0;
    const prevCum = i ? tab.groups[i - 1].cumulative : "0";
    const at = Date.parse(grp.at);
    const prevAt = i ? Date.parse(tab.groups[i - 1].at) : 0;
    return {
      index: i + 1,
      start,
      end: grp.reps,
      size: grp.reps - start,
      mean: grp.mean,
      at,
      cumulative: usd(grp.cumulative),
      charged: usd(grp.cumulative) - usd(prevCum),
      scored: byEnd.get(grp.reps),
      flags: tab.flags.filter((f) => {
        const t = Date.parse(f.at);
        return t <= at && t > prevAt;
      }),
      latencyMs: feed.timing.get(String(grp.reps)),
    };
  });

  function sandboxes(grp: (typeof groups)[number]): Sandbox[] {
    if (grp.scored && grp.scored.rewards.length === grp.size) {
      return grp.scored.rewards.map((r, i) => ({
        rep: grp.start + i + 1,
        group: grp.index,
        id: r.id,
        status: r.status === "flagged" ? "flagged" : r.status === "error" ? "error" : "scored",
        reward: r.reward ?? undefined,
        at: grp.at,
      }));
    }
    // Older groups: the tab keeps the group mean and the flagged rollout ids, not each reward.
    const flagged = grp.flags.map((f) => f.rollout);
    return Array.from({ length: grp.size }, (_, i) => {
      const id = flagged[i];
      return {
        rep: grp.start + i + 1,
        group: grp.index,
        id,
        status: id ? ("flagged" as const) : ("scored" as const),
        groupMean: id ? undefined : grp.mean,
        at: grp.at,
      };
    });
  }

  const recent: Sandbox[] = feed.inFlight
    .flatMap((r, k) =>
      Array.from({ length: r.rollouts }, (_, i) => ({
        rep: tab.reps + feed.inFlight.slice(0, k).reduce((n, x) => n + x.rollouts, 0) + i + 1,
        group: groups.length + k + 1,
        status: "grading" as const,
        at: r.at,
      })),
    )
    .reverse();
  for (let i = groups.length - 1; i >= 0 && recent.length < limit; i--) {
    recent.push(...sandboxes(groups[i]).reverse());
  }
  recent.splice(limit);

  let focus = null;
  if (opts.rep !== undefined) {
    const grp = groups.find((x) => opts.rep! > x.start && opts.rep! <= x.end);
    if (grp) {
      const box = sandboxes(grp).find((b) => b.rep === opts.rep)!;
      const flag = box.id ? grp.flags.find((f) => f.rollout === box.id) : undefined;
      focus = {
        sandbox: box,
        group: {
          index: grp.index,
          trainerGroupId: grp.scored?.groupId,
          size: grp.size,
          mean: grp.mean,
          at: grp.at,
          firstRep: grp.start + 1,
          lastRep: grp.end,
          latencyMs: grp.latencyMs,
          rewards: grp.scored?.rewards.map((r) => ({ status: r.status, reward: r.reward })),
        },
        taskId: grp.scored?.taskId ?? flag?.taskId,
        flagReason: flag?.reason,
        voucher: { before: grp.cumulative - grp.charged, after: grp.cumulative, charged: grp.charged },
      };
    }
  }

  const [account, history] = await Promise.all([
    program().account.channel.fetchNullable(new PublicKey(channel)).catch(() => null),
    channelHistory(channel).catch(() => []),
  ]);
  const succeeded = history.filter((h) => h.ok);
  const opened = succeeded.at(-1);
  const settleTx = tab.settled?.tx;
  return {
    channel,
    gymId: tab.gymId,
    trainer: tab.trainer,
    deposit: usd(tab.deposit),
    cumulative: usd(tab.cumulative),
    reps: tab.reps,
    groups: groups.length,
    flagged: tab.flags.length,
    /** The trainer's latest signed running total: a public signed message, not a secret. */
    latestVoucher: tab.signature ? { cumulative: usd(tab.cumulative), signature: tab.signature } : null,
    open: !!account,
    openTx: opened?.signature ?? null,
    expiresAt: account ? account.expiresAt.toNumber() : null,
    refused: history.filter((h) => !h.ok).map((h) => ({ signature: h.signature, at: h.at })),
    settled: tab.settled
      ? {
          tx: settleTx!,
          amount: usd(tab.settled.amount),
          leader: usd(tab.settled.leader),
          contributors: usd(tab.settled.contributors),
          platform: usd(tab.settled.platform),
          refund: tab.settled.refund !== undefined ? usd(tab.settled.refund) : usd(tab.deposit) - usd(tab.settled.amount),
        }
      : null,
    meanHistory: groups.slice(-40).map((x) => ({ group: x.index, mean: x.mean })),
    inFlight: feed.inFlight.reduce((n, r) => n + r.rollouts, 0),
    recent,
    focus,
  };
}

export type ChannelView = NonNullable<Awaited<ReturnType<typeof channelView>>>;
