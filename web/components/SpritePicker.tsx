"use client";
import { BOT_HEADS, BOT_NAMES, type BotId } from "@/lib/looks";
import { BotArt } from "./BotArt";
import { PixelRadioGroup } from "./ui/pixel-form";

export function BotHeadPicker({ value, onChange }: { value: BotId; onChange: (id: BotId) => void }) {
  return (
    <PixelRadioGroup
      className="sprite-picker"
      label="Bot head"
      value={value}
      onChange={onChange}
      items={BOT_HEADS.map((id) => ({ id, name: BOT_NAMES[id] + " head" }))}
      render={({ id }) => <BotArt id={id} size={30} />}
    />
  );
}
