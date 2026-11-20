"use client";
import { PixelArrow } from "@/components/ui/pixel-arrow";
import { PixelSelect } from "./ui/pixel-select";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { BotArt, gazeAt } from "./BotArt";
import { realmGyms, type Realm } from "@/lib/realms";

import { realms } from "@/lib/realm-catalog.json";

const bots = {
  rivet: { name: "Rivet", shape: "Square head", detail: "Wide tangerine shell. Two mint eyes track movement across its visor.", color: "#ff9c19" },
  pip: { name: "Pip", shape: "Round head", detail: "A round jade face with bright eyes and a gentle idle bob.", color: "#27dcb0" },
  quill: { name: "Quill", shape: "Diamond head", detail: "A violet diamond with a narrow visor and a quick, angular squint.", color: "#b781ff" },
};
type BotId = keyof typeof bots;
const roster = Object.keys(bots) as BotId[];
const views = { journal: "Field journal", dispatch: "Dispatch console", party: "Party select" };
type View = keyof typeof views;
type Reaction = "auto" | "focus" | "alert" | "happy";
const reactions: Reaction[] = ["auto", "focus", "alert", "happy"];
const root = "/model-bots";

function BotPad({ id, reaction, className = "", onPick, selected, children }: {
  id: BotId; reaction: Reaction; className?: string; onPick?: () => void; selected?: boolean; children?: ReactNode;
}) {
  const [gaze, setGaze] = useState("idle");
  const [greeting, setGreeting] = useState(false);
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (reset.current) clearTimeout(reset.current); }, []);
  function look(e: PointerEvent<HTMLButtonElement>) {
    if (e.pointerType === "touch") return;
    const bounds = e.currentTarget.querySelector(".bot-art")!.getBoundingClientRect();
    setGaze(gazeAt(bounds, e.clientX, e.clientY));
  }
  const state = greeting ? "happy" : reaction === "auto" ? gaze : reaction;
  return <button type="button" className={`bot-pad ${className}`} data-state={state}
    style={{ "--shell": bots[id].color } as CSSProperties}
    aria-label={onPick ? `Select ${bots[id].name}` : `Greet ${bots[id].name}`} aria-pressed={selected}
    onPointerMove={look} onPointerLeave={() => setGaze("idle")} onFocus={() => setGaze("focus")}
    onBlur={() => setGaze("idle")} onClick={() => {
      onPick?.(); setGreeting(true);
      if (reset.current) clearTimeout(reset.current);
      reset.current = setTimeout(() => setGreeting(false), 850);
    }}>
    <span className="bot-platform"><BotArt id={id} state={state} animated /></span>
    {children}
  </button>;
}

function Terrain({ realm, whole = false }: { realm: Realm; whole?: boolean }) {
  return <Image unoptimized className="studio-terrain" width={whole ? 752 : 270} height={whole ? 273 : 206}
    src={whole ? "/realms/world-17.png" : `/realms/${realm.id}-17.png`}
    alt={whole ? "The three connected realms" : `The terraced gyms of ${realm.name}`} />;
}

