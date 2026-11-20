"use client";
import { PixelSelect } from "./ui/pixel-select";
import { PixelForm, PixelInput } from "./ui/pixel-form";

import Link from "next/link";
import { GymRoomScene } from "./GymInterior";
import { realmGyms } from "@/lib/realms";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BotArt } from "./BotArt";
import { GymTrustPanel } from "./TrustLayer";
import { GymResults } from "./GymResults";
import { roomForCategory } from "./Scene";
import { botForLook } from "@/lib/looks";
import { int, post, usd, useApi } from "@/lib/client";
import type { Gym, Model, RunSnapshot } from "@/lib/types";
import { t } from "@/lib/words";

function StartRun({
  gym,
  models,
  model,
  onPick,
}: {
  gym: Gym;
  models: Model[] | null;
  model?: Model;
  onPick: (id: string) => void;
}) {
  const router = useRouter();
  const [budget, setBudget] = useState(250);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (gym.status !== "open") {
    return (
      <p className="msg" data-tone="warn">
        {gym.status === "exclusive"
          ? `A lab holds an exclusive window here until ${new Date(gym.exclusiveUntil!).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. The Gym opens to everyone when it ends.`
          : "This Gym is still being sealed. It opens once its quality checks pass."}
      </p>
    );
  }

  const short = model ? model.credits < budget : false;

  async function start() {
    if (!model) return;
    setBusy(true);
    setError(null);
    try {
      const run = await post<RunSnapshot>("/api/runs", { gymId: gym.id, modelId: model.id, budget });
      router.push(`/live/${run.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <PixelForm
      className="start"
      onSubmit={(e) => {
        e.preventDefault();
        start();
      }}
    >
      <PixelSelect
        label="Model"
        value={model?.id ?? ""}
        items={(models ?? []).map((m) => ({ id: m.id, name: `${m.name} (${usd(m.credits)} in vault)` }))}
        disabled={!models}
        onChange={onPick}
      />
      <label>
        {t.budget} (USDC)
        <PixelInput
          type="number"
          min={10}
          max={1000}
          step={10}
          value={budget}
          onChange={(e) => setBudget(Number(e.target.value))}
        />
      </label>
      {model && short ? (
        <p className="msg" data-tone="warn">
          {model.name}’s vault holds {usd(model.credits)}.{" "}
          <Link href={`/models/${model.id}`}>Add credits</Link> or lower the budget.
        </p>
      ) : (
        <p className="hint">
          Buys up to {int(Math.floor(budget / gym.pricePerRep))} {t.reps.toLowerCase()}, paid from the model’s
          vault. Close early and the rest goes back.
        </p>
      )}
      <button className="btn" disabled={busy || !model || short}>
        {busy ? "Starting…" : t.start}
      </button>
      {error && (
        <p className="msg" data-tone="bad" role="alert">
          {error}
        </p>
      )}
    </PixelForm>
  );
}

/** A registry record can also be opened from a model's past evaluations. */
export function RegisteredGym({ gym }: { gym: Gym }) {
  const { data: models, error } = useApi<Model[]>("/api/models");
  const [picked, setPicked] = useState("");
  const model = models?.find((m) => m.id === picked) ?? models?.[0];
  const theme = realmGyms.find((g) => g.id === roomForCategory[gym.category])!;
  const room = {
    id: gym.id,
    name: gym.name,
    realm: theme.realm,
    skills: [{ id: "train", name: gym.taskType, prop: theme.skills[0].prop }],
  };
  return (
    <GymRoomScene gym={room} version={gym.graderVersion} exitHref="/gyms">
      {(view) => {
        if (view.kind === "class")
          return (
            <section className="field-panel session-panel">
              <h3>Training session</h3>
              {model && <BotArt id={botForLook(model.look)} animated size={72} label={model.name} />}
              <StartRun gym={gym} model={model} models={models} onPick={setPicked} />
              {error && <p role="alert">{error}</p>}
            </section>
          );
        const onchain = (gym as Gym & { onchain?: { address: string; grader: string; hardware: string } }).onchain;
        if (view.kind === "vault")
          return (
            <section className="registry-record">
              <h3>Grading and quality checks</h3>
              <p>{gym.grading.detail}</p>
              <p>
                {int(gym.trainTasks)} training tasks · {int(gym.heldOutTasks)} held out
              </p>
              <p>
                {gym.graderVersion} · {gym.codeHash} · {usd(gym.pricePerRep)} per rep
              </p>
              {onchain && (
                <p>
                  Listed on Solana devnet ·{" "}
                  <a href={`https://explorer.solana.com/address/${onchain.address}?cluster=devnet`} target="_blank" rel="noreferrer">
                    Gym account
                  </a>{" "}
                  · grader {onchain.grader.slice(0, 6)}… · hardware {onchain.hardware}
                </p>
              )}
              <ul>
                {gym.checks.map((c) => (
                  <li key={c.label}>
                    {c.label} · {c.passed ? "Passed" : "Pending"}
                  </li>
                ))}
              </ul>
              {onchain && <GymResults gymId={gym.id} />}
              {onchain && <GymTrustPanel gymId={gym.id} />}
            </section>
          );
        return (
          <section className="registry-record">
            <h3>Training samples</h3>
            <p>{gym.purpose}</p>
            <ul>
              {gym.sampleTasks.map((task) => (
                <li key={task}>{task}</li>
              ))}
            </ul>
            <details>
              <summary>Training report</summary>
              <p>{gym.bestFor}</p>
              <p>{gym.whyHard}</p>
              {gym.report && (
                <p>
                  {gym.report.models} models · median gain {gym.report.medianGain} points ·{" "}
                  {usd(gym.report.costPerPoint)} per point · {gym.report.regressionRate}% regression rate
                </p>
              )}
            </details>
          </section>
        );
      }}
    </GymRoomScene>
  );
}
