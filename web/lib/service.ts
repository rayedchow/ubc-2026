/** Everything the API routes do. Routes stay thin; the rules live here. */

import { chain, SPLIT } from "./chain";
import { bands, type Difficulty } from "./realms";
import { GYMS, gymById } from "./gyms";
import { modelCard } from "./model-catalog";
import { botForLook, isPetLook } from "./looks";
import { BASELINE, newHash, sealedTest, snapshot as simSnapshot } from "./sim";
import { isDevnet } from "./server/env";
import { fundModelWallet, isLiveGym, liveProgress, sealedTestLiveRun, settleLiveRun, startLiveRun } from "./server/devnet-runs";
import { db, rivalBots } from "./store";
import type { Gym, LeagueRow, RankedBot, Model, RunRecord, RunSnapshot } from "./types";

/** Live (devnet) runs report what the grader actually returned; the rest are simulated. */
function snapshot(run: RunRecord, gym: Gym): RunSnapshot {
  const p = run.live ? liveProgress(run.id) : null;
  if (!p) return simSnapshot(run, gym);
  return {
    ...run,
    status: run.settlement ? "settled" : p.done ? "budget-spent" : "training",
    reps: p.reps,
    maxReps: p.maxReps,
    spent: p.spent,
    leaderEarned: p.spent * SPLIT.leader,
    meanReward: p.meanReward,
    history: p.history,
    events: p.events,
  };
}

export class ServiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const MIN_BUDGET = 10;
export const MAX_BUDGET = 1000;
export const MAX_DEPOSIT = 10000;

const money = (n: number) => Math.round(n * 100) / 100;

function mustGetRun(id: string) {
  const run = db.runs.get(id);
  if (!run)
    throw new ServiceError(404, "That run does not exist. Runs are cleared when the server restarts.");
  const gym = gymById(run.gymId);
  if (!gym) throw new ServiceError(404, "The Gym for this run no longer exists.");
  return { run, gym };
}

function mustGetModel(id: string): Model {
  const model = db.models.get(id);
  if (!model) throw new ServiceError(404, "That model does not exist.");
  return model;
}

function amount(value: unknown, min: number, max: number, what: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max)
    throw new ServiceError(400, `Set ${what} between $${min} and $${max.toLocaleString("en-US")}.`);
  return money(n);
}

/* ---------- Models ---------- */

export function listModels(): Model[] {
  return [...db.models.values()];
}

export function getModel(id: string): Model {
  return mustGetModel(id);
}

export async function createModel(input: {
  trainer?: unknown;
  name?: unknown;
  base?: unknown;
  look?: unknown;
  deposit?: unknown;
}): Promise<Model> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length < 2 || name.length > 48)
    throw new ServiceError(400, "Give the model a name of 2 to 48 characters.");
  const trainer =
    input.trainer === undefined
      ? "local"
      : typeof input.trainer === "string"
        ? input.trainer.trim().toLowerCase()
        : "";
  if (!/^[a-z0-9][a-z0-9._-]{0,31}$/.test(trainer))
    throw new ServiceError(
      400,
      "Use a trainer handle of 1–32 letters, digits, periods, dashes or underscores.",
    );
  if (rankingBots().some((m) => m.trainer === trainer && m.name.toLowerCase() === name.toLowerCase())) {
    throw new ServiceError(409, `You already have a model called ${name}. Pick a different name.`);
  }
  if (
    typeof input.base !== "string" ||
    (!modelCard(input.base) && !/^Open (3|7|14|32)B model$/.test(input.base))
  )
    throw new ServiceError(400, "Choose a base model.");
  if (!isPetLook(input.look)) throw new ServiceError(400, "Choose how the model looks.");
  const deposit =
    input.deposit === undefined || input.deposit === ""
      ? 0
      : amount(input.deposit, 0, MAX_DEPOSIT, "the first deposit");

  const id = `model-${crypto.randomUUID()}`;
  let vault: string;
  if (isDevnet()) {
    // Every model gets its own devnet wallet; the first deposit is minted as test USDC.
    try {
      vault = await fundModelWallet(id, deposit);
    } catch (err) {
      throw new ServiceError(502, `Could not create the model's devnet wallet: ${(err as Error).message}`);
    }
  } else {
    ({ vault } = await chain.createVault({ modelId: id }));
    if (deposit > 0) await chain.deposit({ vault, amount: deposit });
  }
  const model: Model = {
    id,
    name,
    trainer,
    hash: newHash(`${id}:${name}`),
    base: input.base as string,
    stage: "sprig",
    look: input.look,
    vault,
    credits: deposit,
    evals: [],
  };
  db.models.set(id, model);
  return model;
}

