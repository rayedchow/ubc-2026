import { TRAINERS } from "./looks";
import { defaultPortrait, developers } from "./creator-profiles";
import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { realmGyms, stationProps, realms, bands, eligible, type Difficulty, type RealmGym } from "./realms";
import { CATEGORIES, gymById } from "./gyms";
import { gymSign } from "./benchmarks";
import type { RunGymProfile } from "./run-monitor";
import { getModel, rankingBots, ServiceError } from "./service";
import { botForLook } from "./looks";
import type { RankedBot } from "./types";
import { trainingExamples, type GymAttestations } from "./gym-data";
import { chain } from "./chain";
import { BASELINE, simulatedSealedScore } from "./sim";

let connection: DatabaseSync | undefined;
export { db as atlasDatabase };

function db() {
  if (connection) return connection;
  const dir = process.env.MODELMON_DATA_DIR ?? path.join(homedir(), ".local", "share", "modelmon");
  mkdirSync(dir, { recursive: true });
  const database = new DatabaseSync(path.join(dir, "atlas.sqlite"));
  database.exec(`PRAGMA busy_timeout=5000;
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS gyms (id TEXT PRIMARY KEY, definition TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, gym TEXT NOT NULL, request TEXT NOT NULL,
      amount_cents INTEGER NOT NULL, reps INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS transactions_gym ON transactions(gym);
    CREATE TABLE IF NOT EXISTS session_bots (session TEXT PRIMARY KEY, bot TEXT NOT NULL, profile TEXT NOT NULL, ready_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sealed_results (session TEXT PRIMARY KEY, bot TEXT NOT NULL, gym TEXT NOT NULL, score INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS evaluation_attestations (
      session TEXT PRIMARY KEY, reference TEXT NOT NULL, issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS model_submissions (
      id TEXT PRIMARY KEY, gym TEXT NOT NULL, task TEXT NOT NULL, bot TEXT NOT NULL, output TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS sealed_results_bot ON sealed_results(bot,gym);`);
  connection = database;
  return database;
}

const invalid = (message: string): never => {
  throw new ServiceError(400, message);
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid("Expected a JSON object.");
  return value as Record<string, unknown>;
}
function label(value: unknown, max: number, title: string) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    return invalid(`Enter a ${title} of 1–${max} characters.`);
  return value.trim();
}
function sampleInput(value: unknown) {
  if (value === undefined) return undefined;
  const input = object(value);
  if (JSON.stringify(input).length > 16000)
    return invalid("Keep each public sample input under 16,000 characters.");
  return input;
}
function count(value: unknown, title: string, max = 1_000_000_000) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max)
    return invalid(`Invalid ${title}.`);
  return value;
}
const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
export function listAtlasGyms(): RealmGym[] {
  const rows = db().prepare("SELECT definition FROM gyms ORDER BY rowid").all();
  const profiles = new Map(Object.values(developers).map((p) => [p.handle.toLowerCase(), p.avatar]));
  const gyms = rows.map((row) => {
    const gym: RealmGym = JSON.parse(String(row.definition));
    if (gym.creator) {
      const handle = gym.creator.handle.toLowerCase();
      const avatar = profiles.get(handle) ?? gym.creator.avatar;
      gym.creator = { ...gym.creator, avatar };
      profiles.set(handle, avatar);
    }
    return gym;
  });
  return [...realmGyms, ...gyms];
}
export function findAtlasGym(id: string): RealmGym | undefined {
  const builtIn = realmGyms.find((g) => g.id === id);
  if (builtIn) return builtIn;
  const row = db().prepare("SELECT definition FROM gyms WHERE id=?").get(id);
  if (!row) return undefined;
  const gym: RealmGym = JSON.parse(String(row.definition));
  if (gym.creator) gym.creator.avatar = creatorProfile(gym.creator.handle).avatar ?? gym.creator.avatar;
  return gym;
}
export function requireAtlasGym(id: string): RealmGym {
  const gym = findAtlasGym(id);
  if (!gym) throw new ServiceError(404, "Gym not found.");
  return gym;
}

