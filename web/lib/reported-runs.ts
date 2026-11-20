import "server-only";
import { z } from "zod";
import { atlasDatabase } from "./atlas-registry";
import { BOT_HEADS } from "./looks";
import { eventLabels, runStatuses, type EventKind, type MonitorRun } from "./run-monitor";
import { ServiceError } from "./service";

const label = z.string().trim().min(1).max(120);
const id = z.string().regex(/^[a-zA-Z0-9._-]{1,80}$/);
const count = z.int().min(0);
const amount = z.number().nonnegative();
const timestamp = z.int().positive().max(8.64e15);
const checkpoint = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const event = z
  .object({
    seq: count,
    at: timestamp,
    kind: z.enum(Object.keys(eventLabels) as [EventKind, ...EventKind[]]),
    group: label.optional(),
    trainer: label.optional(),
    worker: id.optional(),
    reps: count.optional(),
    reward: z.number().optional(),
    amount: amount.optional(),
    latencyMs: amount.optional(),
    signature: z
      .string()
      .regex(/^[1-9A-HJ-NP-Za-km-z]{86,88}$/)
      .optional(),
  })
  .strict()
  .refine((e) => e.reward === undefined || e.kind === "graded", "Rewards belong to successful grades.");
const rewardSeries = z.array(z.object({ reps: count, reward: z.number() }).strict()).max(512);
const graderSeries = z.array(z.object({ reps: count, score: z.number() }).strict()).max(512);
const report = z
  .object({
    revision: count,
    id,
    startedAt: timestamp,
    status: z.enum(runStatuses),
    gymId: id,
    gym: label,
    model: z.object({ id, name: label, head: z.enum(BOT_HEADS).default("relay") }).strict(),
    skills: z.array(label).max(128),
    checkpoint,
    graderVersion: checkpoint,
    reps: count,
    target: count.optional(),
    budget: amount.optional(),
    accepted: amount.optional(),
    reserved: amount.optional(),
    settled: amount.optional(),
    step: count.optional(),
    attestation: z.enum(["SCC reported", "Off-chain authority reported", "Pending"]).optional(),
    history: rewardSeries.default([]),
    scoreHistory: graderSeries.optional(),
    rolloutScores: graderSeries.optional(),
    shareGradingVolume: z.boolean().optional(),
    workers: z
      .array(
        z
          .object({
            id,
            trainer: label.optional(),
            state: z.enum(["Waiting", "Generating", "Grading", "Offline", "Finished"]),
            checkpoint: checkpoint.optional(),
            reps: count.optional(),
            latencyMs: amount.optional(),
            task: id.optional(),
            heartbeatAt: timestamp.optional(),
          })
          .strict(),
      )
      .max(512)
      .default([]),
    events: z.array(event).max(512).default([]),
    evaluation: z
      .object({ before: z.number().min(0).max(100).optional(), after: z.number().min(0).max(100) })
      .strict()
      .optional(),
  })
  .strict();
function db() {
  const d = atlasDatabase();
  d.exec(
    "CREATE TABLE IF NOT EXISTS run_reports (trainer TEXT, id TEXT, revision INTEGER, payload TEXT, updated INTEGER, PRIMARY KEY(trainer,id))",
  );
  return d;
}
export function saveReport(trainer: string, body: unknown) {
  const result = report.safeParse(body);
  if (!result.success)
    throw new ServiceError(400, "Invalid telemetry field: " + result.error.issues[0].path.join("."));
  const r = result.data;
  if (new Set(r.events.map((e) => e.seq)).size !== r.events.length)
    throw new ServiceError(400, "Event sequence numbers must be unique.");
  const payload = JSON.stringify(r);
  const d = db();
  const updated = d
    .prepare(
      `INSERT INTO run_reports VALUES (?,?,?,?,?) ON CONFLICT(trainer,id) DO UPDATE SET
    revision=excluded.revision,payload=excluded.payload,updated=excluded.updated WHERE excluded.revision>run_reports.revision`,
    )
    .run(trainer, r.id, r.revision, payload, Date.now());
  if (
    !updated.changes &&
    d.prepare("SELECT payload FROM run_reports WHERE trainer=? AND id=?").get(trainer, r.id)?.payload !==
      payload
  )
    throw new ServiceError(409, "Send a newer run revision.");
  return { id: "external-" + r.id, revision: r.revision };
}
export function reportedRuns(trainer: string): MonitorRun[] {
  return db()
    .prepare("SELECT payload,updated FROM run_reports WHERE trainer=?")
    .all(trainer)
    .map((row) => {
      const r: z.infer<typeof report> = JSON.parse(String(row.payload));
      return {
        ...r,
        id: "external-" + r.id,
        source: "Reported",
        scoreHistory: r.scoreHistory?.map((p) => ({ reps: p.reps, reward: p.score })),
        rolloutScores: r.rolloutScores?.map((p) => ({ reps: p.reps, reward: p.score })),
        model: { ...r.model, trainer },
        updatedAt: Number(row.updated),
        events: r.events.sort((a, b) => a.seq - b.seq),
      };
    });
}

/** One cumulative amount per consenting trainer/run; local previews never contribute. */
export function publicGradingVolumeCents(gym: string) {
  const row = db()
    .prepare(
      `SELECT coalesce(sum(round(json_extract(payload,'$.accepted') * 100)), 0) AS cents
    FROM run_reports WHERE json_extract(payload,'$.gymId')=? AND json_extract(payload,'$.shareGradingVolume')=1`,
    )
    .get(gym);
  return Number(row?.cents ?? 0);
}