export function ModelStudio({ initialView, initialBot, initialRealm }: {
  initialView?: string; initialBot?: string; initialRealm?: string;
}) {
  const [view, setView] = useState<View>(Object.hasOwn(views, initialView ?? "") ? initialView as View : "journal");
  const [id, setId] = useState<BotId>(Object.hasOwn(bots, initialBot ?? "") ? initialBot as BotId : "rivet");
  const [realmId, setRealmId] = useState(realms.find((r) => r.id === initialRealm)?.id ?? realms[0].id);
  const [reaction, setReaction] = useState<Reaction>("auto");
  const bot = bots[id];
  const realm = realms.find((r) => r.id === realmId)!;
  const gyms = realmGyms.filter((gym) => gym.realm === realm.id);
  function choose(nextView: View, nextBot: BotId, nextRealm: string) {
    setView(nextView); setId(nextBot); setRealmId(nextRealm);
    const query = new URLSearchParams({ view: nextView, model: nextBot, realm: nextRealm });
    window.history.replaceState(null, "", `?${query}`);
  }

  const selector = <PixelSelect label="Destination" value={realmId} items={realms} onChange={realm=>choose(view,id,realm)} />;
  const gymLinks = <div className="studio-gyms" aria-label={`Gyms in ${realm.name}`}>
    {gyms.map((gym) => <Link key={gym.id} href={`/gyms/${gym.id}`}>{gym.name}<PixelArrow direction="right" /></Link>)}
  </div>;
  const rosterPicker = <div className="studio-roster" role="group" aria-label="Model roster">
    {roster.map((key) => <button type="button" key={key} aria-pressed={id === key}
      onClick={() => choose(view, key, realmId)}><BotArt id={key} /><span>{bots[key].name}</span></button>)}
  </div>;

  return <section className="model-studio">
    <div className="studio-tools">
      <div className="view-picker" role="group" aria-label="UI layout">
        {(Object.keys(views) as View[]).map((v) => <button type="button" key={v} aria-pressed={v===view}
          onClick={() => choose(v,id,realmId)}>{views[v]}</button>)}
      </div>
      <a className="pack-link" href={`${root}/model-bots.zip`} download><PixelArrow direction="down" /> Sprite pack</a>
    </div>
    <div className={`design-sheet design-${view}`} style={{ "--shell": bot.color } as CSSProperties}>
      {view === "journal" && <>
        <header className="design-head"><div><div className="design-kicker">Modélmon / Field journal</div>
          <h1>Model field guide</h1></div><Link href="/gyms">Gym atlas <PixelArrow direction="external" /></Link></header>
        <div className="journal-spread">
          <section className="journal-profile">
            <div className="profile-title"><div><h2>{bot.name}</h2><p>{bot.shape}</p></div></div>
            <BotPad key={id} id={id} reaction={reaction} className="specimen-pad" />
            <p className="journal-note">{bot.detail}</p>
          </section>
          <section className="journal-map">
            {selector}
            <div className="postage"><Terrain realm={realm} /></div>
            <div className="destination-title"><h2>{realm.name}</h2></div>
            {gymLinks}
          </section>
        </div>
        <footer className="journal-footer"><span className="design-kicker">Model roster</span>{rosterPicker}</footer>
      </>}
      {view === "dispatch" && <>
        <header className="design-head"><div><div className="design-kicker">Modélmon / Dispatch console</div>
          <h1>Realm dispatch</h1></div><div className="console-indicator"><i />Local channel</div></header>
        <div className="dispatch-body">
          <section className="radar"><div className="radar-bar"><b>Terrain feed</b>{selector}</div>
            <div className="radar-screen"><Terrain realm={realm} whole />
              <div className="radar-regions">{realms.map((r) => <button key={r.id} type="button" aria-pressed={r.id===realmId}
                onClick={() => choose(view,id,r.id)}>{r.name}</button>)}</div></div>
            <div className="dispatch-destination"><div><h2>{realm.name}</h2></div>{gymLinks}</div>
          </section>
          <section className="transmitter"><div className="radio-title"><span>Model channel</span><i aria-hidden="true">▂▄▆</i></div>
            <BotPad key={id} id={id} reaction={reaction} className="monitor-pad" />
            <h2>{bot.name}</h2><p>{bot.shape}</p>{rosterPicker}</section>
        </div>
      </>}
      {view === "party" && <>
        <header className="design-head"><div><div className="design-kicker">Modélmon / Party select</div>
          <h1>Choose your model</h1></div><span className="party-count">{bot.name} selected</span></header>
        <div className="party-cards" role="group" aria-label="Model roster">
          {roster.map((key) => <BotPad key={key} id={key} reaction={reaction} selected={key===id} className="party-card"
            onPick={() => choose(view,key,realmId)}>
            <span className="party-card-label"><b>{bots[key].name}</b><small>{bots[key].shape}</small></span>
            {key===id && <span className="party-check" aria-hidden="true">✓</span>}
          </BotPad>)}
        </div>
        <div className="party-boarding"><Terrain realm={realm} /><div className="party-destination">
          {selector}<h2>{realm.domain} gyms</h2></div>{gymLinks}</div>
      </>}
    </div>
    <div className="eye-tools"><div><b>Eye reactions</b><p>Move across a portrait to guide its gaze. Tap to greet.</p></div>
      <div role="group" aria-label="Eye reaction">{reactions.map((r) => <button key={r} type="button"
        aria-pressed={reaction===r} onClick={() => setReaction(r)}>{r==="auto" ? "Follow" : r[0].toUpperCase()+r.slice(1)}</button>)}</div>
    </div>
  </section>;
}
