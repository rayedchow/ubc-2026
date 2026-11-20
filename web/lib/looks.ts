export const COLLECTION_HEADS = [
  "relay",
  "mote",
  "prism",
  "sonar",
  "patch",
  "pounce",
  "hive",
  "orbit",
  "wick",
  "zip",
] as const;
export const BOT_HEADS = [...COLLECTION_HEADS, "rivet", "pip", "quill"] as const;
export type BotId = (typeof BOT_HEADS)[number];
export const BOT_NAMES: Record<BotId, string> = {
  relay: "Relay",
  mote: "Mote",
  prism: "Prism",
  sonar: "Sonar",
  patch: "Patch",
  pounce: "Pounce",
  hive: "Hive",
  orbit: "Orbit",
  wick: "Wick",
  zip: "Zip",
  rivet: "Rivet",
  pip: "Pip",
  quill: "Quill",
};
export const TRAINERS = ["scout", "tinker", "courier", "ranger", "sage"] as const;
export type TrainerSprite = (typeof TRAINERS)[number];
const legacyPalette = {
  body: ["cloud", "mint", "peach", "lilac", "sky", "butter"],
  accent: ["midnight", "plum", "teal", "ember", "moss"],
  top: ["horns", "crystal", "crown", "blade", "antenna", "leaf"],
  eyes: ["tall", "dots", "visor", "sleepy"],
};
type LegacyLook = Record<keyof typeof legacyPalette, string>;
export type PetLook = { bot: BotId } | LegacyLook;

export function isPetLook(v: unknown): v is PetLook {
  if (!v || typeof v !== "object") return false;
  const l = v as Record<string, unknown>;
  if ("bot" in l) return BOT_HEADS.some((id) => id === l.bot);
  return Object.entries(legacyPalette).every(([key, options]) => {
    const value = l[key];
    return typeof value === "string" && options.includes(value);
  });
}

/** Older checkpoints carry a palette and headpiece. Resolve them without changing their identity. */
export function botForLook(look: PetLook): BotId {
  if ("bot" in look) return look.bot;
  if (look.body === "lilac" || look.top === "crystal" || look.top === "blade") return "quill";
  if (look.body === "peach" || look.body === "butter" || look.accent === "ember") return "rivet";
  return "pip";
}
