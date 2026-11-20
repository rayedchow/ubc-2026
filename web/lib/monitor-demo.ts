import "server-only";
import { atlasDatabase, listAtlasGyms } from "./atlas-registry";
import { botForLook } from "./looks";
import { gymById } from "./gyms";
import { listModels, listRuns } from "./service";
import { liveProgress } from "./server/devnet-runs";
import { externalRuns } from "./server/external-runs";
import { GROUP_SIZE, SECONDS_TO_SPEND_BUDGET, rewardAt } from "./sim";
import type { Model } from "./types";
import type { MonitorModel, MonitorRun } from "./run-monitor";

export function monitorModel(model: Model): MonitorModel {
  return { id: model.id, name: model.name, trainer: model.trainer ?? "local", head: botForLook(model.look) };
}

// Demo groups use the same clock and batch size as their source session. Only the latest groups are animated.
function demoGroups(run: MonitorRun, size: number, duration: number) {
  const target = run.target ?? 0;
  const groups = Math.floor(run.reps / size);
  const worker = "demo-worker";
  run.workers.push({
    id: worker,
    state: run.status === "Training" ? "Generating" : "Finished",
    checkpoint: run.checkpoint,
    reps: run.reps,
  });
  run.events.push({ seq: 0, at: run.startedAt, kind: "opened" });
  for (let n = Math.max(1, groups - 15); n <= groups; n++) {
    const at = run.startedAt + Math.ceil((duration * size * n) / target);
    const step = Math.min(120, (duration * size) / target / 3);
    const group = "batch-" + n;
    run.events.push(
      { seq: n * 4 - 2, at: Math.round(at - 2 * step), kind: "dispatched", group, worker },
      { seq: n * 4 - 1, at: Math.round(at - step), kind: "submitted", group, worker },
      {
        seq: n * 4,
        at,
        kind: "graded",
        group,
        worker,
        reps: size,
        reward: run.source === "Channel demo" ? rewardAt(run.id, (n * size) / target) : undefined,
      },
    );
  }
}

