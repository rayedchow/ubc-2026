"use client";
import { PixelArrow } from "@/components/ui/pixel-arrow";
import { PixelSelect } from "./ui/pixel-select";
import { choices, PixelInput, PixelRadioGroup } from "./ui/pixel-form";
import { ChoiceBar, MotionSurface, PixelButton } from "./ui/game-controls";
import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Dices, Plus, Search, Settings2, X } from "lucide-react";
import { realms, type RealmGym } from "@/lib/realms";
import { gymsPerSheet, hallVariant } from "@/lib/landscape";
import { RealmTerrain } from "./RealmTerrain";
import { CreateGymForm } from "./CreateGymForm";
import { gymSign } from "@/lib/benchmarks";
import { GymPlace } from "./GymPlace";
import { GymSearch } from "./GymSearch";
import "./realm-map.css";

function sheetOf(gym: RealmGym, catalog: RealmGym[]) {
  return Math.floor(
    catalog.filter((g) => g.realm === gym.realm).findIndex((g) => g.id === gym.id) / gymsPerSheet,
  );
}
export function RealmAtlas({
  initialSeed,
  initialRealm,
  initialGyms,
  initialGym,
  initialSheet,
}: {
  initialSeed: number;
  initialRealm?: string;
  initialGyms: RealmGym[];
  initialGym?: string;
  initialSheet: number;
}) {
  const [catalog, setCatalog] = useState(initialGyms);
  const first = initialGyms.find((g) => g.id === initialGym);
  const pages = Math.max(
    ...realms.map((r) => Math.ceil(catalog.filter((g) => g.realm === r.id).length / gymsPerSheet)),
  );
  const [focusRequest, requestFocus] = useState(0);
  const [seed, setSeed] = useState(initialSeed),
    [sheet, setSheet] = useState(first ? sheetOf(first, initialGyms) : Math.min(pages - 1, initialSheet)),
    [focused, setFocused] = useState<string | null>(first?.realm ?? initialRealm ?? null),
    [active, setActive] = useState<string | null>(first?.id ?? null);
  const [light, setLight] = useState(false),
    [panel, setPanel] = useState<"create" | "settings" | "search" | null>(null),
    [query, setQuery] = useState("");

  const domain = realms.find((r) => r.id === focused),
    selected = catalog.find((g) => g.id === active);
  const visible = useMemo(() => catalog.filter((g) => sheetOf(g, catalog) === sheet), [catalog, sheet]);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("seed", String(seed));
    url.searchParams.delete("domain");
    url.searchParams.delete("d");
    if (focused) url.searchParams.set("realm", focused);
    else url.searchParams.delete("realm");
    if (sheet > 0) url.searchParams.set("sheet", String(sheet + 1));
    else url.searchParams.delete("sheet");
    if (active) url.searchParams.set("gym", active);
    else url.searchParams.delete("gym");
    window.history.replaceState(window.history.state, "", url);
    document.cookie = `atlas-seed=${seed}; Max-Age=31536000; Path=/; SameSite=Lax`;
  }, [seed, focused, active, sheet]);

  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (e.defaultPrevented || panel) return;
      if (e.key === "Escape") {
        if (active) setActive(null);
        else setFocused(null);
      }
      if (e.key === "/" && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        setPanel("search");
      }
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [active, panel]);
  function chooseDomain(id: string) {
    requestFocus((n) => n + 1);
    setActive(null);
    setFocused(id);
  }
  function chooseGym(g: RealmGym, all = catalog) {
    requestFocus((n) => n + 1);
    setFocused(g.realm);
    setSheet(sheetOf(g, all));
    setActive(g.id);
    setPanel(null);
  }
  function redraw() {
    const value = crypto.getRandomValues(new Uint32Array(1))[0];
    setSeed(value === seed ? (seed + 1) >>> 0 : value);
  }
  const colors = (accent: string) => ({ "--accent": accent }) as CSSProperties;
  return (
    <div
      className="ocean-atlas"
      data-seed={seed}
      data-background={light ? "light" : "muted"}
      data-place={!!selected}
      data-zoomed={!!domain}
    >
      <h1 className="sr-only">Gym atlas</h1>
      <RealmTerrain
        seed={seed}
        gyms={visible}
        focused={focused}
        activeGym={active}
        light={light}
        focusRequest={focusRequest}
        onSelect={chooseDomain}
        onGym={chooseGym}
      />
      <MotionSurface value={selected?.id ?? null} className="place-layer">
        {(id) => {
          const g = catalog.find((v) => v.id === id)!,
            r = realms.find((d) => d.id === g.realm)!;
          const slot = catalog.filter((v) => v.realm === g.realm).indexOf(g) % gymsPerSheet;
          return (
            <GymPlace
              key={id}
              gym={g}
              realm={r}
              seed={seed}
              variant={hallVariant(seed, realms.indexOf(r), slot)}
              close={() => setActive(null)}
            />
          );
        }}
      </MotionSurface>
      <MotionSurface value={selected ? null : (domain?.id ?? null)} className="domain-layer">
        {(id) => {
          const d = realms.find((r) => r.id === id)!;
          return (
            <section className="domain-menu" aria-label={d.name + " gyms"} style={colors(d.accent)}>
              <button type="button" className="sea-back" onClick={() => setFocused(null)}>
                <PixelArrow direction="left" />
                All domains
              </button>
              <h2>{d.name}</h2>
              <div>
                {catalog
                  .filter((g) => g.realm === id)
                  .map((g) => (
                    <button type="button" key={g.id} onClick={() => chooseGym(g)}>
                      {g.name}
                      <PixelArrow size={15} />
                    </button>
                  ))}
              </div>
            </section>
          );
        }}
      </MotionSurface>
      <div className="map-hud">
        <ChoiceBar
          items={realms}
          value={focused}
          onChange={chooseDomain}
          label="Map key"
          className="map-key"
        />
        <div className="sea-toolbar">
          <PixelButton type="button" tone="gold" className="sea-control" onClick={() => setPanel("create")}>
            <Plus size={17} />
            Create gym
          </PixelButton>
          <PixelButton
            type="button"
            tone="light"
            className="sea-control"
            aria-label="New landscape"
            title="New landscape"
            onClick={redraw}
          >
            <Dices size={18} />
            Redraw
          </PixelButton>
          <PixelButton
            type="button"
            tone="light"
            className="sea-control"
            aria-label="Search gyms"
            onClick={() => {
              setQuery("");
              setPanel("search");
            }}
          >
            <Search size={17} />
            Search
          </PixelButton>
          <PixelButton
            type="button"
            tone="light"
            className="sea-control"
            aria-label="Map settings"
            onClick={() => setPanel("settings")}
          >
            <Settings2 size={17} />
            Settings
          </PixelButton>
        </div>
      </div>
      <div className="map-seed">
        Map seed {String(seed).padStart(3, "0")}
        {pages > 1 && ` · Sheet ${sheet + 1}/${pages}`}
      </div>
      <MotionSurface
        value={panel}
        modal
        className="sea-dialog"
        labelledBy="map-dialog-title"
        onDismiss={() => setPanel(null)}
      >
        {(current) => (
          <section>
            <header>
              <h2 id="map-dialog-title">
                {current === "search" ? "Find a gym" : current === "create" ? "Create a gym" : "Map settings"}
              </h2>
              <button className="sea-close" type="button" aria-label="Close" onClick={() => setPanel(null)}>
                <X size={18} />
              </button>
            </header>
            {current === "create" ? (
              <CreateGymForm
                domain={domain?.id ?? realms[0].id}
                created={(g) => {
                  const all = [...catalog, g];
                  setCatalog(all);
                  chooseGym(g, all);
                }}
              />
            ) : current === "search" ? (
              <>
                <PixelInput
                  type="search"
                  autoFocus
                  placeholder="Search map gyms"
                  aria-label="Search map gyms"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <div className="search-places">
                  {catalog
                    .filter((g) =>
                      [
                        g.name,
                        g.realm,
                        gymSign(g).name,
                        gymSign(g).title,
                        gymSign(g).reference?.provider.name,
                        ...g.skills.map((s) => s.name),
                      ]
                        .join(" ")
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((g) => (
                      <button key={g.id} onClick={() => chooseGym(g)}>
                        {g.name}
                        <PixelArrow size={14} />
                      </button>
                    ))}
                </div>
                <details>
                  <summary>Search the training registry</summary>
                  <GymSearch />
                </details>
              </>
            ) : (
              <>
                <PixelRadioGroup
                  label="Ocean palette"
                  items={choices(["Muted", "Light"])}
                  value={light ? "Light" : "Muted"}
                  onChange={(id) => setLight(id === "Light")}
                />
                {pages > 1 && (
                  <PixelSelect
                    label="Map sheet"
                    value={sheet}
                    items={Array.from({ length: pages }, (_, id) => ({ id, name: `${id + 1} / ${pages}` }))}
                    onChange={(id) => {
                      setSheet(id);
                      setActive(null);
                    }}
                  />
                )}
                <p>
                  Landscape seed <code>{seed}</code>
                </p>
                <Link href="/realms/model-studio">
                  Model studio <PixelArrow direction="external" />
                </Link>
              </>
            )}
          </section>
        )}
      </MotionSurface>
    </div>
  );
}
