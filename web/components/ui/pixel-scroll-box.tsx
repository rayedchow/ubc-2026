"use client";
import { ScrollArea } from "radix-ui";
import type { ReactNode } from "react";
import "./pixel-scroll-box.css";

export function PixelScrollBox({
  label,
  className = "",
  type = "always",
  children,
}: {
  label: string;
  className?: string;
  type?: "always" | "auto";
  children: ReactNode;
}) {
  return (
    <ScrollArea.Root type={type} className={"pixel-scroll-box " + className}>
      <ScrollArea.Viewport className="pixel-scroll-viewport" role="region" aria-label={label} tabIndex={0}>
        {children}
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar orientation="vertical" className="pixel-scroll-rail">
        <ScrollArea.Thumb className="pixel-scroll-thumb" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
}
