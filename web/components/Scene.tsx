import Image from "next/image";
import { BotArt } from "./BotArt";
import { botForLook } from "@/lib/looks";
import type { Gym, Model } from "@/lib/types";

export const roomForCategory = {
  software: "manipulation",
  finance: "accounting",
  expert: "research",
  agents: "navigation",
} as const;

export function RunRoomArt({ gym, model, busy }: { gym: Gym; model?: Model; busy: boolean }) {
  return (
    <div className="run-room-art" aria-hidden="true">
      <Image unoptimized fill alt="" src={`/realms/${roomForCategory[gym.category]}.png`} />
      {model && (
        <span className="run-model">
          <BotArt id={botForLook(model.look)} animated state={busy ? "focus" : "idle"} />
        </span>
      )}
    </div>
  );
}
