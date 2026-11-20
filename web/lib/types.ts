/** Domain model shared by the mock backend and the UI. */

import type { PetLook } from "./looks";

export type CategoryId = "software" | "finance" | "expert" | "agents";
export type GymStatus = "open" | "exclusive" | "soon";

/** How a Gym decides a rollout's reward. These are the methods vendors actually use. */
export type GradingMethod = "Hidden tests" | "Reference diff" | "End-state check" | "Simulation" | "Expert rubric";

export type QualityCheck = { label: string; proves: string; passed: boolean };

export type LeaderSprite = "kestrel" | "heron" | "finch" | "wren" | "robin";

export type Gym = {
  id: string;
  name: string;
  category: CategoryId;
  /** Short label for the kind of work, e.g. "Code repair". */
  taskType: string;
  /** One sentence: what a model gets better at by training here. */
  purpose: string;
  /** Three example task prompts. Prompts are public; answers and tests are not. */
  sampleTasks: string[];
  grading: {
    method: GradingMethod;
    detail: string;
    /** True when an LLM judge is part of the grader, which needs extra validation. */
    usesJudge: boolean;
  };
  /** What the model works with inside its own sandbox. */
  tools: string[];
  /** How long one attempt is. */
  horizon: string;
  /** Who gets a return from training here. */
  bestFor: string;
  /** The industry practice this Gym mirrors. */
  groundedIn: string;
  /** Why current frontier models fail here: the capability gap the Gym measures. */
  whyHard: string;
  /** Shown on the card and used by the tag filter. Short, shared across Gyms. */
  tags: string[];
  /** Extra words people might search for. Never shown. */
  keywords: string[];
  leader: { handle: string; sprite: LeaderSprite };
  tier: 1 | 2 | 3 | 4 | 5;
  /** Pass-rate band of reference models, in percent. */
  passBand: [number, number];
  pricePerRep: number;
  graderVersion: string;
  codeHash: string;
  trainTasks: number;
  heldOutTasks: number;
  status: GymStatus;
  /** ISO date; only set while a lab holds an exclusive window. */
  exclusiveUntil?: string;
  checks: QualityCheck[];
  /** Aggregated, opt-in results from trainers. Null until anyone has trained here. */
  report: { models: number; medianGain: number; costPerPoint: number; regressionRate: number } | null;
  roof: string;
};

export type Category = { id: CategoryId; name: string; about: string };

export type SearchMode = "meaning" | "exact";
export type SearchHit = { id: string; score: number; why: string[] };

/** One sealed-test result. A model collects these over its post-training life. */
export type Eval = {
  gymId: string;
  /** ISO timestamp of the sealed test. */
  at: string;
  score: number;
  /** Checkpoint that was tested. */
  hash: string;
  attestationTx: string;
};

export type Model = {
  trainer: string;
  id: string;
  name: string;
  /** Short content hash of the current checkpoint. */
  hash: string;
  base: string;
  stage: "sprig" | "bough";
  look: PetLook;
  trainingDefaults?: {difficulty:import("./realms").Difficulty;rollouts:number};
  /** Each model pays for its own training from its own payment-channel vault. */
  vault: string;
  /** USDC currently available in the vault. Budgets of running runs are held out of this. */
  credits: number;
  evals: Eval[];
};

export type RunEvent = {
  atRep: number;
  kind: "disqualified";
  rollout: string;
  reason: string;
};

export type Settlement = {
  tx: string;
  total: number;
  leader: number;
  contributors: number;
  platform: number;
};

export type Evolution = {
  fromHash: string;
  toHash: string;
  before: number;
  after: number;
  ci: number;
  transfer: { gymName: string; before: number; after: number };
  regression: { before: number; after: number };
  attestationTx: string;
  evolved: boolean;
};

/** What the server stores for a run. Progress is derived from time, not stored. */
export type RunRecord = {
  id: string;
  gymId: string;
  modelId: string;
  budget: number;
  checkpoint?: string;
  graderVersion?: string;
  /** The model's vault that this run draws from. */
  vault: string;
  startedAt: number;
  endedAt?: number;
  settlement?: Settlement;
  evolution?: Evolution;
  /** True when this run is real: devnet payments, the sealed grader, onchain records. */
  live?: boolean;
};

/** What the UI receives: a run plus its progress at the moment of the request. */
export type RunSnapshot = RunRecord & {
  status: "training" | "budget-spent" | "settled";
  reps: number;
  maxReps: number;
  spent: number;
  leaderEarned: number;
  meanReward: number;
  history: { reps: number; reward: number }[];
  events: RunEvent[];
};

export type LeagueRow = { trainer: string; model: string; gymName: string; score: number; yours: boolean };

export type RankedBot = {
  id: string;
  name: string;
  trainer: string;
  head: import("./looks").BotId;
  scores: { gymId: string; gymName: string; score: number }[];
};