export function configureModel(id: string, input: unknown): Model {
  const model = mustGetModel(id);
  if (!input || typeof input !== "object") throw new ServiceError(400, "Provide the model settings.");
  const values = input as Record<string, unknown>;
  const name = typeof values.name === "string" ? values.name.trim() : "";
  if (name.length < 2 || name.length > 48)
    throw new ServiceError(400, "Give the model a name of 2 to 48 characters.");
  if (
    rankingBots().some(
      (b) => b.id !== id && b.trainer === model.trainer && b.name.toLowerCase() === name.toLowerCase(),
    )
  )
    throw new ServiceError(409, "This trainer already has a model with that name.");
  if (!isPetLook(values.look)) throw new ServiceError(400, "Choose a bot head.");
  const difficulty = values.difficulty as Difficulty,
    rollouts = values.rollouts;
  if (difficulty !== "Adaptive" && !bands.some((b) => b === difficulty))
    throw new ServiceError(400, "Choose a supported difficulty.");
  if (typeof rollouts !== "number" || ![4, 8, 16, 32].includes(rollouts))
    throw new ServiceError(400, "Choose a supported rollout count.");
  Object.assign(model, { name, look: values.look, trainingDefaults: { difficulty, rollouts } });
  return model;
}

export async function addCredits(id: string, input: { amount?: unknown }): Promise<Model> {
  const model = mustGetModel(id);
  const value = amount(input.amount, 1, MAX_DEPOSIT, "the deposit");
  if (isDevnet()) {
    // Real deposit: test USDC minted into the model's devnet wallet.
    try {
      model.vault = await fundModelWallet(model.id, value);
    } catch (err) {
      throw new ServiceError(502, `Could not fund the model's devnet wallet: ${(err as Error).message}`);
    }
  } else await chain.deposit({ vault: model.vault, amount: value });
  model.credits = money(model.credits + value);
  return model;
}

/* ---------- Runs ---------- */

export function listRuns(): RunSnapshot[] {
  return [...db.runs.values()]
    .flatMap((run) => {
      const gym = gymById(run.gymId);
      return gym ? [snapshot(run, gym)] : [];
    })
    .sort((a, b) => b.startedAt - a.startedAt);
}

export function getRun(id: string): RunSnapshot {
  const { run, gym } = mustGetRun(id);
  return snapshot(run, gym);
}

export async function startRun(input: {
  gymId?: unknown;
  modelId?: unknown;
  budget?: unknown;
}): Promise<RunSnapshot> {
  const gym = typeof input.gymId === "string" ? gymById(input.gymId) : undefined;
  if (!gym) throw new ServiceError(400, "Choose a Gym to train at.");
  const model = typeof input.modelId === "string" ? db.models.get(input.modelId) : undefined;
  if (!model) throw new ServiceError(400, "Choose a model to train.");
  const budget = amount(input.budget, MIN_BUDGET, MAX_BUDGET, "a budget");
  if (gym.status === "soon") throw new ServiceError(403, `${gym.name} is not open yet.`);
  // In production the TEE reads the licence from the chain and refuses the call itself.
  if (!(await chain.canTrain({ gymId: gym.id, exclusiveUntil: gym.exclusiveUntil }))) {
    throw new ServiceError(
      403,
      `${gym.name} is under an exclusive window until ${gym.exclusiveUntil}. Only the licence holder can train here.`,
    );
  }
  if (model.credits < budget) {
    throw new ServiceError(
      402,
      `${model.name}'s vault holds $${model.credits.toFixed(2)}, which is less than this $${budget.toFixed(2)} budget. Add credits or lower the budget.`,
    );
  }

  // The budget is held out of the vault for the length of the run; what is not spent comes back at settlement.
  model.credits = money(model.credits - budget);
  const id = `run-${db.nextRun++}`;
  const run: RunRecord = {
    id, gymId: gym.id, modelId: model.id, budget, checkpoint: model.hash,
    graderVersion: gym.graderVersion, vault: model.vault, startedAt: Date.now(),
  };
  if (isDevnet() && isLiveGym(gym.id)) {
    // Real run: the model's devnet wallet opens a payment channel and pays per rep over x402.
    try {
      const { vault } = await startLiveRun(run, gym.pricePerRep);
      run.vault = model.vault = vault;
      run.live = true;
    } catch (err) {
      model.credits = money(model.credits + budget);
      throw new ServiceError(502, `Could not start the run on devnet: ${(err as Error).message}`);
    }
  }
  db.runs.set(id, run);
  return snapshot(run, gym);
}

