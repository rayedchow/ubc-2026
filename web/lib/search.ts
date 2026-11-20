/**
 * Gym search, two ways.
 *
 * Exact: every word typed must appear in the Gym's text. Predictable; what you
 * type is what you get.
 *
 * By meaning: words are widened to related ideas before matching, so "excel"
 * finds the Spreadsheet Gym and "fix failing tests" finds Repo Repair. This is
 * a local concept-and-weight ranker, not a language model. To use embeddings,
 * replace `rankByMeaning` and keep the same return shape.
 *
 * Filters (category, tags, status, grading method, price) are always exact and
 * apply in both modes. A Gym must carry every selected tag.
 */

import { GYMS } from "./gyms";
import type { CategoryId, GradingMethod, Gym, GymStatus, SearchHit, SearchMode } from "./types";

export type SearchFilters = {
  category?: CategoryId;
  /** The Gym must carry every one of these tags. */
  tags?: string[];
  status?: GymStatus;
  grading?: GradingMethod;
  maxPrice?: number;
};

/** Groups of words that mean roughly the same thing to someone looking for a Gym. */
const CONCEPTS: string[][] = [
  ["bug", "fix", "repair", "debug", "failing", "broken", "break", "issue", "patch", "error", "crash"],
  ["test", "unit", "pytest", "ci", "suite"],
  ["code", "coding", "programming", "software", "developer", "engineer", "repo", "repository", "swe", "python", "typescript"],
  ["spreadsheet", "excel", "sheet", "formula", "workbook", "csv", "table", "pivot"],
  ["accounting", "bookkeeping", "ledger", "reconcile", "reconciliation", "close", "journal", "accrual", "audit", "books", "accountant"],
  ["finance", "financial", "investment", "banking", "banker", "valuation", "dcf", "deal", "analyst", "equity"],
  ["expense", "receipt", "reimburse", "reimbursement", "spend", "policy", "approval", "compliance"],
  ["legal", "law", "lawyer", "attorney", "contract", "clause", "nda", "agreement", "litigation", "court", "case"],
  ["medical", "medicine", "health", "healthcare", "clinical", "patient", "doctor", "nurse", "triage", "symptom"],
  ["research", "report", "source", "citation", "cite", "fact", "investigate", "study"],
  ["browser", "web", "website", "click", "gui", "desktop", "computer", "screen", "ui", "rpa", "automation"],
  ["solana", "onchain", "blockchain", "crypto", "transaction", "wallet", "swap", "defi", "token", "stake", "web3", "payment"],
  ["safety", "security", "injection", "jailbreak", "attack", "adversarial", "defence", "defense", "trust", "safe"],
  ["shop", "store", "storefront", "ecommerce", "commerce", "merchant", "customer", "support", "order", "refund", "inventory", "retail"],
  ["shell", "terminal", "bash", "devops", "infra", "infrastructure", "deploy", "cli", "linux", "docker", "sre", "server", "build", "pipeline"],
  ["rebuild", "rewrite", "clone", "reimplement", "port", "replicate", "replication", "emulator", "reproduce"],
  ["find", "locate", "navigate", "grep", "retrieval", "retrieve", "search", "lookup"],
  ["cheap", "commodity", "budget", "affordable", "inexpensive", "volume"],
  ["hard", "difficult", "expert", "lab", "frontier", "advanced", "long", "horizon"],
  ["tool", "tools", "calling", "assistant", "act"],
  ["document", "read", "review", "markup", "redline", "summarise", "summarize"],
];

const STOP = new Set(
  "a an the and or of to for in on at by with my our your is are be it that this i we you how do does can model models gym gyms train training teach learn better want need get make agent agents keep keeps".split(
    " ",
  ),
);