/** Resolve the same Gym identity used by its map sign or registry entry. */
export function findRunGymProfile(id: string): RunGymProfile | undefined {
  const atlas = findAtlasGym(id);
  if (atlas) {
    const sign = gymSign(atlas);
    return {
      name: atlas.name,
      domain: realms.find((realm) => realm.id === atlas.realm)?.name,
      byline: sign.name,
      image: sign.image,
      portrait: sign.creator ? "avatar" : "logo",
      benchmark: sign.reference?.name,
    };
  }
  const gym = gymById(id);
  if (!gym) return;
  const { handle } = gym.leader;
  const avatar = creatorProfile(handle).avatar ?? defaultPortrait(handle);
  return {
    name: gym.name,
    domain: CATEGORIES.find((category) => category.id === gym.category)?.name,
    byline: "@" + handle,
    image: `/trainers/${avatar}.png`,
    portrait: "avatar",
  };
}
/** Read the original creator portrait, including previously published gym records. */
export function creatorProfile(handle: string) {
  const seeded = Object.values(developers).find(
    (profile) => profile.handle.toLowerCase() === handle.toLowerCase(),
  );
  if (seeded) return seeded;
  const prior = db()
    .prepare(
      "SELECT json_extract(definition, '$.creator.avatar') AS avatar FROM gyms WHERE json_extract(definition, '$.creator.handle') = ? COLLATE NOCASE ORDER BY rowid LIMIT 1",
    )
    .get(handle);
  return { handle, avatar: TRAINERS.find((sprite) => sprite === prior?.avatar) ?? null };
}
export function createAtlasGym(body: unknown) {
  const input = object(body),
    name = label(input.name, 72, "gym name");
  const realm = realms.find((r) => r.id === input.realm);
  if (!realm) return invalid("Choose a domain.");
  if (!Array.isArray(input.skills) || !input.skills.length || input.skills.length > 100)
    return invalid("Provide 1–100 training classes.");
  const ids = new Set<string>();
  const props = new Set(stationProps);
  const skills = input.skills.map((value: unknown) => {
    const s = object(value),
      name = label(s.name, 72, "class name"),
      id = slug(name) || `class-${ids.size + 1}`;
    if (ids.has(id)) return invalid("Class names must be distinct.");
    ids.add(id);
    if (typeof s.prop !== "string" || !props.has(s.prop))
      return invalid("Choose a supported station furnishing.");
    if (!Array.isArray(s.training) || s.training.length !== 3)
      return invalid("Supply the beginner, intermediate and advanced task counts.");
    if (
      s.additionalSamples !== undefined &&
      (!Array.isArray(s.additionalSamples) || s.additionalSamples.length > 15)
    )
      return invalid("Provide up to sixteen samples per class.");
    if (s.sampleInput !== undefined && !s.example) return invalid("Add a prompt for the sample input.");
    const additionalSamples = (s.additionalSamples as unknown[] | undefined)?.map((v) => {
      const sample = object(v);
      return { prompt: label(sample.prompt, 500, "sample prompt"), input: sampleInput(sample.input) };
    });
    return {
      id,
      name,
      prop: s.prop,
      sampleInput: sampleInput(s.sampleInput),
      additionalSamples,
      training: s.training.map((v) => count(v, "task count", 1_000_000)),
      example: s.example ? label(s.example, 500, "example") : "",
    };
  });
  const submittedCreator = input.creator === undefined ? null : object(input.creator);
  const handle = submittedCreator ? label(submittedCreator.handle, 32, "creator handle") : "local";
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(handle))
    return invalid("Use letters, numbers, dots, underscores or hyphens in the creator handle.");
  const gym: RealmGym = {
    creator: {
      handle,
      avatar:
        creatorProfile(handle).avatar ??
        TRAINERS.find((sprite) => sprite === submittedCreator?.avatar) ??
        defaultPortrait(handle),
    },
    id: slug(name) || `gym-${randomUUID()}`,
    name,
    realm: realm.id,
    description: input.description ? label(input.description, 400, "description") : "",
    skills,
    cents: count(input.cents ?? 0, "price in cents", 10000),
    development: count(input.development ?? 0, "development tasks"),
    heldOut: count(input.heldOut ?? 0, "evaluation tasks"),
  };
  if (
    gymById(gym.id) ||
    realmGyms.some((g) => g.id === gym.id) ||
    gym.id === "search" ||
    !db().prepare("INSERT OR IGNORE INTO gyms(id,definition) VALUES (?,?)").run(gym.id, JSON.stringify(gym))
      .changes
  )
    throw new ServiceError(409, "A gym already uses that name. Choose another.");
  return gym;
}

