"use client";
import Image from "next/image";
import { PixelForm, PixelInput } from "./ui/pixel-form";

import Link from "next/link";
import { useState } from "react";
import { api, post, shortTx, usd } from "@/lib/client";
import { modelCard } from "@/lib/model-catalog";
import { gymById } from "@/lib/gyms";
import type { Eval, Model } from "@/lib/types";
import { BotHeadPicker } from "./SpritePicker";
import { botForLook, type BotId } from "@/lib/looks";
import { bands, type Difficulty } from "@/lib/realms";
import { Tabs } from "radix-ui";
import { PixelSelect } from "./ui/pixel-select";
import { PixelButton } from "./ui/game-controls";
import "./gym-data.css";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Sealed scores at one Gym over time, on a fixed 0 to 100 scale so Gyms can be compared. */
function ScoreChart({ evals }: { evals: Eval[] }) {
  const w = 520;
  const h = 96;
  const pad = 8;
  const x = (i: number) => (evals.length === 1 ? w / 2 : pad + (i / (evals.length - 1)) * (w - pad * 2));
  const y = (score: number) => h - pad - (score / 100) * (h - pad * 2);
  return (
    <svg
      className="eval-chart"
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={`Scores over time: ${evals.map((e) => `${e.score}% on ${day(e.at)}`).join(", ")}`}
    >
      {[0, 50, 100].map((v) => (
        <line key={v} x1={0} x2={w} y1={y(v)} y2={y(v)} />
      ))}
      <polyline points={evals.map((e, i) => `${x(i)},${y(e.score)}`).join(" ")} />
      {evals.map((e, i) => (
        <circle key={e.at} cx={x(i)} cy={y(e.score)} r={i === evals.length - 1 ? 5 : 3.5} />
      ))}
    </svg>
  );
}

