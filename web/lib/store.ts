/**
 * In-memory mock database. It lives on globalThis so it survives hot reloads
 * in development; it resets when the server restarts. Replace with a real
 * database plus the onchain registry when the backend becomes real.
 */

import { fakeAddress } from "./chain";
import type { BotId } from "./looks";
import type { BaseModelName } from "./model-catalog";
import type { Eval, Model, RunRecord } from "./types";

type Db = { runs: Map<string, RunRecord>; models: Map<string, Model>; nextRun: number };

/** Past sealed tests for a seeded model: [gym, month in 2026, score]. */
function history(id: string, points: [gymId: string, month: number, score: number][]): Eval[] {
  return points.map(([gymId, month, score], i) => ({
    gymId,
    at: new Date(Date.UTC(2026, month - 1, 6 + ((i * 5) % 20))).toISOString(),
    score,
    hash: fakeAddress(`${id}:${i}`).slice(0, 3).toLowerCase(),
    attestationTx: fakeAddress(`attest:${id}:${i}`),
  }));
}

function seed(
  id: string,
  name: BaseModelName,
  bot: BotId,
  stage: Model["stage"],
  credits: number,
  evals: Eval[],
): Model {
  return {
    trainer: "local",
    id,
    name,
    hash: evals.at(-1)?.hash ?? "a1c",
    base: name,
    stage,
    look: { bot },
    vault: fakeAddress(`vault:${id}`),
    credits,
    evals,
  };
}

const seedModels: Model[] = [
  // Being post-trained for real on the sealed Transaction Guard Gym (decision head only).
  seed("sprig", "Clef Flash", "mote", "sprig", 420, []),
  // Being post-trained for real with GRPO on the sealed Transaction Guard Gym.
  seed("ember", "Qwen2.5-1.5B-Instruct", "relay", "sprig", 1250.5, []),
  seed(
    "quill",
    "Mistral Small 4",
    "prism",
    "sprig",
    86.2,
    history("quill", [
      ["contract-review", 10, 31],
      ["contract-review", 11, 44],
      ["legal-research", 11, 12],
    ]),
  ),
];

// Old demo bots may have real user edits or active runs in a warm development process.
const retiredExamples = [
  seed(
    "tide",
    "DeepSeek-V4-Flash",
    "sonar",
    "sprig",
    0,
    history("tide", [
      ["storefront-agent", 9, 40],
      ["storefront-agent", 10, 58],
      ["storefront-agent", 11, 70],
      ["injection-defence", 11, 49],
    ]),
  ),
  seed("starter-patch", "GLM-5", "patch", "sprig", 0, []),
  seed("starter-pounce", "Kimi K2.6", "pounce", "sprig", 0, []),
  seed("starter-hive", "DeepSeek-V4-Pro", "hive", "sprig", 0, []),
  seed("starter-orbit", "Gemma 4 26B A4B", "orbit", "sprig", 0, []),
  seed("starter-wick", "Qwen3.6-35B-A3B", "wick", "sprig", 0, []),
  seed("starter-zip", "Qwen3.8-2.4T-A95B", "zip", "sprig", 0, []),
];

// The key is versioned so that a hot reload after a data-shape change starts clean.
const g = globalThis as unknown as { __modelmon_v3?: Db };

export const db: Db = (g.__modelmon_v3 ??= {
  runs: new Map(),
  models: new Map(seedModels.map((m) => [m.id, m])),
  nextRun: 1,
});

// Add newly introduced starters to an already-running demo without losing custom models or runs.
for (const starter of seedModels) {
  const previous = db.models.get(starter.id);
  if (!previous) {
    db.models.set(starter.id, starter);
    continue;
  }
  if (!("bot" in previous.look)) previous.look = starter.look;
  if (/^Open (3|7|14|32)B model$/.test(previous.base)) {
    const oldName = starter.id.replace(/^starter-/, "");
    if (previous.name.toLowerCase() === oldName) previous.name = starter.name;
    previous.base = starter.base;
  }
}

for (const example of retiredExamples) {
  const previous = db.models.get(example.id);
  if (!previous || previous.trainingDefaults || previous.trainer !== "local") continue;
  const oldNickname = example.id.replace(/^starter-/, "");
  const untouched =
    (previous.name === example.name || previous.name.toLowerCase() === oldNickname) &&
    previous.credits === example.credits &&
    previous.hash === example.hash &&
    previous.evals.length === example.evals.length &&
    (!("bot" in previous.look) || ("bot" in example.look && previous.look.bot === example.look.bot));
  if (untouched && ![...db.runs.values()].some((run) => run.modelId === example.id))
    db.models.delete(example.id);
}

// The two models we actually train replace their demo predecessors in a warm process too.
// Their old histories were illustrative, so they start empty; real sealed results are added as they happen.
for (const id of ["sprig", "ember"]) {
  const previous = db.models.get(id);
  const starter = seedModels.find((m) => m.id === id)!;
  if (previous && (previous.base === "Gemma 4 31B" || previous.base === "Qwen3.8-27B")) {
    Object.assign(previous, { name: starter.name, base: starter.base, stage: starter.stage, evals: [], hash: starter.hash });
  }
}

/** Public demo profiles use stable bot IDs across checkpoints and gyms. */
export const rivalBots = [
  {
    id: "orchard-c44",
    name: "Clover",
    trainer: "orchard.sol",
    head: "pip",
    results: [
      ["solana-transactions", 84],
      ["repo-repair", 66],
    ],
  },
  {
    id: "tidepool-19b",
    name: "Buoy",
    trainer: "tidepool.sol",
    head: "rivet",
    results: [["solana-transactions", 73]],
  },
  {
    id: "moss-e02",
    name: "Mica",
    trainer: "moss.sol",
    head: "quill",
    results: [["solana-transactions", 58]],
  },
  { id: "lantern-5aa", name: "Wick", trainer: "lantern.sol", head: "rivet", results: [["spreadsheets", 52]] },
] as const;
