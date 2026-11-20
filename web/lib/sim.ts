/**
 * The seam where the sealed grader goes.
 *
 * A real run is a trainer's cluster sending groups of rollouts to
 * POST /v1/gyms/{id}/grade inside a TEE and getting rewards back. Here the
 * whole thing is simulated: progress is a pure function of how long the run
 * has been going, so the server stores almost nothing and never has to tick.
 */

import { SPLIT } from "./chain";
import type { Evolution, Gym, RunEvent, RunRecord, RunSnapshot } from "./types";

/** GRPO-style groups: one prompt, sixteen rollouts, graded together. */
export const GROUP_SIZE = 16;
/** Demo speed. A real RL step takes minutes; here any budget is used up in about a minute. */
export const SECONDS_TO_SPEND_BUDGET = 70;

function hash(str: string): number {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Deterministic noise in [-1, 1] for a given run and step. */
function noise(seed: string, step: number): number {
  return (hash(`${seed}:${step}`) / 0xffffffff) * 2 - 1;
}

/** Mean reward on the training set, given the share of the budget used. Rises fast, then flattens. */
export function rewardAt(seed: string, progress: number): number {
  const learned = 0.08 + 0.38 * (1 - Math.exp(-3 * progress));
  return Math.max(0, Math.min(1, learned + noise(seed, Math.floor(progress * 60)) * 0.012));
}

function eventsFor(run: RunRecord, maxReps: number): RunEvent[] {
  const marks = [0.19, 0.63].map((f, i) => f + noise(run.id, 900 + i) * 0.04);
  return marks.map((f, i) => ({
    atRep: Math.floor((maxReps * f) / GROUP_SIZE) * GROUP_SIZE,
    kind: "disqualified",
    rollout: `r${(hash(`${run.id}:${i}`) % GROUP_SIZE) + 1}`,
    reason: i === 0 ? "looked for the grader" : "tried to read another model's graded answer",
  }));
}

export function snapshot(run: RunRecord, gym: Gym, now = Date.now()): RunSnapshot {
  const maxReps = Math.floor(run.budget / gym.pricePerRep / GROUP_SIZE) * GROUP_SIZE;
  const seconds = Math.max(0, ((run.endedAt ?? now) - run.startedAt) / 1000);
  const groups = Math.floor(((seconds / SECONDS_TO_SPEND_BUDGET) * maxReps) / GROUP_SIZE);
  const reps = Math.min(maxReps, groups * GROUP_SIZE);
  const progress = maxReps ? reps / maxReps : 0;
  const spent = reps * gym.pricePerRep;

  const points = 48;
  const history = Array.from({ length: points + 1 }, (_, i) => {
    const share = i / points;
    return { reps: Math.round(reps * share), reward: rewardAt(run.id, progress * share) };
  });

  return {
    ...run,
    status: run.settlement ? "settled" : reps >= maxReps ? "budget-spent" : "training",
    reps,
    maxReps,
    spent,
    leaderEarned: spent * SPLIT.leader,
    meanReward: rewardAt(run.id, progress),
    history,
    events: eventsFor(run, maxReps).filter((e) => e.atRep <= reps),
  };
}

/**
 * The sealed test: held-out tasks the model has never seen, scored before and
 * after. `before` is the model's last sealed score at this Gym, or its
 * untrained baseline. The gain shrinks as the score nears the ceiling.
 */
export function simulatedSealedScore(before:number,progress:number){
  return before+Math.round((95-before)*.75*(1-Math.exp(-2.5*progress)));
}
export function sealedTest(
  run: RunRecord,
  progress: number,
  before: number,
  transferGymName: string,
): Omit<Evolution, "fromHash" | "toHash" | "attestationTx"> {
  const gain = simulatedSealedScore(before,progress)-before;
  return {
    before,
    after: before + gain,
    ci: 6,
    transfer: { gymName: transferGymName, before: 33, after: 33 + Math.round(gain * 0.38) },
    regression: { before: 71, after: 71 - (hash(run.id) % 2) },
    evolved: gain >= 20,
  };
}

/** A model's score at a Gym before it has ever trained there. */
export const BASELINE = 41;

export function newHash(seed: string): string {
  return hash(seed).toString(16).padStart(8, "0").slice(0, 3);
}
