import { SPLIT } from "./chain";
import type { MonitorEvent, MonitorRun, Worker } from "./run-monitor";

// A read-only, one-minute walkthrough. Its clock and balances are independent of trainer accounts.
export function sampleRun(origin: number, now = Date.now()): MonitorRun {
  const elapsed = Math.max(0, now - origin) % 60_000,
    startedAt = now - elapsed;
  const workers = ["worker-01", "worker-02", "worker-03"];
  const operators = ["mira", "rowan", "mira"];
  const events: MonitorEvent[] = [];
  function emit(t: number, e: Omit<MonitorEvent, "at" | "seq">) {
    if (t <= elapsed) events.push({ ...e, at: startedAt + t, seq: events.length });
  }
  emit(0, { kind: "opened", trainer: operators[0] });
  emit(100, { kind: "registered" });
  emit(250, { kind: "funded", amount: 10 });
  const history: MonitorRun["history"] = [];
  const rolloutScores: MonitorRun["history"] = [];
  const counts = [0, 0, 0],
    states: Worker["state"][] = ["Waiting", "Waiting", "Waiting"];
  const checkpoint = "demo-policy-12";
  for (let batch = 1; batch <= 12; batch++) {
    const begin = 400 + (batch - 1) * 3700,
      index = (batch - 1) % workers.length;
    const group = "reconciliation-" + String(batch).padStart(3, "0"),
      worker = workers[index];
    // Each mock rollout earns a score on a sixteen-check rubric. Grading and the chart share these scores.
    const scores = Array.from({ length: 16 }, (_, index) => {
      const reps = (batch - 1) * 16 + index + 1;
      const fraction = 0.4 + batch * 0.029 + 0.2 * Math.sin(reps * 2.17) + 0.13 * Math.cos(reps * 0.73);
      return { reps, reward: Math.round(Math.min(1, Math.max(0, fraction)) * 16) / 16 };
    });
    const reward = scores.reduce((sum, p) => sum + p.reward, 0) / scores.length;
    emit(begin, { kind: "dispatched", group, worker });
    emit(begin + 1600, { kind: "submitted", group, worker });
    emit(begin + 2600, { kind: "voucher", group, amount: batch * 0.8 });
    emit(begin + 2600, { kind: "graded", group, worker, reps: 16, reward, latencyMs: 1000 });
    emit(begin + 3100, { kind: "optimized", group, worker });
    if (elapsed >= begin && elapsed < begin + 2600)
      states[index] = elapsed < begin + 1600 ? "Generating" : "Grading";
    if (elapsed >= begin + 2600) {
      rolloutScores.push(...scores);
      history.push({ reps: batch * 16, reward });
      counts[index] += 16;
    }
  }
  emit(45_000, { kind: "checkpoint", trainer: operators[0] });
  emit(47_000, { kind: "settled", amount: 9.6 });
  emit(52_000, { kind: "evaluated" });
  emit(53_000, { kind: "attested" });
  const reps = counts.reduce((a, b) => a + b, 0),
    accepted = reps * 0.05;
  return {
    id: "sample",
    source: "Sample run",
    startedAt,
    gymId: "accounting",
    gym: "Accounting Gym",
    skills: ["Reconciliation"],
    model: { id: "sample-qwen", name: "Qwen3.8-27B", head: "relay", trainer: operators[0] },
    status: elapsed < 45_000 ? "Training" : elapsed < 52_000 ? "Evaluating" : "Completed",
    checkpoint,
    graderVersion: "demo-grader-v1.0",
    step: events.filter((e) => e.kind === "optimized").length,
    reps,
    target: 192,
    budget: 10,
    accepted,
    reserved: states.includes("Grading") ? 0.8 : 0,
    settled: elapsed >= 47_000 ? 9.6 : 0,
    split:
      elapsed >= 47_000
        ? {
            leader: 9.6 * SPLIT.leader,
            contributors: 9.6 * SPLIT.contributors,
            platform: 9.6 * SPLIT.platform,
          }
        : undefined,
    workers: workers.map((id, i) => ({
      id,
      trainer: operators[i],
      heartbeatAt: startedAt + Math.floor(Math.min(45_000, elapsed) / 2000) * 2000,
      state: elapsed >= 45_000 ? "Finished" : states[i],
      checkpoint,
      reps: counts[i],
    })),
    history,
    rolloutScores,
    events,
    attestation: "Sample only",
    evaluation: elapsed >= 52_000 ? { before: 43, after: 64 } : undefined,
  };
}
