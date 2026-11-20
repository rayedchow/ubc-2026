import type { TrainerSprite } from "./looks";
import catalog from "./realm-catalog.json";
import roomTiles from "../public/realms/room-tiles.json";
import software from "./software-catalog.json";

export const stationProps = roomTiles.filter((prop) => !["vault", "wall", "entry", "lounge"].includes(prop));
export const realms = [...catalog.realms, ...software.realms];
export type Realm = (typeof realms)[number];
export type PublicSample = { prompt: string; input?: Record<string, unknown> };
export type Skill = {
  id: string;
  name: string;
  prop: string;
  training: number[];
  records?: (PublicSample & { id: string })[];
  example?: string;
  sampleInput?: Record<string, unknown>;
  additionalSamples?: PublicSample[];
};
export type GymCreator = { handle: string; avatar: TrainerSprite };
export type RealmGym = Omit<(typeof catalog.gyms)[number], "skills" | "source"> & {
  source?: (typeof catalog.gyms)[number]["source"];
  skills: Skill[];
  creator?: GymCreator;
};
export const realmGyms: RealmGym[] = [...catalog.gyms, ...software.gyms];
export const bands = ["Beginner", "Intermediate", "Advanced"] as const;
export type Difficulty = (typeof bands)[number] | "Adaptive";
export const number = (n: number) => n.toLocaleString("en-US");
export const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  });
export const sum = (items: number[]) => items.reduce((total, value) => total + value, 0);
export const skillCount = (skill: Skill) => sum(skill.training) + (skill.records?.length ?? 0);
export const firstPrompt = (skill: Skill) => skill.records?.[0]?.prompt ?? skill.example;
export const trainCount = (gym: RealmGym) => sum(gym.skills.map(skillCount));
export const datasetCount = (gym: RealmGym) => trainCount(gym) + gym.development + gym.heldOut;

export function eligible(skill: Skill, difficulty: Difficulty) {
  return difficulty === "Adaptive" ? skillCount(skill) : skill.training[bands.indexOf(difficulty)];
}
