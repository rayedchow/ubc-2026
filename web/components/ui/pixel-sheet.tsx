import type { ComponentProps } from "react";
import "./pixel-sheet.css";

export function PixelSheet({ className = "", ...props }: ComponentProps<"section">) {
  return <section className={`pixel-sheet ${className}`} {...props} />;
}