export function demoRuns(): MonitorRun[] {
  const models = new Map(listModels().map((m) => [m.id, monitorModel(m)]));
  const channelRuns = listRuns().flatMap((s) => {
    const model = models.get(s.modelId),
      gym = gymById(s.gymId);
    if (!model || !gym) return [];
    const run: MonitorRun = {
      id: s.id,
      model,
      gym: gym.name,
      gymId: gym.id,
      skills: [gym.taskType],
      source: "Channel demo",
      startedAt: s.startedAt,
      status: s.settlement
        ? s.evolution
          ? "Completed"
          : "Ready to evaluate"
        : s.status === "training"
          ? "Training"
          : "Ready to settle",
      reps: s.reps,
      target: s.maxReps,
      budget: s.budget,
      accepted: s.spent,
      reserved: 0,
      settled: s.settlement?.total ?? 0,
      split: s.settlement,
      checkpoint: s.checkpoint ?? s.evolution?.fromHash,
      graderVersion: s.graderVersion,
      history: s.reps ? s.history : [],
      workers: [],
      events: [],
      action: !s.settlement ? "settle" : !s.evolution ? "test" : undefined,
    };
    const live = s.live ? liveProgress(s.id) : null;
    if (live) {
      // A real devnet run: every event below happened, and Solana events carry their transaction signature.
      run.source = "Devnet";
      run.scoreHistory = run.history.filter((point) => point.reps > 0);
      run.rolloutScores = live.rolloutScores;
      run.attestation = "Off-chain authority reported";
      run.graderVersion = live.graderVersion ?? run.graderVersion;
      run.workers = [{ id: "devnet-trainer", state: live.done ? "Finished" : "Grading", reps: live.reps }];
      run.events = [...live.timeline];
      run.channel = live.channel;
      if (s.evolution) {
        const e = s.evolution;
        run.evaluation = { before: e.before, after: e.after, transfer: "Not measured on devnet yet", regression: "Not measured on devnet yet" };
      }
      return [run];
    }
    const duration = SECONDS_TO_SPEND_BUDGET * 1000;
    demoGroups(run, GROUP_SIZE, duration);
    s.events.forEach((e, i) => {
      run.events.push({
        seq: -(i + 1),
        kind: "flagged",
        at: s.startedAt + Math.round((duration * e.atRep) / (s.maxReps || 1)),
        group: "batch-" + Math.max(1, e.atRep / GROUP_SIZE),
        reps: 1,
      });
    });
    if (s.endedAt && s.settlement)
      run.events.push({ seq: -3, at: s.endedAt, kind: "settled", amount: s.settlement.total });
    if (s.evolution) {
      const e = s.evolution;
      run.evaluation = {
        before: e.before,
        after: e.after,
        transfer: e.transfer.gymName + " · " + e.transfer.before + "% to " + e.transfer.after + "%",
        regression: e.regression.before + "% to " + e.regression.after + "%",
      };
    }
    run.events.sort((a, b) => a.at - b.at);
    return [run];
  });

  const gyms = new Map(listAtlasGyms().map((g) => [g.id, g]));
  const rows = atlasDatabase()
    .prepare(
      `SELECT s.session,s.profile,s.ready_at,t.gym,t.request,t.reps,t.amount_cents,
    r.score,a.issued_at FROM session_bots s JOIN transactions t ON t.id=s.session
    LEFT JOIN sealed_results r ON r.session=s.session LEFT JOIN evaluation_attestations a ON a.session=s.session`,
    )
    .all();
  const atlasRuns = rows.flatMap((row) => {
    const gym = gyms.get(String(row.gym));
    if (!gym) return [];
    const profile = JSON.parse(String(row.profile)) as MonitorModel & {
      checkpoint?: string;
      startedAt?: number;
    };
    const [, skills, , , size] = JSON.parse(String(row.request)) as [
      string,
      string[],
      string,
      number,
      number,
    ];
    const readyAt = Number(row.ready_at),
      start = profile.startedAt ?? readyAt - 2400;
    const target = Number(row.reps),
      now = Date.now(),
      done = now >= readyAt;
    const reps = done
      ? target
      : size * Math.floor(((target / size) * Math.max(0, now - start)) / (readyAt - start));
    const evaluated = typeof row.score === "number",
      budget = Number(row.amount_cents) / 100;
    const run: MonitorRun = {
      id: "atlas-" + row.session,
      session: String(row.session),
      source: "Atlas demo",
      model: { id: profile.id, name: profile.name, head: profile.head, trainer: profile.trainer },
      checkpoint: profile.checkpoint,
      gymId: gym.id,
      gym: gym.name,
      skills: skills.map((id) => gym.skills.find((s) => s.id === id)?.name ?? id.replaceAll("-", " ")),
      startedAt: start,
      status: !done ? "Training" : gym.heldOut && !evaluated ? "Ready to evaluate" : "Completed",
      reps,
      target,
      budget,
      accepted: (reps * budget) / target,
      history: [],
      workers: [],
      events: [],
      action: done && gym.heldOut && !evaluated ? "evaluate" : undefined,
      evaluation: evaluated ? { after: Number(row.score) } : undefined,
    };
    demoGroups(run, size, readyAt - start);
    if (done) run.events.push({ seq: -1, kind: "completed", at: readyAt });
    if (row.issued_at)
      run.events.push({
        seq: -2,
        kind: "evaluated",
        at: Math.max(readyAt, Date.parse(String(row.issued_at).replace(" ", "T") + "Z")),
      });
    return [run];
  });
  // Real training jobs outside the app (Modal), read from the sealed grader's tabs.
  const external = externalRuns(models, (id) => gymById(id)?.name ?? id);
  return [...external, ...channelRuns, ...atlasRuns];
}
