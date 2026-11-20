"use client";
import { PixelArrow } from "@/components/ui/pixel-arrow";
import { choices, PixelInput, PixelRadioGroup } from "./ui/pixel-form";

import { useRouter } from "next/navigation";
import { useApi } from "@/lib/client";
import type { Model } from "@/lib/types";
import { MotionSurface } from "./ui/game-controls";
import { GymRoomScene } from "./GymInterior";
import { PixelSelect, PixelCheck } from "./ui/pixel-select";
import { GymDataTabs } from "./GymDataTabs";
import { useEffect, useState, type ReactNode } from "react";

import {
  bands,
  datasetCount,
  eligible,
  firstPrompt,
  skillCount,
  money,
  number,
  sum,
  trainCount,
  type Difficulty,
  type Realm,
  type RealmGym,
} from "@/lib/realms";

type Version = { gym: RealmGym; revision: number };
type Plan = {
  gym: string;
  botId: string;
  gymId: string;
  skillIds: string[];
  requestId: string;
  revision: number;
  skills: string[];
  difficulty: Difficulty;
  pool: number;
  tasks: number;
  rollouts: number;
  reps: number;
  cents: number;
};

function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  return (
    <>
      <div className="field-panel-head">
        <h2 id="dialog-title">{title}</h2>
        <button type="button" className="close-dialog" aria-label="Close" onClick={close}>
          ×
        </button>
      </div>
      {children}
    </>
  );
}

