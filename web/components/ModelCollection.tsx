"use client";
import { PixelArrow } from "@/components/ui/pixel-arrow";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useApi, usd } from "@/lib/client";
import { botForLook, type TrainerSprite } from "@/lib/looks";
import type { Model } from "@/lib/types";
import { GymPanel } from "./GymPanel";
import { MotionSurface, PixelButton } from "./ui/game-controls";
import { PixelSelect } from "./ui/pixel-select";
import { BotArt } from "./BotArt";
import { OpenWater } from "./OpenWater";
import { useCurrentTrainer } from "./current-trainer";
import { PartyHeader } from "./MenuBar";
import { defaultPortrait, savedDevicePortrait } from "@/lib/creator-profiles";
import { ModelPanel } from "./ModelPanel";
import "./model-collection.css";

function TrainerArt({ sprite, size = 112 }: { sprite: TrainerSprite; size?: number }) {
  return (
    <Image
      className="trainer-art"
      width={40}
      height={56}
      unoptimized
      src={`/trainers/${sprite}.png`}
      alt={sprite + " trainer"}
      style={{ height: size, width: "auto" }}
    />
  );
}
export function ModelCollection({ initialId }: { initialId?: string }) {
  const { data: models, error, setData, reload } = useApi<Model[]>("/api/models");
  const [handle, setHandle] = useCurrentTrainer();
  const [picked, setPicked] = useState<string | null>(initialId ?? null);
  const selected = models?.find((m) => m.id === picked);
  const owner = selected?.trainer ?? handle;
  useEffect(() => {
    if (selected?.trainer) setHandle(selected.trainer);
  }, [selected?.trainer, setHandle]);
  const roster = models?.filter((m) => (m.trainer ?? "local") === owner) ?? [];
  const handles = [...new Set(["local", ...(models ?? []).map((m) => m.trainer ?? "local")])];
  const { data: creator } = useApi<{ handle: string; avatar: TrainerSprite | null }>(
    `/api/creators/${encodeURIComponent(owner)}`,
  );
  const sprite =
    creator?.handle.toLowerCase() === owner.toLowerCase()
      ? (creator.avatar ?? savedDevicePortrait(owner) ?? defaultPortrait(owner))
      : defaultPortrait(owner);
  const [profile, showProfile] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const lastPage = Math.max(0, Math.ceil(roster.length / pageSize) - 1);
  const visiblePage = selected
    ? Math.floor(roster.findIndex((m) => m.id === selected.id) / pageSize)
    : Math.min(page, lastPage);
  const party = roster.slice(visiblePage * pageSize, (visiblePage + 1) * pageSize);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const trainerButton = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const inspection = selected ? "model/" + selected.id : profile ? "trainer" : null;
  function close() {
    setHandle(owner);
    setPage(visiblePage);
    setPicked(null);
    showProfile(false);
    requestAnimationFrame(() =>
      (trigger.current?.isConnected ? trigger.current : trainerButton.current)?.focus({
        preventScroll: true,
      }),
    );
  }
  useEffect(() => {
    if (inspection)
      root.current?.querySelector<HTMLButtonElement>(".place-close")?.focus({ preventScroll: true });
  }, [inspection]);
  return (
    <div
      className="model-collection"
      data-inspecting={inspection ? "true" : "false"}
      ref={root}
      onKeyDown={(e) => {
        if (
          e.key === "Escape" &&
          inspection &&
          !e.defaultPrevented &&
          !document.querySelector('dialog[open], .party-roster-menu, [role="listbox"]')
        ) {
          e.preventDefault();
          close();
        }
      }}
    >
      <OpenWater />
      <PartyHeader
        owner={owner}
        roster={roster}
        onSelect={(model, button) => {
          trigger.current = button;
          setHandle(owner);
          showProfile(false);
          setPicked(model.id);
        }}
        onCreated={(model) => {
          setHandle(model.trainer);
          setData([...(models ?? []), model]);
          showProfile(false);
          setPicked(model.id);
        }}
      />
      {error && (
        <p role="alert">
          {error} <button onClick={reload}>Retry</button>
        </p>
      )}
      {models && picked && !selected && <p role="alert">This model could not be found.</p>}
      <div
        className="party-field"
        data-compact-party={party.length <= 3}
        data-focus={selected ? "model" : profile ? "trainer" : "none"}
      >
        <div aria-hidden="true" className="party-island" />
        <section className="party-orbit" aria-label={owner + "’s model party"}>
          <button
            ref={trainerButton}
            className="party-trainer"
            type="button"
            aria-label={"Trainer profile for " + owner}
            disabled={!!inspection}
            onClick={(e) => {
              trigger.current = e.currentTarget;
              showProfile(true);
            }}
          >
            <TrainerArt sprite={sprite} />
            <span className="party-name">{owner}</span>
          </button>
          {party.map((model, index) => {
            const angle = (index / party.length) * 2 * Math.PI - Math.PI / 2;
            const active = model.id === selected?.id;
            return (
              <button
                key={model.id}
                className="party-model"
                title={model.name}
                type="button"
                aria-label={"Configure " + model.name}
                aria-pressed={active}
                disabled={!!inspection}
                style={{ "--dx": Math.cos(angle), "--dy": Math.sin(angle) } as CSSProperties}
                onClick={(e) => {
                  trigger.current = e.currentTarget;
                  setHandle(owner);
                  setPicked(model.id);
                }}
              >
                <BotArt id={botForLook(model.look)} animated />
                <span className="party-name">{model.name}</span>
              </button>
            );
          })}
        </section>
        <MotionSurface className="collection-inspector" value={inspection}>
          {(item) => {
            const model = item.startsWith("model/") ? models?.find((m) => m.id === item.slice(6)) : undefined;
            return model ? (
              <GymPanel
                key={model.id}
                className="inspector-sheet"
                label={model.name + " configuration"}
                kit="model"
                eyebrow="Model"
                heading={model.name}
                closeLabel="Return to trainer"
                onClose={close}
                art={null}
              >
                <ModelPanel
                  model={model}
                  onChange={(next) => setData((models ?? []).map((m) => (m.id === next.id ? next : m)))}
                />
              </GymPanel>
            ) : (
              <GymPanel
                className="inspector-sheet trainer-sheet"
                label="Trainer profile"
                kit="trainer"
                eyebrow="Trainer"
                heading={owner}
                closeLabel="Close trainer profile"
                onClose={close}
                art={null}
              >
                {handles.length > 1 && (
                  <PixelSelect
                    label="Trainer"
                    items={handles.map((id) => ({ id, name: id }))}
                    value={owner}
                    onChange={(id) => {
                      setPage(0);
                      setHandle(id);
                      setPicked(null);
                    }}
                  />
                )}
                <dl className="trainer-facts">
                  <div>
                    <dt>Models</dt>
                    <dd>{roster.length}</dd>
                  </div>
                  <div>
                    <dt>Vault balance</dt>
                    <dd>{usd(roster.reduce((n, m) => n + m.credits, 0))}</dd>
                  </div>
                </dl>
              </GymPanel>
            );
          }}
        </MotionSurface>
      </div>
      {!models && !error && (
        <p className="party-status" role="status">
          Loading models…
        </p>
      )}
      {models && !roster.length && <p className="party-status">Add a model to this trainer’s party.</p>}
      {!inspection && lastPage > 0 && (
        <nav className="party-pages" aria-label="Model party pages">
          <PixelButton
            aria-label="Previous models"
            disabled={!visiblePage}
            onClick={() => setPage(visiblePage - 1)}
          >
            <PixelArrow direction="left" size={16} />
          </PixelButton>
          <span>
            {visiblePage + 1} / {lastPage + 1}
          </span>
          <PixelButton
            aria-label="Next models"
            disabled={visiblePage === lastPage}
            onClick={() => setPage(visiblePage + 1)}
          >
            <PixelArrow size={16} />
          </PixelButton>
        </nav>
      )}
    </div>
  );
}
