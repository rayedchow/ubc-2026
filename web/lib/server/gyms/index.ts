/**
 * The Gyms this grader can hold. Each brings its task generator (creator
 * side), public view, grader and "solved" rule (grader side).
 */

import { GYM_ID as TX_GYM_ID, generateTasks, gradeRollout, publicPart, solved, type Grade } from "./solana-tx";
import { GUARD_GYM_ID, generateGuardTasks, gradeGuard, guardPublicPart, guardSolved } from "./solana-guard";
import {
  REWARD_HACK_GYM_ID,
  REWARD_HACK_V2_GYM_ID,
  generateRewardHackTasks,
  generateRewardHackV2Tasks,
  gradeRewardHack,
  rewardHackSolved,
  rhPublicPart,
} from "./reward-hack";

// Tasks are stored as plain JSON in sealed bundles, so the registry works on loose shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTask = any;

export type GymModule = {
  id: string;
  generate: () => AnyTask[];
  publicPart: (t: AnyTask) => AnyTask;
  grade: (t: AnyTask, output: string) => Grade;
  solved: (g: Grade) => boolean;
  /** USDC base units per graded rollout. */
  pricePerRep: bigint;
};

export const GYM_MODULES: Record<string, GymModule> = {
  [TX_GYM_ID]: { id: TX_GYM_ID, generate: () => generateTasks(20), publicPart, grade: gradeRollout, solved, pricePerRep: BigInt(20_000) },
  [GUARD_GYM_ID]: {
    id: GUARD_GYM_ID,
    generate: () => generateGuardTasks(240),
    publicPart: guardPublicPart,
    grade: gradeGuard,
    solved: guardSolved,
    pricePerRep: BigInt(1_000),
  },
  [REWARD_HACK_GYM_ID]: {
    id: REWARD_HACK_GYM_ID,
    generate: () => generateRewardHackTasks(300),
    publicPart: rhPublicPart,
    grade: gradeRewardHack,
    solved: rewardHackSolved,
    pricePerRep: BigInt(1_000),
  },
  [REWARD_HACK_V2_GYM_ID]: {
    id: REWARD_HACK_V2_GYM_ID,
    generate: () => generateRewardHackV2Tasks(300),
    publicPart: rhPublicPart,
    grade: gradeRewardHack,
    solved: rewardHackSolved,
    pricePerRep: BigInt(1_000),
  },
};

export function gymModule(id: string): GymModule {
  const m = GYM_MODULES[id];
  if (!m) throw new Error(`This grader has no checker for ${id}.`);
  return m;
}
