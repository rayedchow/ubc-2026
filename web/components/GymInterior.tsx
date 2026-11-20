import { PixelArrow } from "@/components/ui/pixel-arrow";
import {
  useState,
  useRef,
  useLayoutEffect,
  useEffect,
  type CSSProperties,
  type RefObject,
  type ReactNode,
  useCallback,
} from "react";
import { GymPanel } from "./GymPanel";
import { MotionSurface } from "./ui/game-controls";
import "./gym-interior.css";
import Link from "next/link";
import { SceneZoom, useSceneNavigation } from "./ui/scene-navigation";
import { realms, type RealmGym } from "@/lib/realms";
import { roomSprite as sprite, TILE_W } from "@/lib/room-sprite";

type RoomDefinition = Pick<RealmGym, "id" | "name" | "realm"> & {
  skills: Pick<RealmGym["skills"][number], "id" | "name" | "prop">[];
};
type RoomPanel = { kind: "class"; id: string } | { kind: "info" | "vault" };
function PixelBackdrop({ board }: { board: RefObject<HTMLDivElement | null> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    function paint() {
      const w = (el.width = Math.max(1, Math.ceil(el.clientWidth / 4))),
        h = (el.height = Math.max(1, Math.ceil(el.clientHeight / 4)));
      const rw = ((board.current?.offsetWidth ?? 0) * w) / el.clientWidth / 2,
        rh = ((board.current?.offsetHeight ?? 0) * h) / el.clientHeight / 2;
      const pixels = ctx!.createImageData(w, h),
        matrix = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
      const spread = Math.max(15, Math.min(70, Math.min(w, h) * 0.44));
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          // Distance to the room boundary gives each wall an outward falloff, including the corners.
          const dx = Math.max(0, Math.abs(x - w / 2) - rw),
            dy = Math.max(0, Math.abs(y - h / 2) - rh);
          const t = Math.min(1, Math.hypot(dx, dy) / spread);
          const light = (1 - t) * (1 - t);
          const band = Math.min(11, Math.floor(light * 11 + matrix[(y % 4) * 4 + (x % 4)] / 16));
          const offset = 4 * (y * w + x);
          pixels.data.set([39 + band * 10, 24 + band * 7, 19 + band * 4, 255], offset);
        }
      ctx!.putImageData(pixels, 0, 0);
    }
    const observer = new ResizeObserver(paint);
    observer.observe(el);
    if (board.current) observer.observe(board.current);
    paint();
    return () => observer.disconnect();
  }, [board]);
  return <canvas className="room-backdrop" aria-hidden="true" ref={canvas} />;
}

