"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useCurrentTrainer } from "./current-trainer";
import { PixelSheet } from "./ui/pixel-sheet";
import { PixelButton } from "./ui/game-controls";
import { PixelSelect } from "./ui/pixel-select";
import { PixelInput, PixelForm } from "./ui/pixel-form";
import { PixelArrow } from "./ui/pixel-arrow";
import { BotArt } from "./BotArt";
import { api, int } from "@/lib/client";
import { coins, isActiveRun, type MonitorSnapshot, type RunRow } from "@/lib/run-monitor";
import { LiveRun } from "./RunDetail";
import { GraderSandbox } from "./GraderSandbox";
import { TrustOverview } from "./TrustLayer";
import "./run-monitor.css";

const runUrl = (id: string) => "/live/" + encodeURIComponent(id);

function Gate({ snapshot, refresh }: { snapshot: MonitorSnapshot; refresh: () => void }) {
  const [key, setKey] = useState(""),
    [error, setError] = useState("");
  if (!snapshot.canConnect) return null;
  if (snapshot.connected)
    return (
      <PixelButton
        tone="light"
        onClick={async () => {
          await api("/api/monitor/connect", { method: "DELETE" });
          refresh();
        }}
      >
        Disconnect {snapshot.trainer}
      </PixelButton>
    );
  return (
    <details className="monitor-connect">
      <summary>Connect a trainer</summary>
      <PixelForm
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("/api/monitor/connect", {
              method: "POST",
              headers: { Authorization: "Bearer " + key },
            });
            setKey("");
            setError("");
            refresh();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <label>
          Viewer key
          <PixelInput value={key} type="password" required onChange={(e) => setKey(e.target.value)} />
        </label>
        <PixelButton type="submit" tone="light">
          Connect
        </PixelButton>
        {error && <p role="alert">{error}</p>}
      </PixelForm>
    </details>
  );
}

function RunRows({ rows }: { rows: RunRow[] }) {
  return (
    <ul className="monitor-rows" aria-label="Training runs">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={runUrl(r.id)}>
            <BotArt id={r.model.head} size={40} />
            <span>
              <strong>{r.model.name}</strong>
              <small>
                {r.gym} · {r.skills.join(", ")}
              </small>
            </span>
            <span className="row-volume">
              {int(r.reps)} reps
              <small>
                {r.workerCount} workers · {coins(r.accepted)}
              </small>
            </span>
            <span className="monitor-state" data-active={isActiveRun(r.status)}>
              {r.status}
            </span>
            <PixelArrow />
          </Link>
        </li>
      ))}
    </ul>
  );
}
function Overview({ s }: { s: MonitorSnapshot }) {
  const [model, setModel] = useState(""),
    [status, setStatus] = useState(""),
    [gym, setGym] = useState("");
  const rows = s.runs.filter(
    (r) => (!model || model === r.model.id) && (!status || status === r.status) && (!gym || gym === r.gym),
  );
  const active = s.runs.filter((r) => isActiveRun(r.status));
  const choices = (values: string[]) => [...new Set(values)].sort().map((id) => ({ id, name: id }));
  return (
    <>
      <div className="monitor-hero">
        <div>
          <h1>Runs</h1>
          <p>{s.trainer}’s training overview</p>
        </div>
        <Link className="pixel-button pixel-light" href="/live">
          Live view <PixelArrow />
        </Link>
      </div>
      <div className="model-party">
        {s.models.map((m) => {
          const running = active.filter((r) => r.model.id === m.id);
          return (
            <PixelButton
              tone="light"
              key={m.id}
              aria-pressed={model === m.id}
              onClick={() => setModel(model === m.id ? "" : m.id)}
            >
              <BotArt id={m.head} size={50} animated state={running.length ? "focus" : "idle"} />
              <span>
                {m.name}
                <small>{running.length ? running.length + " active" : "Idle"}</small>
              </span>
            </PixelButton>
          );
        })}
      </div>
      <dl className="monitor-metrics">
        <div>
          <dt>Active runs</dt>
          <dd>{active.length}</dd>
        </div>
        <div>
          <dt>Active trainer workers</dt>
          <dd>{active.reduce((n, r) => n + r.activeWorkers, 0)}</dd>
        </div>
        <div>
          <dt>Committed budget</dt>
          <dd>
            {active.some((r) => r.budget === undefined)
              ? "Unreported"
              : coins(active.reduce((n, r) => n + (r.budget ?? 0), 0))}
          </dd>
        </div>
        <div>
          <dt>Graded reps</dt>
          <dd>{int(s.runs.reduce((n, r) => n + r.reps, 0))}</dd>
        </div>
      </dl>
      <TrustOverview />
      <div className="monitor-filters">
        <PixelSelect
          label="Gym"
          value={gym}
          items={[{ id: "", name: "All gyms" }, ...choices(s.runs.map((r) => r.gym))]}
          onChange={setGym}
        />
        <PixelSelect
          label="Status"
          value={status}
          items={[{ id: "", name: "All statuses" }, ...choices(s.runs.map((r) => r.status))]}
          onChange={setStatus}
        />
      </div>
      {rows.length ? (
        <RunRows rows={rows} />
      ) : (
        <div className="monitor-empty">
          <h2>{s.runs.length ? "No matching runs" : "No runs yet"}</h2>
          {s.runs.length ? (
            <PixelButton
              tone="light"
              onClick={() => {
                setModel("");
                setGym("");
                setStatus("");
              }}
            >
              Clear filters
            </PixelButton>
          ) : (
            <Link href="/gyms" className="pixel-button pixel-gold">
              Choose a gym <PixelArrow />
            </Link>
          )}
        </div>
      )}
    </>
  );
}