export function gymActivity(id: string) {
  const row = db()
    .prepare(
      "SELECT count(*) AS transactions, coalesce(sum(amount_cents),0) AS cents FROM transactions WHERE gym=?",
    )
    .get(id)!;
  return { transactions: Number(row.transactions), cents: Number(row.cents) };
}
export function demoGymAttestations(id: string): GymAttestations {
  const rows = db()
    .prepare(
      `SELECT a.reference,a.issued_at,r.score,s.profile FROM evaluation_attestations a
 JOIN sealed_results r ON r.session=a.session JOIN session_bots s ON s.session=a.session
 WHERE r.gym=? ORDER BY a.rowid DESC`,
    )
    .all(id);
  return {
    network: "demo",
    records: rows.map((r) => ({
      reference: String(r.reference),
      issuedAt: String(r.issued_at).replace(" ", "T") + "Z",
      score: Number(r.score),
      bot: JSON.parse(String(r.profile)).name,
    })),
  };
}

export function acceptModelSubmission(id: string, body: unknown) {
  const gym = requireAtlasGym(id),
    input = object(body);
  const task = trainingExamples(gym).find((t) => t.id === input.taskId);
  if (!task) throw new ServiceError(400, "Choose a published training example from this gym.");
  const bot = getModel(label(input.botId, 80, "bot ID"));
  const output = label(input.output, 32000, "model response");
  const submissionId = randomUUID();
  db()
    .prepare("INSERT INTO model_submissions(id,gym,task,bot,output) VALUES (?,?,?,?,?)")
    .run(submissionId, id, task.id, bot.id, output);
  return { id: submissionId, gymId: id, taskId: task.id, botId: bot.id, status: "received" };
}
export function recordSession(id: string, body: unknown) {
  const gym = requireAtlasGym(id),
    input = object(body);
  const key = label(input.requestId, 64, "request ID");
  const tasks = count(input.tasks, "task count"),
    rollouts = count(input.rollouts, "rollouts", 32);
  const difficulty = input.difficulty as Difficulty;
  if (
    !tasks ||
    ![4, 8, 16, 32].includes(rollouts) ||
    (difficulty !== "Adaptive" && !bands.some((b) => b === difficulty))
  )
    return invalid("Invalid session configuration.");
  if (
    !Array.isArray(input.skills) ||
    !input.skills.length ||
    !input.skills.every((s) => typeof s === "string")
  )
    return invalid("Select training classes.");
  const skills = [...new Set(input.skills as string[])].sort();
  const chosen = skills.map((s) => gym.skills.find((v) => v.id === s) ?? invalid("Unknown training class."));
  if (tasks > chosen.reduce((n, s) => n + eligible(s, difficulty), 0))
    return invalid("The selected classes have insufficient training tasks.");
  const bot = input.botId === undefined ? undefined : getModel(label(input.botId, 80, "bot ID"));
  const request = JSON.stringify([id, skills, difficulty, tasks, rollouts, ...(bot ? [bot.id] : [])]);
  const database = db();
  database.exec("BEGIN IMMEDIATE");
  try {
    const added = database
      .prepare("INSERT OR IGNORE INTO transactions(id,gym,request,amount_cents,reps) VALUES(?,?,?,?,?)")
      .run(key, id, request, tasks * rollouts * gym.cents, tasks * rollouts);
    if (database.prepare("SELECT request FROM transactions WHERE id=?").get(key)?.request !== request)
      throw new ServiceError(409, "Request ID already belongs to another session.");
    if (added.changes && bot) {
      const profile = {
        id: bot.id,
        name: bot.name,
        trainer: bot.trainer ?? "local",
        head: botForLook(bot.look),
        scores: [],
        checkpoint: bot.hash,
        startedAt: Date.now(),
      };
      database
        .prepare("INSERT INTO session_bots VALUES(?,?,?,?)")
        .run(key, bot.id, JSON.stringify(profile), profile.startedAt + 24_000);
    }
    database.exec("COMMIT");
  } catch (e) {
    database.exec("ROLLBACK");
    throw e;
  }
  return gymActivity(id);
}

