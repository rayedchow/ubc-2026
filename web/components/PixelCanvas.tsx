"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { paint, type Painter } from "@/lib/gl";

/** A small canvas, drawn with WebGL, that CSS scales up with hard pixel edges. */
export function PixelCanvas({
  width,
  height,
  draw,
  label,
  className = "",
  style,
}: {
  width: number;
  height: number;
  draw: (ctx: Painter) => void;
  /** Described to screen readers. Leave out for decoration. */
  label?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) return paint(ref.current, width, height, draw);
  }, [draw, width, height]);

  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      className={`pixel ${className}`}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
