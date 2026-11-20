"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Popover } from "radix-ui";
import { Plus } from "lucide-react";
import { t } from "@/lib/words";
import { useApi } from "@/lib/client";
import { botForLook } from "@/lib/looks";
import type { Model } from "@/lib/types";
import { BotArt } from "./BotArt";
import { AddModel } from "./AddModel";
import { PixelButton } from "./ui/game-controls";
import { useCurrentTrainer } from "./current-trainer";
import "./menu-bar.css";

export function MenuBar() {
  const path = usePathname();
  return path === "/" || path.startsWith("/models/") ? null : <LinkedMenu key={path} />;
}

function LinkedMenu() {
  const router = useRouter();
  const [owner] = useCurrentTrainer();
  const { data } = useApi<Model[]>("/api/models");
  const open = (model: Model) => router.push("/models/" + encodeURIComponent(model.id));
  return (
    <PartyHeader
      owner={owner}
      roster={data?.filter((m) => (m.trainer ?? "local") === owner) ?? []}
      onSelect={open}
      onCreated={open}
    />
  );
}

export function PartyHeader({
  owner,
  roster,
  onSelect,
  onCreated,
}: {
  owner: string;
  roster: Model[];
  onSelect: (model: Model, trigger: HTMLButtonElement | null) => void;
  onCreated: (model: Model) => void;
}) {
  const path = usePathname();
  const [adding, setAdding] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const rosterButton = useRef<HTMLButtonElement>(null);
  const openingModel = useRef(false);
  const items = [
    { href: "/", label: t.models, active: path === "/" || path.startsWith("/models") },
    { href: "/gyms", label: t.gyms, active: path.startsWith("/gyms") || path.startsWith("/realms") },
    { href: "/live", label: t.live, active: path.startsWith("/live") },
  ];
  return (
    <>
      <header className="menubar party-menubar">
        <Link className="modelmon-wordmark" href="/" aria-label="Modélmon home">
          <Image
            src="/modelmon-logo.png"
            alt="Modélmon"
            width={2131}
            height={738}
            sizes="(max-width: 500px) 18vw, (max-width: 1000px) 16vw, 210px"
            priority
          />
        </Link>
        <nav aria-label="Main">
          {items.map((item) => (
            <Link key={item.href} href={item.href} aria-current={item.active ? "page" : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="party-actions">
          <Popover.Root open={rosterOpen} onOpenChange={setRosterOpen}>
            <Popover.Trigger asChild>
              <button ref={rosterButton} type="button" className="party-count">
                {roster.length} {roster.length === 1 ? "model" : "models"}
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="party-roster-menu"
                align="end"
                sideOffset={6}
                aria-label="Models in this party"
                onCloseAutoFocus={(e) => {
                  if (openingModel.current) e.preventDefault();
                  openingModel.current = false;
                }}
              >
                {roster.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      openingModel.current = true;
                      onSelect(model, rosterButton.current);
                      setRosterOpen(false);
                    }}
                  >
                    <BotArt id={botForLook(model.look)} size={24} />
                    {model.name}
                  </button>
                ))}
                {!roster.length && <p>No models yet.</p>}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <PixelButton tone="gold" type="button" aria-label="Add model" onClick={() => setAdding(true)}>
            <Plus size={16} />{" "}
            <span>
              Add<span className="action-suffix"> model</span>
            </span>
          </PixelButton>
        </div>
      </header>
      <AddModel
        key={owner}
        initialTrainer={owner}
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(model) => {
          setAdding(false);
          onCreated(model);
        }}
      />
    </>
  );
}