export async function evaluateSession(id: string, body: unknown) {
  const gym = requireAtlasGym(id),
    session = label(object(body).requestId, 64, "session ID");
  if (!gym.heldOut) throw new ServiceError(409, "This gym has no held-out evaluation tasks.");
  const database = db();
  let score: number, bot: string;
  database.exec("BEGIN IMMEDIATE");
  try {
    const run = database
      .prepare(
        "SELECT s.bot, s.ready_at, t.reps FROM session_bots s JOIN transactions t ON t.id=s.session WHERE t.gym=? AND s.session=?",
      )
      .get(id, session);
    if (!run) throw new ServiceError(404, "This gym has no matching bot session.");
    if (Date.now() < Number(run.ready_at)) throw new ServiceError(409, "Training is still running.");
    let row = database.prepare("SELECT score FROM sealed_results WHERE session=?").get(session);
    if (!row) {
      const prior = database
        .prepare("SELECT score FROM sealed_results WHERE gym=? AND bot=? ORDER BY rowid DESC LIMIT 1")
        .get(id, run.bot);
      const score = simulatedSealedScore(
        Number(prior?.score ?? BASELINE),
        Math.min(1, Number(run.reps) / Math.max(1, gym.heldOut)),
      );
      database.prepare("INSERT INTO sealed_results VALUES(?,?,?,?)").run(session, run.bot, id, score);
      row = { score };
    }
    database.exec("COMMIT");
    score = Number(row.score);
    bot = String(run.bot);
  } catch (e) {
    database.exec("ROLLBACK");
    throw e;
  }
  if (!database.prepare("SELECT 1 FROM evaluation_attestations WHERE session=?").get(session)) {
    const { tx } = await chain.attest({
      kind: "badge",
      key: "atlas/" + session,
      payload: { gym: id, session, bot, score },
    });
    database
      .prepare("INSERT OR IGNORE INTO evaluation_attestations(session,reference) VALUES (?,?)")
      .run(session, tx);
  }
  return { score };
}
export function listLeagueBots(): RankedBot[] {
  const bots = new Map(rankingBots().map((b) => [b.id, b]));
  const names = new Map(listAtlasGyms().map((g) => [g.id, g.name]));
  const rows = db()
    .prepare(
      "SELECT r.bot,r.gym,r.score,s.profile FROM sealed_results r JOIN session_bots s ON s.session=r.session ORDER BY r.rowid",
    )
    .all();
  for (const row of rows) {
    const bot = bots.get(String(row.bot)) ?? (JSON.parse(String(row.profile)) as RankedBot);
    const id = String(row.gym);
    bot.scores = bot.scores.filter((s) => s.gymId !== id);
    bot.scores.push({ gymId: id, gymName: names.get(id) ?? id, score: Number(row.score) });
    bots.set(bot.id, bot);
  }
  return [...bots.values()];
}
