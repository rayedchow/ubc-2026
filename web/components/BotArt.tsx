"use client";

import { useEffect, useState } from "react";
import type { BotId } from "@/lib/looks";
import animations from "../public/model-bots/animations.json";

export function gazeAt(bounds: DOMRect, clientX: number, clientY: number) {
  const x = (clientX - bounds.left) / bounds.width - 0.5;
  const y = (clientY - bounds.top) / bounds.height - 0.5;
  if (Math.max(Math.abs(x), Math.abs(y)) < 0.12) return "idle";
  if (Math.abs(x) > Math.abs(y)) return x < 0 ? "left" : "right";
  return y < 0 ? "up" : "down";
}

export function BotArt({
  id,
  state,
  animated = false,
  size,
  label,
}: {
  id: BotId;
  state?: string;
  animated?: boolean;
  size?: number;
  label?: string;
}) {
  const [gaze, setGaze] = useState("idle");
  const row = Math.max(
    0,
    animations.rows.findIndex((entry) => entry.state === (state ?? gaze)),
  );
  const timings = animations.rows[row].durationsMs;
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!animated) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setTimeout>;
    const play = () => {
      clearTimeout(timer);
      let index = 0;
      const tick = () => {
        setFrame(index);
        const hold = timings[index];
        index = (index + 1) % timings.length;
        if (!media.matches) timer = setTimeout(tick, hold);
      };
      tick();
    };
    play();
    media.addEventListener("change", play);
    return () => {
      clearTimeout(timer);
      media.removeEventListener("change", play);
    };
  }, [animated, timings]);
  return (
    <span
      className="bot-art"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      onPointerMove={
        state || !animated
          ? undefined
          : (e) => {
              if (e.pointerType !== "touch") {
                setGaze(gazeAt(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY));
              }
            }
      }
      onPointerLeave={state || !animated ? undefined : () => setGaze("idle")}
      style={{
        width: size,
        backgroundImage: `url(/model-bots/${animations.models[id].sheet})`,
        backgroundSize: `${animations.columns * 100}% ${animations.rows.length * 100}%`,
        backgroundPosition: `${(frame / (animations.columns - 1)) * 100}% ${(row / (animations.rows.length - 1)) * 100}%`,
      }}
    />
  );
}