function RunPreview({ plan, close }: { plan: Plan; close: () => void }) {
  const router = useRouter();
  const [progress, setProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function startSession() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      if (plan.revision === 0) {
        const response = await fetch(`/api/gyms/${plan.gymId}/transactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: plan.requestId,
            botId: plan.botId,
            skills: plan.skillIds,
            tasks: plan.tasks,
            rollouts: plan.rollouts,
            difficulty: plan.difficulty,
          }),
        });
        if (!response.ok) throw new Error((await response.json()).error);
        router.push("/live/" + encodeURIComponent("atlas-" + plan.requestId));
        return;
      }
      setProgress(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start this session.");
    } finally {
      setSaving(false);
    }
  }
  const running = progress !== null && progress < 100;
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setProgress((last) => Math.min(100, (last ?? 0) + 10)), 240);
    return () => clearInterval(timer);
  }, [running]);
  const completed = Math.floor((plan.reps * (progress ?? 0)) / 100);
  return (
    <Modal
      title={
        progress === null
          ? "Training session preview"
          : running
            ? "Session preview running"
            : "Session preview complete"
      }
      close={close}
    >
      <p>
        {plan.gym} · v1.{plan.revision} · {plan.difficulty} difficulty
      </p>
      <ul className="skill-chips">
        {plan.skills.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <dl className="field-metrics">
        <div>
          <dt>Authorized training pool</dt>
          <dd>{number(plan.pool)}</dd>
        </div>
        <div>
          <dt>Distinct tasks × rollouts</dt>
          <dd>
            {number(plan.tasks)} × {plan.rollouts}
          </dd>
        </div>
        <div>
          <dt>Graded reps</dt>
          <dd>{number(plan.reps)}</dd>
        </div>
        <div>
          <dt>Estimated grading cost</dt>
          <dd>{money(plan.reps * plan.cents)}</dd>
        </div>
      </dl>
      {progress === null ? (
        <>
          <p className="field-note">
            This preview estimates grading for the selected tasks. Train on your own computer and submit
            outputs to Modélmon for scoring.
          </p>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <button type="button" className="field-primary" disabled={saving} onClick={startSession}>
            Start preview
          </button>
        </>
      ) : (
        <>
          <progress value={progress} max={100} aria-label="Session preview progress" />
          <p aria-live="polite">
            {number(completed)} reps · {money(completed * plan.cents)} estimated cost
          </p>
          {error && <p role="alert">{error}</p>}
          <button type="button" className="field-primary" onClick={close}>
            {running ? "Close preview" : "Done"}
          </button>
        </>
      )}
    </Modal>
  );
}

function Trainer({ gym, revision, skillId }: Version & { skillId: string }) {
  const { data: models, error: modelError } = useApi<Model[]>("/api/models");
  const [chosenBot, setChosenBot] = useState("");
  const botId = chosenBot || models?.[0]?.id || "";
  const station = gym.skills.find((s) => s.id === skillId);
  const [selected, setSelected] = useState([skillId]);
  const botDefaults = models?.find((m) => m.id === botId)?.trainingDefaults;
  const [difficultyOverride, setDifficulty] = useState<Difficulty | null>(null);
  const difficulty = difficultyOverride ?? botDefaults?.difficulty ?? "Adaptive";
  const [distinct, setDistinct] = useState(() => {
    const available = sum(gym.skills.filter((s) => selected.includes(s.id)).map(skillCount));
    return String(Math.max(1, Math.min(5000, available)));
  });
  const [rolloutOverride, setRollouts] = useState<number | null>(null);
  const rollouts = rolloutOverride ?? botDefaults?.rollouts ?? 8;
  const [budget, setBudget] = useState("");
  const [preview, setPreview] = useState<Plan | null>(null);
  const toggle = (id: string) =>
    setSelected((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  const hasUncalibrated = gym.skills.some((s) => s.records?.length);
  const showBands = !hasUncalibrated || gym.skills.some((s) => s.training.some(Boolean));
  const chosen = gym.skills.filter((s) => selected.includes(s.id));
  const pool = sum(chosen.map((s) => eligible(s, difficulty)));
  const tasks = Number(distinct);
  const validCount = Number.isSafeInteger(tasks) && tasks > 0 && tasks <= datasetCount(gym);
  const reps = tasks * rollouts;
  const cost = reps * gym.cents;
  let problem = "";
  if (!chosen.length) problem = "Select at least one skill station.";
  else if (!Number.isSafeInteger(tasks) || tasks <= 0)
    problem = "Enter a positive whole number of distinct tasks.";
  else if (tasks > pool)
    problem = `Only ${number(pool)} tasks are available at this difficulty. Reduce the task count or select Adaptive.`;
  else if (budget && (!Number.isFinite(Number(budget)) || Number(budget) <= 0))
    problem = "Enter a positive grading budget.";
  else if (budget && cost > Math.round(Number(budget) * 100))
    problem = "Estimated grading cost exceeds your budget.";

  return (
    <div className="workshop-columns">
      <section className="field-panel skill-panel">
        <div className="field-panel-head">
          <h2>Training classes</h2>
          <span>
            {chosen.length} of {gym.skills.length} selected
          </span>
        </div>
        {station && firstPrompt(station) && <p className="station-example">{firstPrompt(station)}</p>}
        <div className="field-panel-head distribution-head">
          <h3>Training distribution</h3>
          <span>Distinct tasks</span>
        </div>
        <div className="field-table-scroll">
          <table className="skill-table">
            <thead>
              <tr>
                <th>Skill</th>
                {showBands &&
                  bands.map((b, i) => (
                    <th key={b} aria-label={b}>
                      <span className="full-band">{b}</span>
                      <span className="short-band">{["Beg.", "Int.", "Adv."][i]}</span>
                    </th>
                  ))}
                {hasUncalibrated && <th>Uncalibrated</th>}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {gym.skills.map((s, i) => (
                <tr key={s.id} data-selected={selected.includes(s.id)}>
                  <th scope="row">
                    <label>
                      <PixelCheck checked={selected.includes(s.id)} onChange={() => toggle(s.id)} />
                      <span className="station-index">{i + 1}</span>
                      {s.name}
                    </label>
                  </th>
                  {showBands &&
                    s.training.map((n, j) => (
                      <td key={j} data-active={difficulty === bands[j]}>
                        {number(n)}
                      </td>
                    ))}
                  {hasUncalibrated && <td>{number(s.records?.length ?? 0)}</td>}
                  <td>
                    <b>{number(skillCount(s))}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="training-access-note">
          {hasUncalibrated
            ? "Adaptive includes tasks without a difficulty rating. Specific difficulty levels require calibration."
            : `Stations draw from ${number(trainCount(gym))} training tasks.`}
        </p>
        <details className="field-details">
          <summary>Sample tasks</summary>
          <ul>
            {gym.skills.map((s) => (
              <li key={s.id}>
                <b>{s.name}.</b> {firstPrompt(s)}
              </li>
            ))}
          </ul>
        </details>
      </section>
      <section className="field-panel session-panel">
        <div className="field-panel-head">
          <h2>Training session</h2>
        </div>
        <PixelSelect
          label="Difficulty"
          items={choices(["Adaptive", ...bands] as const)}
          value={difficulty}
          onChange={setDifficulty}
        />
        <label className="field-input">
          Distinct training tasks
          <PixelInput
            type="number"
            min={1}
            step={1}
            value={distinct}
            onChange={(e) => setDistinct(e.target.value)}
          />
        </label>
        <PixelRadioGroup
          label="Rollouts per task"
          name="rollouts"
          value={rollouts}
          items={choices([4, 8, 16, 32])}
          onChange={setRollouts}
        />
        <PixelSelect
          label="Training bot"
          items={(models ?? []).map((b) => ({ id: b.id, name: `${b.name} · ${b.trainer ?? "local"}` }))}
          value={botId}
          onChange={(id) => {
            setChosenBot(id);
            setDifficulty(null);
            setRollouts(null);
          }}
        />
        {modelError && <p role="alert">{modelError}</p>}
        <details className="budget-details">
          <summary>Grading budget {budget ? `· $${budget}` : "(optional)"}</summary>
          <label className="field-input">
            Maximum spend in USD
            <PixelInput
              type="number"
              min=".01"
              step=".01"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </label>
        </details>
        <div className="estimate-box" aria-live="polite">
          <dl className="field-metrics">
            <div>
              <dt>Selected training pool</dt>
              <dd>{number(pool)}</dd>
            </div>
            <div>
              <dt>Planned graded reps</dt>
              <dd>{validCount ? number(reps) : "—"}</dd>
            </div>
            <div>
              <dt>Price per rep</dt>
              <dd>{money(gym.cents)}</dd>
            </div>
            <div className="estimate-total">
              <dt>Estimated grading cost</dt>
              <dd>{validCount ? money(cost) : "—"}</dd>
            </div>
          </dl>
        </div>
        {problem && (
          <p className="field-error" role="status">
            {problem}
          </p>
        )}
        <button
          type="button"
          className="field-primary"
          disabled={!!problem || !botId}
          onClick={() =>
            setPreview({
              botId,
              gym: gym.name,
              gymId: gym.id,
              skillIds: chosen.map((s) => s.id),
              requestId: crypto.randomUUID(),
              revision,
              skills: chosen.map((s) => s.name),
              difficulty,
              pool,
              tasks,
              rollouts,
              reps,
              cents: gym.cents,
            })
          }
        >
          Preview training session <PixelArrow />
        </button>
        <p className="field-note">
          Illustrative grading cost covers {rollouts} rollouts per distinct task. GPU and evaluation fees are
          excluded.
        </p>
      </section>
      <MotionSurface
        modal
        value={preview}
        className="session-dialog"
        labelledBy="dialog-title"
        onDismiss={() => setPreview(null)}
      >
        {(plan) => <RunPreview key={plan.requestId} plan={plan} close={() => setPreview(null)} />}
      </MotionSurface>
    </div>
  );
}

function Creator({ gym, revision, publish }: Version & { publish: (g: RealmGym) => void }) {
  const [draft, setDraft] = useState(false);
  const [count, setCount] = useState("1000");
  const [skill, setSkill] = useState(gym.skills[0].id);
  const [band, setBand] = useState(0);
  const [trainPct, setTrainPct] = useState(80);
  const [devPct, setDevPct] = useState(10);
  const [evidence, setEvidence] = useState(false);
  const total = datasetCount(gym);
  const incoming = Number(count);
  const valid =
    Number.isSafeInteger(incoming) && incoming >= 100 && incoming <= 1000000 && trainPct + devPct < 100;
  const training = Math.floor((incoming * trainPct) / 100);
  const development = Math.floor((incoming * devPct) / 100);
  const heldOut = incoming - training - development;
  const newDraft = () => {
    setCount("1000");
    setSkill(gym.skills[0].id);
    setBand(0);
    setTrainPct(80);
    setDevPct(10);
    setEvidence(false);
    setDraft(true);
  };
  const save = () => {
    if (!valid || !evidence) return;
    publish({
      ...gym,
      development: gym.development + development,
      heldOut: gym.heldOut + heldOut,
      skills: gym.skills.map((s) =>
        s.id === skill ? { ...s, training: s.training.map((n, i) => n + (i === band ? training : 0)) } : s,
      ),
    });
    setDraft(false);
    setEvidence(false);
  };
  return (
    <div className="workshop-columns">
      <section className="field-panel creator-panel">
        <div className="field-panel-head">
          <h2>Dataset partitions</h2>
          <span>{revision ? `Draft v1.${revision}` : "v1.0"}</span>
        </div>
        <div className="partition-bar" aria-hidden="true">
          {[trainCount(gym), gym.development, gym.heldOut].map((n, i) => (
            <i key={i} style={{ flexGrow: n }} />
          ))}
        </div>
        <dl className="partition-legend">
          {[
            ["Training", trainCount(gym), "Selectable by skill and difficulty"],
            ["Development", gym.development, "Reserved for creator calibration"],
            ["Held-out evaluation", gym.heldOut, "Reserved for the sealed evaluator"],
          ].map(([name, n, desc]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>
                {number(Number(n))} <small> · {total ? Math.round((Number(n) / total) * 100) : 0}%</small>
              </dd>
              <p>{desc}</p>
            </div>
          ))}
        </dl>
        <h3>Skill taxonomy</h3>
        <ul className="taxonomy">
          {gym.skills.map((s, i) => (
            <li key={s.id}>
              <b>
                {i + 1}. {s.name}
              </b>
              <span>{firstPrompt(s)}</span>
            </li>
          ))}
        </ul>
        <details className="field-details">
          <summary>Version evidence</summary>
          <p>
            Illustrative release manifest: task groups, grader specification, reference outputs and per-skill
            calibration counts. The trainer sees aggregate availability and quality evidence.
          </p>
        </details>
      </section>
      <section className="field-panel session-panel">
        <div className="field-panel-head">
          <h2>{draft ? `Draft v1.${revision + 1}` : "Version workspace"}</h2>
        </div>
        <p className="creator-copy">
          {draft
            ? "Assign a new draft batch to one skill and calibrate its split. Existing sealed cases keep their original assignments."
            : "A sealed version fixes the skill taxonomy and dataset split. Stage a new batch to try the creator workflow."}
        </p>
        {draft ? (
          <>
            <PixelSelect label="Training class" value={skill} items={gym.skills} onChange={setSkill} />
            <PixelSelect
              label="Calibrated difficulty"
              items={bands.map((name, id) => ({ id, name }))}
              value={band}
              onChange={setBand}
            />
            <label className="field-input">
              New tasks in draft
              <PixelInput
                type="number"
                min={100}
                max={1000000}
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
            </label>
            <div className="split-inputs">
              <PixelSelect
                label="Train %"
                items={choices([60, 70, 80, 85])}
                value={trainPct}
                onChange={setTrainPct}
              />
              <PixelSelect label="Dev %" items={choices([5, 10, 15])} value={devPct} onChange={setDevPct} />
            </div>
            <p className="field-note">
              {valid
                ? `${number(training)} train · ${number(development)} dev · ${number(heldOut)} held out`
                : "Use 100–1,000,000 whole tasks and reserve a positive held-out share."}
            </p>
            <label className="evidence-check">
              <PixelCheck checked={evidence} onChange={() => setEvidence(!evidence)} />
              Attach sample validation evidence
            </label>
            <button type="button" className="field-primary" disabled={!valid || !evidence} onClick={save}>
              Apply to local draft
            </button>
            <button type="button" className="field-secondary" onClick={() => setDraft(false)}>
              Discard draft
            </button>
          </>
        ) : (
          <button type="button" className="field-primary" onClick={newDraft}>
            Stage a draft batch <PixelArrow />
          </button>
        )}
        <p className="field-note">Draft counts apply only to this visit.</p>
      </section>
    </div>
  );
}

export function GymWorkshop({ gym: initial, realm, seed }: { gym: RealmGym; realm: Realm; seed?: string }) {
  const [version, setVersion] = useState<Version>({ gym: initial, revision: 0 });
  const { gym, revision } = version;
  const exitHref = `/gyms?realm=${realm.id}&gym=${gym.id}${seed ? "&seed=" + encodeURIComponent(seed) : ""}`;
  return (
    <GymRoomScene gym={gym} version={`v1.${revision}`} exitHref={exitHref}>
      {(view) =>
        view.kind === "info" ? (
          <GymDataTabs gym={initial} />
        ) : view.kind === "class" ? (
          <Trainer key={view.id} {...version} skillId={view.id} />
        ) : (
          <Creator {...version} publish={(g) => setVersion({ gym: g, revision: revision + 1 })} />
        )
      }
    </GymRoomScene>
  );
}
