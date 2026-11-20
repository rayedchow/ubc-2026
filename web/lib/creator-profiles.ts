import { TRAINERS, type TrainerSprite } from "./looks";
import type { GymCreator } from "./realms";

// Fictional independent creators for the sample catalog. Published benchmark credits stay with their sources.
export const developers: Record<string, GymCreator> = {
  manipulation: { handle: "rivet.lab", avatar: "tinker" },
  navigation: { handle: "tidepool", avatar: "ranger" },
  treasury: { handle: "ledgerfox", avatar: "courier" },
  contracts: { handle: "moss", avatar: "sage" },
  research: { handle: "lantern", avatar: "scout" },
};

export function defaultPortrait(handle: string): TrainerSprite {
  const id = handle.trim().toLowerCase();
  if (id === "local") return "scout";
  let hash = 0;
  for (const character of id) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  return TRAINERS[hash % TRAINERS.length];
}

// Earlier versions stored a trainer's chosen portrait on this device.
export function savedDevicePortrait(handle: string) {
  if (typeof window === "undefined") return undefined;
  try {
    const saved = localStorage.getItem("modelmon.avatar." + handle);
    return TRAINERS.find((id) => id === saved);
  } catch {
    return undefined;
  }
}
