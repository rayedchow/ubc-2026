"use client";
import { useEffect, useRef } from "react";
import "./open-water.css";
import { createOpenWaterRenderer } from "@/lib/realm-webgl";

export function OpenWater() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const node = canvas.current!;
    const gl = node.getContext("webgl", { alpha: false, antialias: false, depth: false });
    if (!gl) return;
    let renderer: ReturnType<typeof createOpenWaterRenderer> | undefined;
    const paint = () => {
      node.width = Math.max(1, Math.round(node.clientWidth / 2));
      node.height = Math.max(1, Math.round(node.clientHeight / 2));
      renderer?.draw();
    };
    const start = () => {
      renderer = createOpenWaterRenderer(gl);
      paint();
    };
    const lost = (event: Event) => {
      event.preventDefault();
      renderer = undefined;
    };
    node.addEventListener("webglcontextrestored", start);
    node.addEventListener("webglcontextlost", lost);
    start();
    const observer = new ResizeObserver(paint);
    observer.observe(node);
    return () => {
      observer.disconnect();
      node.removeEventListener("webglcontextrestored", start);
      node.removeEventListener("webglcontextlost", lost);
      renderer?.dispose();
    };
  }, []);
  return <canvas aria-hidden="true" className="scene-water" ref={canvas} />;
}
