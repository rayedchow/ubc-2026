"use client";

import { useEffect, useRef, useState } from "react";
import { SceneZoom, useSceneNavigation } from "./ui/scene-navigation";
import { generateLandscape, ownerStride } from "@/lib/landscape";
import { createRealmRenderer } from "@/lib/realm-webgl";
import { realms, type RealmGym } from "@/lib/realms";

import { BenchmarkSign } from "./BenchmarkSign";
import { gymSign } from "@/lib/benchmarks";

const stride = ownerStride(realms.length);
type Props = {
  seed: number;
  focusRequest: number;
  focused: string | null;
  light: boolean;
  gyms: RealmGym[];
  activeGym: string | null;
  onGym: (gym: RealmGym) => void;
  onSelect: (id: string) => void;
};
function mapLabels(gyms: RealmGym[], focused: string | null) {
  return [...realms, ...gyms.filter((g) => !focused || g.realm === focused)];
}
function labelKey(item: RealmGym | (typeof realms)[number]) {
  return ("realm" in item ? "gym/" : "domain/") + item.id;
}
let hallLibrary: Promise<ArrayBuffer> | undefined;
function loadHalls() {
  return (hallLibrary ??= fetch("/realms/halls.bin")
    .then((response) => {
      if (!response.ok) throw new Error("Hall library unavailable");
      return response.arrayBuffer();
    })
    .catch((error) => {
      hallLibrary = undefined;
      throw error;
    }));
}

