"use client";
import { useEffect, useState } from "react";
import { BotArt } from "./BotArt";
import { ChoiceBar, PixelButton } from "./ui/game-controls";
import { RunLog } from "./RunLog";
import { RunWorkers } from "./RunWorkers";
import { RunAttestation } from "./RunAttestation";
import { RunChain, SandboxGrid, useGymVerification, useRunChannel } from "./RunSealed";
import { RunBudget } from "./RunBudget";
import { PixelScrollBox } from "./ui/pixel-scroll-box";
import { PixelSelect } from "./ui/pixel-select";
import Image from "next/image";
import Link from "next/link";
import { Landmark, ScrollText, Vault } from "lucide-react";
import { ScoreHistory } from "./ScoreHistory";
import { int, post } from "@/lib/client";
import { laneFor, lanes, isActiveRun, type MonitorRun, type MonitorEvent } from "@/lib/run-monitor";
import { coins } from "@/lib/run-monitor";

type Panel = "Workers" | "Grader" | "Budget" | "Events";

export function LiveRun({ run: r }: { run: MonitorRun }) {
  const [panel, setPanel] = useState<Panel>("Grader"),
    [lane, setLane] = useState(""),
    [group, setGroup] = useState("");
  const [tape, setTape] = useState<MonitorEvent[]>([]),
    [frame, setFrame] = useState(0),
    [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [showLog, setShowLog] = useState(false);
  const { data: channel } = useRunChannel(r);
  const { data: verification } = useGymVerification(r.gymId);
  const events = r.events;
  const gym = r.gymProfile;
  const legacyTrainerMetric =
    r.source === "Reported" && !!r.history.length && !r.scoreHistory && !r.rolloutScores;
  const hasChainReceipts = r.source === "Reported" || r.source === "Devnet";
  const chartMeans = r.scoreHistory ?? (r.source !== "Reported" || legacyTrainerMetric ? r.history : []);
  const playback = tape.length > 0;
  useEffect(() => {
    if (!playback || frame >= tape.length - 1) return;
    const t = setTimeout(() => setFrame((n) => n + 1), 900 / speed);
    return () => clearTimeout(t);
  }, [playback, tape.length, frame, speed]);
  const chooseGroup = (g: string) => {
    setGroup(g);
    setTape(events.filter((e) => e.group === g));
    setFrame(0);
    setPanel("Events");
    setLane("");
  };
  const tabs = [
    { id: "Workers", name: "Workers", icon: <BotArt id={r.model.head} size={22} /> },
    { id: "Grader", name: "Grader", icon: <Vault size={19} aria-hidden="true" /> },
    {
      id: "Budget",
      name: "Budget",
      icon: <Image src="/providers/solana.svg" alt="" width={21} height={18} unoptimized />,
    },
    { id: "Events", name: "Events", icon: <ScrollText size={19} aria-hidden="true" /> },
  ] as const;
  async function act() {
    setBusy(true);
    setError("");
    try {
      if (r.action === "evaluate")
        await post("/api/gyms/" + encodeURIComponent(r.gymId) + "/evaluations", { requestId: r.session });
      else await post("/api/runs/" + encodeURIComponent(r.id) + "/" + r.action);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function tamper() {
    setBusy(true);
    setError("");
    try {
      await post("/api/v1/demo/tamper", { channel: r.channel, gymId: r.gymId });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="live-hero">
        <div className="live-gym-identity">
          <span className="live-gym-portrait" data-portrait={gym?.portrait}>
            {gym ? (
              <Image src={gym.image} width={64} height={64} unoptimized alt="" />
            ) : (
              <Landmark aria-hidden="true" />
            )}
          </span>
          <div>
            {gym?.domain && <small>{gym.domain}</small>}
            <h1>{gym ? <Link href={`/gyms/${encodeURIComponent(r.gymId)}`}>{gym.name}</Link> : r.gym}</h1>
            {gym && (
              <p className="live-gym-credit">
                {gym.byline}
                {gym.benchmark && <span> · {gym.benchmark} benchmark</span>}
              </p>
            )}
          </div>
          <span className="monitor-state" data-active={isActiveRun(r.status)}>
            {r.status}
          </span>
        </div>
        <div className="live-run-context">
          <span className="live-model">
            <BotArt id={r.model.head} animated state={isActiveRun(r.status) ? "focus" : "idle"} size={24} />
            <b title={r.model.name}>{r.model.name}</b>
          </span>
          {r.skills.length > 0 && <span>{r.skills.join(", ")}</span>}
          <small>
            {r.id} · {new Date(r.startedAt).toLocaleString()}
          </small>
        </div>
        <p className="grading-handoff">
          {r.source === "Devnet"
            ? "The devnet example trainer submits rollouts to Modélmon for scoring."
            : "Run training and compute rewards on your computer. Submit rollouts to Modélmon for scoring."}
        </p>
      </header>
      <dl className="monitor-metrics">
        <div>
          <dt>Graded reps</dt>
          <dd>
            {int(r.reps)}
            {r.target !== undefined && <small> / {int(r.target)}</small>}
          </dd>
        </div>
        <div>
          <dt>{legacyTrainerMetric ? "Trainer-reported mean reward" : "Latest mean score"}</dt>
          <dd>{chartMeans.at(-1)?.reward.toFixed(2) ?? "Unreported"}</dd>
        </div>
        <div>
          <dt>Grading usage</dt>
          <dd>{coins(r.accepted)}</dd>
        </div>
        <div>
          <dt>Session budget</dt>
          <dd>{coins(r.budget)}</dd>
        </div>
      </dl>
      {r.source === "Devnet" && r.channel && !isActiveRun(r.status) && <RunAttestation run={r} />}
      <ChoiceBar
        className="monitor-tabs"
        items={tabs}
        value={panel}
        onChange={setPanel}
        label="Run details"
      />
      {panel === "Grader" ? (
        <div className="grader-panel" role="region" aria-label="Scores and sealed grader">
          <ScoreHistory means={chartMeans} rollouts={r.rolloutScores} trainerMetric={legacyTrainerMetric} />
          <SandboxGrid run={r} view={channel} />
          <RunChain run={r} view={channel} verification={verification} />
          <div className="grader-panel-foot">
            <PixelButton tone="light" aria-expanded={showLog} onClick={() => setShowLog((v) => !v)}>
              <ScrollText size={16} aria-hidden="true" />
              {showLog ? "Hide grader log" : "Show grader log"}
            </PixelButton>
            <details className="grader-info">
              <summary>Sealed grader details</summary>
              <dl className="monitor-facts">
                <dt>Grader version</dt>
                <dd>{r.graderVersion ?? "Unreported"}</dd>
                <dt>Attestation</dt>
                <dd>
                  {r.attestation ?? (r.source === "Reported" ? "Unreported" : "No published attestation")}
                </dd>
                {r.evaluation && (
                  <>
                    <dt>Held-out score</dt>
                    <dd>
                      {r.evaluation.before !== undefined ? r.evaluation.before + "% to " : ""}
                      {r.evaluation.after}%
                    </dd>
                    {r.evaluation.transfer && (
                      <>
                        <dt>Transfer</dt>
                        <dd>{r.evaluation.transfer}</dd>
                        <dt>Regression</dt>
                        <dd>{r.evaluation.regression}</dd>
                      </>
                    )}
                  </>
                )}
              </dl>
            </details>
          </div>
          {showLog && (
            <section className="grader-log-drawer" aria-label="Grader log">
              <h2>Grader log</h2>
              <PixelScrollBox label="Grader log">
                <RunLog
                  events={events.filter((e) => laneFor(e.kind) === "Sealed grader").reverse()}
                  reported={hasChainReceipts}
                  onGroup={chooseGroup}
                />
              </PixelScrollBox>
            </section>
          )}
        </div>
      ) : panel === "Workers" ? (
        <RunWorkers run={r} onGroup={chooseGroup} />
      ) : (
        <PixelScrollBox
          className="run-detail-scroll"
          label={panel}
          key={panel + (panel === "Events" && playback ? "-trace" : "")}
        >
          <div className="monitor-content">
            {panel === "Budget" && <RunBudget run={r} onGroup={chooseGroup} />}
            {panel === "Events" && (
              <>
                <div className="monitor-section-head">
                  <h2>{playback ? "Group trace" : "Recent events"}</h2>
                  {playback ? (
                    <PixelButton
                      tone="light"
                      onClick={() => {
                        setTape([]);
                        setGroup("");
                      }}
                    >
                      Return to live
                    </PixelButton>
                  ) : (
                    <PixelSelect
                      label="Lane"
                      value={lane}
                      onChange={setLane}
                      items={[{ id: "", name: "All lanes" }, ...lanes.map((id) => ({ id, name: id }))]}
                    />
                  )}
                </div>
                {playback ? (
                  <>
                    <div className="trace-bar">
                      <b>{group}</b>
                      <PixelButton tone="light" onClick={() => setFrame(0)}>
                        Replay
                      </PixelButton>
                      <PixelSelect
                        label="Playback speed"
                        value={speed}
                        onChange={setSpeed}
                        items={[1, 2, 4].map((id) => ({ id, name: id + "×" }))}
                      />
                    </div>
                    <RunLog events={tape.slice(0, frame + 1)} reported={hasChainReceipts} />
                  </>
                ) : (
                  <RunLog
                    events={events.filter((e) => !lane || laneFor(e.kind) === lane).reverse()}
                    reported={hasChainReceipts}
                    onGroup={chooseGroup}
                  />
                )}
              </>
            )}
          </div>
        </PixelScrollBox>
      )}
      {r.action && (
        <div className="monitor-action">
          <PixelButton tone="gold" disabled={busy} onClick={act}>
            {r.action === "settle" ? "Close and settle" : "Run sealed evaluation"}
          </PixelButton>
          {r.source === "Devnet" && r.action === "settle" && r.channel && (
            <PixelButton tone="light" disabled={busy} onClick={tamper}>
              Try a tampered grader
            </PixelButton>
          )}
          {error && <span role="alert">{error}</span>}
        </div>
      )}
    </>
  );
}
