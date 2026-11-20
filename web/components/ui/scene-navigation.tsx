"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Minus, Plus, Scan } from "lucide-react";
import { MapPan, minZoom, maxZoom } from "@/lib/map-camera";
import { PixelButton } from "./game-controls";
import "./scene-navigation.css";

type Point = { x: number; y: number };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const step = 1.25;

/** Shared pointer, wheel and keyboard navigation for a world-coordinate scene. */
export function useSceneNavigation(draw: () => void) {
  const viewport = useRef<HTMLDivElement>(null);
  const camera = useRef(new MapPan());
  const render = useRef(draw);
  useLayoutEffect(() => {
    render.current = draw;
  }, [draw]);
  const [percent, setPercent] = useState(100);
  const update = useCallback(() => {
    render.current();
    setPercent(Math.round(camera.current.zoom * 100));
  }, []);
  const zoom = useCallback(
    (factor: number) => {
      camera.current.zoomBy(factor);
      update();
    },
    [update],
  );
  const reset = useCallback(() => {
    camera.current.reset();
    update();
  }, [update]);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const cam = camera.current;
    const touches = new Map<number, Point>();
    let start: Point | null = null,
      dragged = false;
    const ignored = (target: EventTarget | null) =>
      target instanceof Element && !!target.closest("[data-scene-control]");
    // macOS can finish a horizontal gesture with several purely vertical momentum events.
    let wheelPan = false,
      lastWheel = -Infinity;
    function wheel(e: WheelEvent) {
      if (ignored(e.target)) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el!.clientHeight : 1;
      const rect = el!.getBoundingClientRect();
      const now = e.timeStamp;
      if (now - lastWheel > 190) wheelPan = false;
      lastWheel = now;
      const pinch = e.ctrlKey || e.metaKey;
      if (!pinch && (e.deltaX !== 0 || e.shiftKey)) wheelPan = true;
      if (!pinch && wheelPan)
        cam.move((e.deltaX || (e.shiftKey ? e.deltaY : 0)) * unit, e.shiftKey ? 0 : e.deltaY * unit);
      else
        cam.zoomBy(
          Math.exp(Math.max(-1, Math.min(1, -e.deltaY * unit * (e.ctrlKey ? 0.012 : 0.0025)))),
          e.clientX - rect.left,
          e.clientY - rect.top,
        );
      update();
    }
    function down(e: PointerEvent) {
      if (e.button !== 0 || ignored(e.target)) return;
      if (touches.size === 0) {
        dragged = false;
        start = { x: e.clientX, y: e.clientY };
      }
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size >= 2) dragged = true;
    }
    function move(e: PointerEvent) {
      const old = touches.get(e.pointerId);
      if (!old) return;
      const now = { x: e.clientX, y: e.clientY };
      const before = [...touches.values()];
      touches.set(e.pointerId, now);
      if (before.length === 1) {
        if (!start || (!dragged && distance(start, now) < 5)) return;
        const prev = dragged ? old : start;
        cam.move(prev.x - now.x, prev.y - now.y);
      } else if (before.length === 2) {
        const after = [...touches.values()];
        const a = midpoint(before[0], before[1]),
          b = midpoint(after[0], after[1]);
        const rect = el!.getBoundingClientRect();
        cam.move(a.x - b.x, a.y - b.y);
        cam.zoomBy(
          distance(after[0], after[1]) / Math.max(1, distance(before[0], before[1])),
          b.x - rect.left,
          b.y - rect.top,
        );
      } else return;
      dragged = true;
      el!.setPointerCapture(e.pointerId);
      el!.dataset.dragging = "true";
      update();
    }
    function end(e: PointerEvent) {
      if (!touches.delete(e.pointerId)) return;
      if (el!.hasPointerCapture(e.pointerId)) el!.releasePointerCapture(e.pointerId);
      if (touches.size === 0) delete el!.dataset.dragging;
    }
    function click(e: MouseEvent) {
      if (dragged && e.detail && !ignored(e.target)) {
        e.preventDefault();
        e.stopPropagation();
        dragged = false;
      }
    }
    function key(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.key) {
        case "+":
        case "=":
          cam.zoomBy(step);
          break;
        case "-":
        case "_":
          cam.zoomBy(1 / step);
          break;
        case "Home":
        case "0":
          cam.reset();
          break;
        case "ArrowLeft":
          cam.move(-55, 0);
          break;
        case "ArrowRight":
          cam.move(55, 0);
          break;
        case "ArrowUp":
          cam.move(0, -55);
          break;
        case "ArrowDown":
          cam.move(0, 55);
          break;
        default:
          return;
      }
      e.preventDefault();
      update();
    }
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    el.addEventListener("click", click, true);
    el.addEventListener("keydown", key);
    return () => {
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      el.removeEventListener("click", click, true);
      el.removeEventListener("keydown", key);
    };
  }, [update]);
  return { viewport, camera, controls: { percent, zoom, reset } };
}

export function SceneZoom({ percent, zoom, reset }: ReturnType<typeof useSceneNavigation>["controls"]) {
  return (
    <div className="scene-zoom" data-scene-control="" role="group" aria-label="Zoom controls">
      <PixelButton
        tone="light"
        type="button"
        title="Zoom out (−)"
        aria-label="Zoom out"
        disabled={percent <= minZoom * 100}
        onClick={() => zoom(1 / step)}
      >
        <Minus />
      </PixelButton>
      <PixelButton
        tone="light"
        type="button"
        title="Fit and center (0)"
        aria-label="Fit and center"
        onClick={reset}
      >
        <Scan />
        <span>{percent}%</span>
      </PixelButton>
      <PixelButton
        tone="light"
        type="button"
        title="Zoom in (+)"
        aria-label="Zoom in"
        disabled={percent >= maxZoom * 100}
        onClick={() => zoom(step)}
      >
        <Plus />
      </PixelButton>
    </div>
  );
}