export function RealmTerrain({
  seed,
  focused,
  light,
  gyms,
  activeGym,
  onGym,
  onSelect,
  focusRequest,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useRef(new Map<string, HTMLButtonElement>());
  const userMove = useRef(false);
  const redraw = useRef<() => void>(() => {});
  const {
    viewport,
    camera: pan,
    controls,
  } = useSceneNavigation(() => {
    userMove.current = true;
    redraw.current();
  });
  const { reset } = controls;
  useEffect(() => {
    reset();
    userMove.current = false;
    redraw.current();
  }, [focused, seed, activeGym, gyms, focusRequest, reset]);
  const surface = useRef<ReturnType<typeof createRealmRenderer> | null>(null);
  const [hoverCode, setHoverCode] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [restore, setRestore] = useState(0);
  const view = useRef({ focused, hovered, light, activeGym, hoverCode });
  useEffect(() => {
    view.current = { focused, hovered, light, activeGym, hoverCode };
    redraw.current();
  }, [focused, hovered, light, activeGym, hoverCode]);
  useEffect(() => {
    const node = canvas.current!;
    let closed = false,
      frame = 0;
    let renderer: ReturnType<typeof createRealmRenderer> | undefined;
    const resize = new ResizeObserver(() => redraw.current());
    resize.observe(node);
    const lost = (e: Event) => {
      e.preventDefault();
      closed = true;
      surface.current = null;
      cancelAnimationFrame(frame);
      setStatus("unavailable");
    };
    const restored = () => setRestore((v) => v + 1);
    node.addEventListener("webglcontextlost", lost);
    node.addEventListener("webglcontextrestored", restored);
    async function load() {
      setStatus("loading");
      const library = await loadHalls();
      if (closed) return;
      const gl = node.getContext("webgl", { alpha: false, antialias: false });
      if (!gl) throw new Error("WebGL unavailable");
      const map = generateLandscape(seed, realms, library, gyms);
      renderer = createRealmRenderer(gl, map);
      surface.current = renderer;
      let shown: number[] = [],
        start: number[] = [],
        end: number[] = [];
      let since = 0;
      function draw() {
        if (closed || !renderer) return;
        const w = node.clientWidth,
          h = node.clientHeight;
        if (!w || !h) return;
        const dpr = Math.min(devicePixelRatio, 2);
        if (node.width !== Math.round(w * dpr) || node.height !== Math.round(h * dpr)) {
          node.width = Math.round(w * dpr);
          node.height = Math.round(h * dpr);
        }
        const { focused, hovered, light, activeGym, hoverCode } = view.current;
        const region = focused ? map.regions[focused] : null;
        const [x, y, bw, bh] = region?.bounds ?? map.bounds;
        // Reserve space in camera coordinates for the navigation and the selected gym menu.
        const compact = w < 720;
        const top = compact ? 76 : 70,
          bottom =
            compact && focused ? (activeGym ? Math.min(350, h * 0.48) + 106 : 235) : compact ? 115 : 92;
        const left = focused && !compact ? Math.min(520, Math.max(370, w * 0.36)) + 20 : 0;
        const usable = Math.max(50, h - top - bottom);
        const scale = Math.min(((w - left) * 0.96) / (bw + 8), usable / (bh + 12)) * pan.current.zoom;
        const center = activeGym ? map.places[activeGym]?.anchor : null;
        const [cx, cy] = pan.current.frame(
          center?.[0] ?? x + bw / 2,
          center?.[1] ?? y + bh / 2,
          scale,
          map.bounds,
          (w + left) / 2,
          top + usable / 2,
        );
        const target = [cx - (w + left) / (2 * scale), cy - (top + usable / 2) / scale, w / scale, h / scale];
        const now = performance.now();
        if (target.some((v, i) => v !== end[i])) {
          start = shown.length ? shown : target;
          end = target;
          since = now;
        }
        const t =
          userMove.current || matchMedia("(prefers-reduced-motion: reduce)").matches
            ? 1
            : Math.min(1, (now - since) / 320);
        shown = end.map((v, i) => v + (start[i] - v) * (1 - t) ** 3);
        const index = (id: string | null) => realms.findIndex((r) => r.id === id) + 1;
        const hallIndex = gyms.findIndex((g) => g.id === activeGym);
        const hallCode = hallIndex < 0 ? 0 : (hallIndex + 1) * stride + index(gyms[hallIndex].realm);
        renderer.draw(w, h, shown, index(focused), index(hovered), light, hallCode, hoverCode);
        const pinned = gyms[Math.floor(hoverCode / stride) - 1]?.id ?? activeGym;
        const pins = mapLabels(gyms, focused).sort((a, b) => {
          // Reserve domain names first, then the inspected roof, then the remaining roofs.
          const priority = (p: typeof a) => (!("realm" in p) ? 0 : p.id === pinned ? 1 : 2);
          return priority(a) - priority(b);
        });
        const roofs = Object.fromEntries(
          Object.entries(map.places).map(([id, { roof }]) => {
            const [left, top] = renderer!.project(roof[0], roof[1]);
            const [right, bottom] = renderer!.project(roof[2], roof[3]);
            return [id, { left, top, right, bottom }];
          }),
        );
        const occupied = Object.values(roofs);
        for (const pin of pins) {
          const isGym = "realm" in pin;
          const label = labels.current.get(labelKey(pin));
          if (!label) continue;
          const anchor = isGym
            ? map.places[pin.id]?.anchor
            : (renderer.regionAnchor(index(pin.id)) ?? map.regions[pin.id]?.anchor);
          if (!anchor) continue;
          let [cx, cy] = renderer.project(anchor[0], anchor[1]);
          label.hidden = false;
          const lw = label.offsetWidth,
            lh = label.offsetHeight;
          if (isGym) {
            const roof = roofs[pin.id];
            cx = (roof.left + roof.right) / 2;
            label.hidden = roof.right < 0 || roof.left > w || roof.bottom < 0 || roof.top > h;
            if (label.hidden) continue;
            // Both rows stay attached to this building as the camera pans and zooms.
            const reach = Math.min(lw * 0.44, (roof.right - roof.left) * 0.55);
            const slot = [roof.top - lh - 9, roof.bottom + 9]
              .flatMap((top) =>
                [0, -reach, reach].map((shift) => {
                  const center = cx + shift;
                  return { center, left: center - lw / 2, right: center + lw / 2, top, bottom: top + lh };
                }),
              )
              .find((box) => {
                if (box.left < 2 || box.right > w - 2 || box.top < 2 || box.bottom > h - 2) return false;
                const owner = renderer!.pick(box.center, box.top + lh / 2) % stride;
                return (
                  (!owner || owner === index(pin.realm)) &&
                  !occupied.some(
                    (r) =>
                      box.left < r.right + 2 &&
                      box.right > r.left - 2 &&
                      box.top < r.bottom + 2 &&
                      box.bottom > r.top - 2,
                  )
                );
              });
            label.hidden = !slot;
            if (!slot) continue;
            cx = slot.center;
            cy = slot.top;
          } else cy -= lh / 2;
          occupied.push({ left: cx - lw / 2, right: cx + lw / 2, top: cy, bottom: cy + lh });
          label.style.left = cx + "px";
          label.style.top = cy + "px";
        }
        cancelAnimationFrame(frame);
        if (t < 1) frame = requestAnimationFrame(draw);
      }
      redraw.current = draw;
      draw();
      void document.fonts.ready.then(() => {
        if (!closed) redraw.current();
      });
      setStatus("ready");
    }
    load().catch(() => {
      if (!closed) setStatus("unavailable");
    });
    return () => {
      closed = true;
      resize.disconnect();
      cancelAnimationFrame(frame);
      redraw.current = () => {};
      node.removeEventListener("webglcontextlost", lost);
      node.removeEventListener("webglcontextrestored", restored);
      surface.current = null;
      renderer?.dispose();
    };
  }, [seed, restore, gyms, pan]);
  function pick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const owner = surface.current?.pick(e.clientX - rect.left, e.clientY - rect.top);
    return owner ?? 0;
  }
  return (
    <div ref={viewport} className="map-viewport" data-renderer={status} data-focused={focused ?? ""}>
      <p id="atlas-gestures" className="sr-only">
        Drag or use the arrow keys to pan. Scroll, pinch, or use plus and minus to zoom. Home fits the
        selected area.
      </p>
      <canvas
        ref={canvas}
        className="atlas-landscape"
        tabIndex={0}
        role="region"
        aria-describedby="atlas-gestures"
        aria-label="Gym domains on a procedurally generated coast"
        onPointerMove={(e) => {
          if (e.buttons) return;
          const code = pick(e);
          setHoverCode(code);
          setHovered(realms[(code % stride) - 1]?.id ?? null);
          e.currentTarget.style.cursor = code >= stride ? "pointer" : code ? "zoom-in" : "default";
        }}
        onPointerLeave={() => {
          setHovered(null);
          setHoverCode(0);
        }}
        onClick={(e) => {
          const code = pick(e),
            gym = gyms[Math.floor(code / stride) - 1];
          if (gym) onGym(gym);
          else if (code) onSelect(realms[(code % stride) - 1].id);
        }}
      />
      {status === "ready" && <SceneZoom {...controls} />}
      {status === "unavailable" && (
        <p className="sea-notice">Map rendering is unavailable. Select a domain to explore its gyms.</p>
      )}
      <div className="feature-labels" aria-label="Map labels">
        {mapLabels(gyms, focused).map((item) => (
          <button
            key={labelKey(item)}
            type="button"
            className={"realm" in item ? "feature-name house-sign" : "feature-name"}
            aria-label={
              "realm" in item
                ? [item.name, gymSign(item).name, gymSign(item).title].filter(Boolean).join(" · ")
                : item.name
            }
            data-feature={item.id}
            data-inactive={
              activeGym
                ? labelKey(item) !== "gym/" + activeGym
                : !!focused && !("realm" in item) && item.id !== focused
            }
            ref={(el) => {
              if (el) labels.current.set(labelKey(item), el);
              else labels.current.delete(labelKey(item));
            }}
            onClick={() => {
              if ("realm" in item) onGym(item);
              else onSelect(item.id);
            }}
          >
            {"realm" in item ? <BenchmarkSign gym={item} /> : item.name}
          </button>
        ))}
      </div>
    </div>
  );
}