/** Lower-case, split, and trim common endings so "tests", "testing" and "test" meet. */
function stem(word: string): string {
  let w = word;
  for (const end of ["ing", "ies", "es", "ed", "s"]) {
    if (w.length > end.length + 2 && w.endsWith(end)) {
      w = w.slice(0, -end.length) + (end === "ies" ? "y" : "");
      break;
    }
  }
  return w;
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9&\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

const conceptOf = new Map<string, number[]>();
CONCEPTS.forEach((group, i) => {
  for (const word of group) {
    const key = stem(word);
    conceptOf.set(key, [...(conceptOf.get(key) ?? []), i]);
  }
});

/** Text of a Gym, with how much each part counts. A hit in the name beats a hit in a sample task. */
function fields(gym: Gym): [text: string, weight: number][] {
  return [
    [gym.name, 3],
    [gym.taskType, 3],
    [gym.tags.join(" "), 2.5],
    [gym.keywords.join(" "), 2.5],
    [gym.purpose, 2],
    [gym.tools.join(" "), 1.5],
    [gym.bestFor, 1],
    [gym.sampleTasks.join(" "), 1],
    [`${gym.grading.method} ${gym.grading.detail}`, 0.8],
    [gym.whyHard, 0.6],
  ];
}

type Doc = { gym: Gym; weight: Map<string, number>; original: Map<string, string>; text: string };

const DOCS: Doc[] = GYMS.map((gym) => {
  const weight = new Map<string, number>();
  const original = new Map<string, string>();
  for (const [text, w] of fields(gym)) {
    const raw = text
      .toLowerCase()
      .replace(/[^a-z0-9&\s-]/g, " ")
      .split(/[\s-]+/);
    for (const word of raw) {
      if (word.length < 2 || STOP.has(word)) continue;
      const key = stem(word);
      weight.set(key, Math.max(weight.get(key) ?? 0, w));
      if (!original.has(key)) original.set(key, word);
    }
  }
  return { gym, weight, original, text: fields(gym).map(([t]) => t.toLowerCase()).join(" \n ") };
});

/** Rarer words say more: a word found in one Gym counts for more than one found in ten. */
const rarity = new Map<string, number>();
for (const doc of DOCS) for (const key of doc.weight.keys()) rarity.set(key, (rarity.get(key) ?? 0) + 1);
const idf = (key: string) => Math.log(1 + DOCS.length / (rarity.get(key) ?? DOCS.length));

function rankByMeaning(query: string, docs: Doc[]): SearchHit[] {
  const terms = [...new Set(tokens(query))];
  if (!terms.length) return [];

  return docs
    .map((doc) => {
      let score = 0;
      const why = new Map<string, number>();
      for (const term of terms) {
        // The word itself, at full strength.
        const direct = doc.weight.get(term);
        if (direct) {
          const s = direct * idf(term);
          score += s;
          why.set(doc.original.get(term)!, s);
          continue;
        }
        // Otherwise the best related word, at reduced strength.
        let best = 0;
        let bestWord = "";
        for (const group of conceptOf.get(term) ?? []) {
          for (const word of CONCEPTS[group]) {
            const key = stem(word);
            const w = doc.weight.get(key);
            if (w && w * idf(key) * 0.55 > best) {
              best = w * idf(key) * 0.55;
              bestWord = doc.original.get(key)!;
            }
          }
        }
        if (best) {
          score += best;
          why.set(bestWord, best);
        }
      }
      return {
        id: doc.gym.id,
        score: Math.round(score * 100) / 100,
        why: [...why.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([word]) => word),
      };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    // Drop the long tail: a Gym that only brushes the query is noise, not a result.
    .filter((hit, _i, all) => hit.score >= all[0].score * 0.3);
}

function matchExact(query: string, docs: Doc[]): SearchHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return docs
    .filter((doc) => words.every((w) => doc.text.includes(w)))
    .map((doc) => ({ id: doc.gym.id, score: 1, why: words }));
}

export function searchGyms(query: string, mode: SearchMode, filters: SearchFilters = {}): SearchHit[] {
  const docs = DOCS.filter(
    ({ gym }) =>
      (!filters.category || gym.category === filters.category) &&
      (!filters.tags?.length || filters.tags.every((tag) => gym.tags.includes(tag))) &&
      (!filters.status || gym.status === filters.status) &&
      (!filters.grading || gym.grading.method === filters.grading) &&
      (filters.maxPrice === undefined || gym.pricePerRep <= filters.maxPrice),
  );
  const q = query.trim();
  // No query: the filters alone decide, in catalogue order.
  if (!q) return docs.map((doc) => ({ id: doc.gym.id, score: 0, why: [] }));
  return mode === "exact" ? matchExact(q, docs) : rankByMeaning(q, docs);
}

export const GRADING_METHODS: GradingMethod[] = ["Hidden tests", "Reference diff", "End-state check", "Simulation", "Expert rubric"];