function Configuration({ model, onChange }: { model: Model; onChange: (m: Model) => void }) {
  const [name, setName] = useState(model.name),
    [head, setHead] = useState<BotId>(botForLook(model.look));
  const [difficulty, setDifficulty] = useState<Difficulty>(model.trainingDefaults?.difficulty ?? "Adaptive"),
    [rollouts, setRollouts] = useState(String(model.trainingDefaults?.rollouts ?? 8));
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const dirty =
    name.trim() !== model.name ||
    head !== botForLook(model.look) ||
    difficulty !== (model.trainingDefaults?.difficulty ?? "Adaptive") ||
    Number(rollouts) !== (model.trainingDefaults?.rollouts ?? 8);
  return (
    <PixelForm
      className="model-config"
      onChange={() => setMessage("")}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!dirty || busy) return;
        setBusy(true);
        setMessage("");
        try {
          const saved = await api<Model>(`/api/models/${model.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name, look: { bot: head }, difficulty, rollouts: Number(rollouts) }),
          });
          onChange(saved);
          setName(saved.name);
          setMessage("Settings saved.");
        } catch (e) {
          setMessage(e instanceof Error ? e.message : "Could not save settings.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Model name
        <PixelInput
          value={name}
          required
          minLength={2}
          maxLength={48}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <BotHeadPicker
        value={head}
        onChange={(id) => {
          setHead(id);
          setMessage("");
        }}
      />
      <PixelSelect
        label="Default difficulty"
        value={difficulty}
        onChange={setDifficulty}
        items={["Adaptive" as const, ...bands].map((id) => ({ id, name: id }))}
      />
      <PixelSelect
        label="Rollouts per task"
        value={rollouts}
        onChange={setRollouts}
        items={["4", "8", "16", "32"].map((id) => ({ id, name: id }))}
      />
      <PixelButton tone="gold" type="submit" disabled={!dirty || busy}>
        {busy ? "Saving…" : "Save settings"}
      </PixelButton>
      {message && <p role="status">{message}</p>}
    </PixelForm>
  );
}

/**
 * Everything about one model: its character, vault and credits on the left,
 * its sealed evaluations per Gym over time on the right.
 */
export function ModelPanel({ model, onChange }: { model: Model; onChange: (m: Model) => void }) {
  const card = modelCard(model.base);
  const [amount, setAmount] = useState(100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deposit() {
    setBusy(true);
    setError(null);
    try {
      onChange(await post<Model>(`/api/models/${model.id}/credits`, { amount }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Group sealed evaluations by Gym, most recently tested Gym first.
  const byGym = new Map<string, Eval[]>();
  for (const e of [...model.evals].sort((a, b) => a.at.localeCompare(b.at)))
    byGym.set(e.gymId, [...(byGym.get(e.gymId) ?? []), e]);
  const groups = [...byGym.entries()].sort((a, b) => b[1].at(-1)!.at.localeCompare(a[1].at(-1)!.at));

  return (
    <Tabs.Root className="collection-model-tabs" defaultValue="settings">
      <p className="model-checkpoint">
        {model.base !== model.name && <>{model.base} · </>}Checkpoint #{model.hash}
        {card && (
          <>
            <br />
            {card.total} parameters{card.active && ` · ${card.active} active per token`} ·{" "}
            <a
              className="model-card-link"
              href={`https://huggingface.co/${card.repository}`}
              target="_blank"
              rel="noreferrer"
            >
              <Image src="/providers/huggingface.svg" width={16} height={16} alt="" unoptimized /> Model card
            </a>
          </>
        )}
      </p>
      <Tabs.List aria-label="Model configuration" className="gym-tab-list">
        {[
          ["settings", "Settings"],
          ["vault", "Vault"],
          ["results", "Evaluations"],
        ].map(([id, name]) => (
          <Tabs.Trigger key={id} value={id}>
            {name}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      <Tabs.Content value="settings">
        <Configuration model={model} onChange={onChange} />
      </Tabs.Content>
      <Tabs.Content value="vault">
        <div className="card pad vault">
          <dl className="facts">
            <div>
              <dt>Credits</dt>
              <dd data-tone={model.credits > 0 ? "good" : undefined}>{usd(model.credits)}</dd>
            </div>
            <div>
              <dt>Payment-channel vault</dt>
              <dd className="mono">{shortTx(model.vault)}</dd>
            </div>
          </dl>
          <PixelForm
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              deposit();
            }}
          >
            <label className="sr-only" htmlFor={`deposit-${model.id}`}>
              Amount to add in USDC
            </label>
            <PixelInput
              id={`deposit-${model.id}`}
              type="number"
              min={1}
              max={10000}
              step={10}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
            <button className="btn btn-quiet" disabled={busy}>
              {busy ? "Adding…" : "Add credits"}
            </button>
          </PixelForm>
          <Link href="/gyms" className="btn">
            Train at a Gym
          </Link>
          {error && (
            <p className="msg" data-tone="bad" role="alert">
              {error}
            </p>
          )}
        </div>
      </Tabs.Content>

      <Tabs.Content value="results" className="model-evals" aria-label="Sealed evaluations">
        <h3>Sealed evaluations</h3>
        {groups.length === 0 ? (
          <div className="card pad">
            <p>{model.name} has not been evaluated yet.</p>
            <p className="sub">
              Train it at a Gym, settle the run, then run the sealed evaluation. Each result lands here.
            </p>
          </div>
        ) : (
          <>
            <p className="sub">
              {model.evals.length} results across {groups.length} {groups.length === 1 ? "Gym" : "Gyms"}, each
              on held-out tasks.
            </p>
            <ul>
              {groups.map(([gymId, evals]) => {
                const gym = gymById(gymId);
                const first = evals[0];
                const last = evals.at(-1)!;
                return (
                  <li key={gymId} className="card pad">
                    <header className="head">
                      <div>
                        <h4>
                          <i className="roof-dot" style={{ background: gym?.roof }} />
                          {gym ? <Link href={`/gyms/${gym.id}`}>{gym.name}</Link> : gymId}
                        </h4>
                        <p className="sub">{gym?.taskType}</p>
                      </div>
                      <p className="eval-now">
                        <b>{last.score}%</b>
                        {evals.length > 1 && (
                          <span data-tone="good">
                            +{last.score - first.score} pts since {day(first.at)}
                          </span>
                        )}
                      </p>
                    </header>
                    <ScoreChart evals={evals} />
                    <ol className="eval-list">
                      {evals.map((e) => (
                        <li key={e.at}>
                          <span>{day(e.at)}</span>
                          <b>{e.score}%</b>
                          <span className="mono">#{e.hash}</span>
                        </li>
                      ))}
                    </ol>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Tabs.Content>
    </Tabs.Root>
  );
}
