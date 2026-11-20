import type { BotId } from "./looks";

export const runStatuses = [
  "Queued",
  "Training",
  "Paused",
  "Evaluating",
  "Ready to settle",
  "Ready to evaluate",
  "Completed",
  "Failed",
  "Stopped",
] as const;
export type MonitorStatus = (typeof runStatuses)[number];
export const isActiveRun = (status: MonitorStatus) =>
  status === "Queued" || status === "Training" || status === "Paused" || status === "Evaluating";

export const eventLabels = {
  opened: "Session opened",
  dispatched: "Trainer started a rollout group",
  submitted: "Trainer submitted a group",
  graded: "Group scored",
  flagged: "Rollout disqualified",
  error: "Grading error",
  timeout: "Grading timeout",
  optimized: "Trainer updated policy",
  checkpoint: "Trainer saved checkpoint",
  voucher: "Cumulative voucher accepted",
  registered: "Grader registered",
  verified: "Verification reported",
  funded: "Channel funded",
  attested: "Score attestation recorded",
  settled: "Channel settled",
  evaluated: "Sealed evaluation recorded",
  completed: "Training finished",
  rejected: "Rejected onchain",
} as const;
export type EventKind = keyof typeof eventLabels;
export const lanes = ["Trainer GPUs", "Sealed grader", "Solana"] as const;
export type Lane = (typeof lanes)[number];
export const laneFor = (kind: EventKind): Lane => {
  switch (kind) {
    case "opened":
    case "dispatched":
    case "submitted":
    case "optimized":
    case "checkpoint":
    case "completed":
      return "Trainer GPUs";
    case "registered":
    case "attested":
    case "verified":
    case "funded":
    case "settled":
    case "rejected":
      return "Solana";
    default:
      return "Sealed grader";
  }
};
export type MonitorEvent = {
  seq: number;
  at: number;
  kind: EventKind;
  group?: string;
  trainer?: string;
  worker?: string;
  reps?: number;
  reward?: number;
  amount?: number;
  latencyMs?: number;
  signature?: string;
};
export type MonitorModel = { id: string; name: string; head: BotId; trainer: string };
export type Worker = {
  id: string;
  trainer?: string;
  state: string;
  checkpoint?: string;
  reps?: number;
  latencyMs?: number;
  task?: string;
  heartbeatAt?: number;
};
export type RewardPoint = { reps: number; reward: number };
export type RunGymProfile = {
  name: string;
  domain?: string;
  byline: string;
  image: string;
  portrait: "avatar" | "logo";
  benchmark?: string;
};
export type MonitorRun = {
  id: string;
  model: MonitorModel;
  gym: string;
  gymId: string;
  gymProfile?: RunGymProfile;
  skills: string[];
  startedAt: number;
  source: "Atlas demo" | "Channel demo" | "Devnet" | "Reported" | "Sample run";
  status: MonitorStatus;
  updatedAt?: number;
  checkpoint?: string;
  graderVersion?: string;
  reps: number;
  target?: number;
  budget?: number;
  accepted?: number;
  reserved?: number;
  settled?: number;
  history: RewardPoint[];
  scoreHistory?: RewardPoint[];
  rolloutScores?: RewardPoint[];
  workers: Worker[];
  events: MonitorEvent[];
  step?: number;
  attestation?: string;
  evaluation?: { before?: number; after: number; transfer?: string; regression?: string };
  split?: { leader: number; contributors: number; platform: number };
  action?: "settle" | "test" | "evaluate";
  session?: string;
  /** Payment channel of a devnet run. */
  channel?: string;
};
export type RunRow = Pick<
  MonitorRun,
  "id" | "source" | "model" | "gym" | "skills" | "status" | "startedAt" | "reps" | "budget" | "accepted"
> & { workerCount: number; activeWorkers: number };
export type MonitorSnapshot = {
  at: number;
  trainer: string;
  canConnect: boolean;
  connected: boolean;
  models: MonitorModel[];
  runs: RunRow[];
  detail: MonitorRun | null;
};

export const coins = (n?: number) =>
  n === undefined ? "Unreported" : n.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " USDC";