export function RunMonitor({ selection, sandbox }: { selection?: string; sandbox?: number }) {
  const [trainer] = useCurrentTrainer();
  const [generation, setGeneration] = useState(0);
  return (
    <Feed
      key={[trainer, selection, generation].join("/")}
      trainer={trainer}
      selection={selection}
      sandbox={sandbox}
      refresh={() => setGeneration((n) => n + 1)}
    />
  );
}
function Feed({
  trainer,
  selection,
  sandbox,
  refresh,
}: {
  trainer: string;
  selection?: string;
  sandbox?: number;
  refresh: () => void;
}) {
  const [s, setSnapshot] = useState<MonitorSnapshot | null>(null),
    [offline, setOffline] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const query = new URLSearchParams({ trainer, stream: "1", sampleStart: String(Date.now() - 12_000) });
    if (selection) query.set("run", selection);
    const stream = new EventSource("/api/monitor?" + query);
    stream.onmessage = (e) => {
      setSnapshot(JSON.parse(e.data));
      setOffline(false);
    };
    stream.onerror = () => setOffline(true);
    return () => stream.close();
  }, [trainer, selection]);
  // With no active run there is nothing to watch live, so send the viewer to the run list.
  useEffect(() => {
    if (selection === "current" && s && !s.detail) router.replace("/runs");
  }, [selection, s, router]);
  const runs = s?.runs ?? [];
  return (
    <PixelSheet className={selection ? "monitor-sheet live-monitor" : "monitor-sheet"}>
      <div className="monitor-strip">
        <span className="connection-dot" data-offline={offline || !s} />
        <span>{offline ? "Reconnecting" : s ? "Live updates" : "Connecting"}</span>
        <span className="strip-end">{sandbox !== undefined ? "Sealed grader" : selection ? "Live run" : "Run overview"}</span>
      </div>
      {s && <Gate snapshot={s} refresh={refresh} />}
      {!s ? (
        <div className="monitor-empty" role="status">
          {offline ? "Waiting for the run service…" : "Loading runs…"}
        </div>
      ) : !selection ? (
        <Overview s={s} />
      ) : (
        <>
          <div className="monitor-toolbar">
            <Link href="/runs">
              <PixelArrow direction="left" /> All runs
            </Link>
            <PixelSelect
              label="Run"
              value={selection}
              items={[
                { id: "current", name: "Current active run" },
                ...runs.map((r) => ({ id: r.id, name: r.model.name + " · " + r.gym + " · " + r.id })),
              ]}
              onChange={(id) => router.push(id === "current" ? "/live" : runUrl(id))}
            />
          </div>
          {s.detail && sandbox !== undefined ? (
            <GraderSandbox key={s.detail.id + "/" + sandbox} run={s.detail} rep={sandbox} />
          ) : s.detail ? (
            <LiveRun key={s.detail.id} run={s.detail} />
          ) : (
            <div className="monitor-empty">
              <div className="idle-party">
                {s.models.map((m) => (
                  <div key={m.id}>
                    <BotArt id={m.head} label={m.name} size={62} animated />
                    <small>{m.name}</small>
                  </div>
                ))}
              </div>
              <h1>Run unavailable</h1>
              <p>Check the run ID or connect the trainer who owns it.</p>
              <Link href="/gyms" className="pixel-button pixel-gold">
                Choose a gym <PixelArrow />
              </Link>
            </div>
          )}
        </>
      )}
    </PixelSheet>
  );
}