export async function settleRun(id: string): Promise<RunSnapshot> {
  const { run, gym } = mustGetRun(id);
  if (run.settlement) return snapshot(run, gym);
  if (run.live) {
    try {
      run.settlement = await settleLiveRun(run, SPLIT);
    } catch (err) {
      throw new ServiceError(409, (err as Error).message);
    }
    run.endedAt = Date.now();
    const m = db.models.get(run.modelId);
    if (m) m.credits = money(m.credits + run.budget - run.settlement.total);
    return snapshot(run, gym);
  }
  run.endedAt = Date.now();
  const spent = money(snapshot(run, gym).spent);
  const { tx } = await chain.settle({ vault: run.vault, amount: spent, split: SPLIT });
  run.settlement = {
    tx,
    total: spent,
    leader: spent * SPLIT.leader,
    contributors: spent * SPLIT.contributors,
    platform: spent * SPLIT.platform,
  };
  const model = db.models.get(run.modelId);
  if (model) model.credits = money(model.credits + run.budget - spent);
  return snapshot(run, gym);
}

export async function runSealedTest(id: string): Promise<RunSnapshot> {
  const { run, gym } = mustGetRun(id);
  if (!run.settlement) throw new ServiceError(409, "Settle the run before running the sealed evaluation.");
  if (run.evolution) throw new ServiceError(409, "This run has already used its sealed evaluation.");
  const model = mustGetModel(run.modelId);

  if (run.live) {
    let evo;
    try {
      evo = await sealedTestLiveRun(run);
    } catch (err) {
      throw new ServiceError(502, (err as Error).message);
    }
    run.evolution = evo;
    model.evals.push({ gymId: gym.id, at: new Date(run.startedAt).toISOString(), score: evo.before, hash: evo.fromHash, attestationTx: evo.attestationTx });
    model.evals.push({ gymId: gym.id, at: new Date().toISOString(), score: evo.after, hash: evo.toHash, attestationTx: evo.attestationTx });
    model.hash = evo.toHash;
    if (evo.evolved) model.stage = "bough";
    return snapshot(run, gym);
  }
  const snap = snapshot(run, gym);
  const before = model.evals.findLast((e) => e.gymId === gym.id)?.score ?? BASELINE;
  // Transfer is measured at a different creator's Gym so no single creator can influence it.
  const transferGym =
    GYMS.find(
      (g) =>
        g.id !== gym.id &&
        g.category === gym.category &&
        g.status === "open" &&
        g.leader.handle !== gym.leader.handle,
    ) ?? gym;
  const result = sealedTest(run, snap.maxReps ? snap.reps / snap.maxReps : 0, before, transferGym.name);
  const toHash = newHash(`${run.id}:${model.hash}`);
  const { tx } = await chain.attest({ kind: "improvement", payload: { run: run.id, ...result } });

  run.evolution = { ...result, fromHash: model.hash, toHash, attestationTx: tx };
  // The first sealed test at a Gym also records where the model started from.
  if (!model.evals.some((e) => e.gymId === gym.id)) {
    model.evals.push({
      gymId: gym.id,
      at: new Date(run.startedAt).toISOString(),
      score: before,
      hash: model.hash,
      attestationTx: tx,
    });
  }
  model.evals.push({
    gymId: gym.id,
    at: new Date().toISOString(),
    score: result.after,
    hash: toHash,
    attestationTx: tx,
  });
  model.hash = toHash;
  if (result.evolved) model.stage = "bough";
  return snapshot(run, gym);
}

/* ---------- Rankings ---------- */

export function rankingBots(): RankedBot[] {
  const result = (gymId: string, score: number) => ({ gymId, score, gymName: gymById(gymId)?.name ?? gymId });
  return [
    ...rivalBots.map((bot) => ({
      id: bot.id,
      name: bot.name,
      trainer: bot.trainer,
      head: bot.head,
      scores: bot.results.map(([id, score]) => result(id, score)),
    })),
    ...listModels().map((model) => ({
      id: model.id,
      name: model.name,
      trainer: model.trainer ?? "local",
      head: botForLook(model.look),
      scores: [...new Map(model.evals.map((e) => [e.gymId, e])).values()].map((e) =>
        result(e.gymId, e.score),
      ),
    })),
  ];
}
export function league(bots = rankingBots()): LeagueRow[] {
  return bots
    .flatMap((bot) =>
      bot.scores.map((e) => ({
        trainer: bot.trainer,
        model: bot.name,
        gymName: e.gymName,
        score: e.score,
        yours: bot.trainer === "local",
      })),
    )
    .sort((a, b) => b.score - a.score);
}