function GymInterior({
  gym,
  onStation,
  onInfo,
  onVault,
  exitHref,
  selected,
}: {
  gym: RoomDefinition;
  selected: RoomPanel | null;
  onStation: (id: string) => void;
  onInfo: () => void;
  onVault: () => void;
  exitHref: string;
}) {
  const [floor, setFloor] = useState(0);
  const start = floor * 8,
    skills = gym.skills.slice(start, start + 8);
  const floors = Math.ceil(gym.skills.length / 8);
  const cols = Math.min(3, skills.length + 1),
    rows = Math.ceil((skills.length + 1) / cols);
  const kit = realms.find((r) => r.id === gym.realm)!.kit;
  const board = useRef<HTMLDivElement>(null);
  const draw = useRef<() => void>(() => {});
  const { camera, viewport, controls } = useSceneNavigation(() => draw.current());
  const { reset } = controls;
  useLayoutEffect(() => {
    const node = viewport.current!,
      room = board.current!,
      cam = camera.current;
    function position() {
      const w = node.clientWidth,
        h = node.clientHeight,
        rw = room.offsetWidth,
        rh = room.offsetHeight;
      const xTravel = Math.max(0, (rw - w / cam.zoom) / 2),
        yTravel = Math.max(0, (rh - h / cam.zoom) / 2);
      const [x, y] = cam.frame(0, 0, cam.zoom, [-xTravel, -yTravel, xTravel * 2, yTravel * 2], w / 2, h / 2);
      room.style.transform = `translate(${-x * cam.zoom}px,${-y * cam.zoom}px) scale(${cam.zoom})`;
    }
    draw.current = position;
    reset();
    const ro = new ResizeObserver(position);
    ro.observe(node);
    ro.observe(room);
    return () => {
      ro.disconnect();
      draw.current = () => {};
    };
  }, [camera, viewport, reset, floor]);
  const columns = Array.from({ length: cols }, (_, i) => i);
  const ratio = (cols * TILE_W) / (27 + rows * 56 + 13);
  return (
    <>
      <div
        className="room-viewport"
        tabIndex={0}
        aria-label={gym.name + " interior"}
        aria-describedby="room-controls-help"
        role="region"
        ref={viewport}
      >
        <PixelBackdrop board={board} />
        <p id="room-controls-help" className="sr-only">
          Choose a station to train, the wall sign for gym data, or the vault for partitions. Use the wheel,
          pinch or plus and minus to zoom. Drag to pan when zoomed in. Press zero to fit the room.
        </p>
        <div
          className="assembled-room"
          data-gym={gym.id}
          ref={board}
          style={
            {
              gridTemplateColumns: `repeat(${cols},minmax(0,1fr))`,
              "--room-native": cols * TILE_W * 3 + "px",
              "--room-aspect": ratio,
            } as CSSProperties
          }
        >
          {columns.map((i) => (
            <div key={"wall-" + i} className="room-wall" style={sprite(kit, "wall", 27)} />
          ))}
          <button
            type="button"
            className="room-sign"
            aria-expanded={selected?.kind === "info"}
            aria-label={"Gym information for " + gym.name}
            aria-haspopup="dialog"
            onClick={onInfo}
          >
            {gym.name}
          </button>
          {Array.from({ length: rows * cols }, (_, i) => {
            const skill = skills[i];
            if (skill)
              return (
                <button
                  key={skill.id}
                  type="button"
                  className="interior-station"
                  data-prop={skill.prop}
                  style={sprite(kit, skill.prop, 56)}
                  aria-expanded={selected?.kind === "class" && selected.id === skill.id}
                  aria-label={`Station ${start + i + 1}: ${skill.name}`}
                  aria-haspopup="dialog"
                  onClick={() => onStation(skill.id)}
                >
                  <span>{skill.name}</span>
                </button>
              );
            if (i === rows * cols - 1)
              return (
                <button
                  key="vault"
                  className="interior-vault"
                  type="button"
                  aria-expanded={selected?.kind === "vault"}
                  aria-label="Inspect sealed partitions"
                  aria-haspopup="dialog"
                  style={sprite(kit, "vault", 56)}
                  onClick={onVault}
                >
                  <span>Sealed vault</span>
                </button>
              );
            return <div key={"lounge-" + i} aria-hidden="true" style={sprite(kit, "lounge", 56)} />;
          })}
          {columns.map((i) =>
            i === Math.floor(cols / 2) ? (
              <Link
                key="door"
                className="room-sill room-door"
                href={exitHref}
                aria-label="Exit to gym map"
                style={sprite(kit, "entry", 13)}
              >
                <span>Exit</span>
              </Link>
            ) : (
              <div key={"sill-" + i} className="room-sill" style={{ aspectRatio: "95/13" }} />
            ),
          )}
          <div className="room-lens">
            <SceneZoom {...controls} />
          </div>
          {floors > 1 && (
            <div className="room-floors" data-scene-control="">
              <button aria-label="Previous floor" disabled={!floor} onClick={() => setFloor(floor - 1)}>
                <PixelArrow direction="left" />
              </button>
              <span>
                {floor + 1}/{floors}
              </span>
              <button
                aria-label="Next floor"
                disabled={floor + 1 === floors}
                onClick={() => setFloor(floor + 1)}
              >
                <PixelArrow direction="right" />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function GymRoomScene({
  gym,
  version,
  exitHref,
  children,
}: {
  gym: RoomDefinition;
  version: string;
  exitHref: string;
  children: (view: RoomPanel) => ReactNode;
}) {
  const [panel, setPanel] = useState<RoomPanel | null>(null);
  const opener = useRef<HTMLElement | null>(null),
    drawer = useRef<HTMLDivElement>(null);
  const realm = realms.find((r) => r.id === gym.realm)!;
  function open(view: RoomPanel) {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPanel(view);
  }
  const close = useCallback(() => {
    setPanel(null);
    opener.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (!panel) return;
    drawer.current?.querySelector<HTMLButtonElement>(".place-close")?.focus({ preventScroll: true });
    function key(e: KeyboardEvent) {
      if (
        e.key === "Escape" &&
        !e.defaultPrevented &&
        !document.querySelector('dialog[open],[role="listbox"]')
      ) {
        e.preventDefault();
        close();
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [panel, close]);
  return (
    <div
      className="gym-interior-scene"
      data-panel-open={!!panel}
      style={{ "--realm-accent": realm.accent } as CSSProperties}
    >
      <h1 className="sr-only">{gym.name}</h1>
      <GymInterior
        gym={gym}
        selected={panel}
        exitHref={exitHref}
        onInfo={() => open({ kind: "info" })}
        onVault={() => open({ kind: "vault" })}
        onStation={(id) => open({ kind: "class", id })}
      />
      <div ref={drawer} className="room-drawer-layer">
        <MotionSurface value={panel} className="room-panel-motion">
          {(view) => {
            const skill = view.kind === "class" ? gym.skills.find((s) => s.id === view.id) : undefined;
            const title = skill?.name ?? (view.kind === "info" ? "Gym information" : "Sealed vault");
            return (
              <GymPanel
                dialog
                className="interior-place"
                kit={realm.kit}
                eyebrow={realm.name}
                heading={title}
                label={title}
                onClose={close}
                closeLabel="Close panel"
                art={
                  <span
                    className="room-place-art"
                    style={sprite(
                      realm.kit,
                      skill?.prop ?? (view.kind === "vault" ? "vault" : "wall"),
                      view.kind === "info" ? 27 : 56,
                    )}
                  />
                }
              >
                <p className="place-volume">
                  {gym.name} · {version}
                </p>
                {children(view)}
              </GymPanel>
            );
          }}
        </MotionSurface>
      </div>
    </div>
  );
}
