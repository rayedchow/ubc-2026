import { useState } from "react";
import { Activity, Cpu } from "lucide-react";
import { PixelButton } from "./ui/game-controls";
import { PixelSelect } from "./ui/pixel-select";
import { RunLog } from "./RunLog";
import { RunSplitView } from "./RunSplitView";
import { int } from "@/lib/client";
import { laneFor, type MonitorRun } from "@/lib/run-monitor";

export function RunWorkers({ run, onGroup }: { run: MonitorRun; onGroup: (group: string) => void }) {
  const [selection, setSelection] = useState<{ trainer: string; worker: string } | null>(null);
  const owner = run.model.trainer;
  const activity = run.events.filter((event) => laneFor(event.kind) === "Trainer GPUs");
  const trainers = new Set<string>([owner]);
  const operators = new Map<string, Set<string>>();
  function assign(trainer: string, worker?: string) {
    trainers.add(trainer);
    if (!worker) return;
    const names = operators.get(worker) ?? new Set<string>();
    names.add(trainer);
    operators.set(worker, names);
  }
  for (const worker of run.workers) assign(worker.trainer ?? owner, worker.id);
  for (const event of activity) if (event.trainer) assign(event.trainer, event.worker);

  const trainer = selection && trainers.has(selection.trainer) ? selection.trainer : owner;
  const entries = activity.filter((event) => {
    if (event.trainer) return event.trainer === trainer;
    const names = event.worker && operators.get(event.worker);
    if (names) return names.size === 1 && names.has(trainer);
    // Unattributed activity from a multi-trainer run remains in the full Events log.
    return trainers.size === 1;
  });
  const workers = run.workers.filter((worker) => (worker.trainer ?? owner) === trainer);
  const ids = new Set(workers.map((worker) => worker.id));
  for (const event of entries) if (event.worker) ids.add(event.worker);
  const workerId = selection?.trainer === trainer && ids.has(selection.worker) ? selection.worker : "";
  const worker = workers.find((item) => item.id === workerId);
  const log = entries.filter((event) => !workerId || event.worker === workerId).reverse();
  const counts = new Map<string, number>();
  for (const item of workers) counts.set(item.state, (counts.get(item.state) ?? 0) + 1);
  const summary = Array.from(counts, ([state, count]) => count + " " + state.toLowerCase()).join(" · ");
  const status = workerId ? (worker?.state ?? "No status reported") : summary || "Awaiting heartbeat";
  const checkpoint = workerId ? worker?.checkpoint : run.checkpoint;

  return (
    <RunSplitView
      label="Workers"
      detailLabel="Trainer activity"
      logTitle={workerId ? workerId + " log" : trainer + " log"}
      logKey={JSON.stringify([trainer, workerId])}
      log={<RunLog events={log} reported={false} onGroup={onGroup} showWorker={!workerId} />}
    >
      <div className="trainer-activity">
        <h2>Trainers</h2>
        <div className="trainer-list" role="group" aria-label="Trainers in this run">
          {Array.from(trainers, (name) => (
            <PixelButton
              key={name}
              tone={name === trainer ? "gold" : "light"}
              aria-pressed={name === trainer}
              onClick={() => setSelection({ trainer: name, worker: "" })}
            >
              <Cpu size={15} aria-hidden="true" />
              {name}
            </PixelButton>
          ))}
        </div>
        {!!ids.size && (
          <PixelSelect
            label="Worker"
            value={workerId}
            items={[{ id: "", name: "All workers" }, ...Array.from(ids, (id) => ({ id, name: id }))]}
            onChange={(id) => setSelection({ trainer, worker: id })}
          />
        )}
        <dl className="monitor-facts trainer-facts">
          <dt>Model ID</dt>
          <dd>{run.model.id}</dd>
          <dt>Activity</dt>
          <dd>
            <Activity size={14} aria-hidden="true" />
            {status}
          </dd>
          {worker?.reps !== undefined && (
            <>
              <dt>Graded reps</dt>
              <dd>{int(worker.reps)}</dd>
            </>
          )}
          {worker?.heartbeatAt !== undefined && (
            <>
              <dt>Last heartbeat</dt>
              <dd>
                <time dateTime={new Date(worker.heartbeatAt).toISOString()}>
                  {new Date(worker.heartbeatAt).toLocaleTimeString()}
                </time>
              </dd>
            </>
          )}
          {worker?.task && (
            <>
              <dt>Current task</dt>
              <dd>{worker.task}</dd>
            </>
          )}
          {worker?.latencyMs !== undefined && (
            <>
              <dt>Latency</dt>
              <dd>{int(worker.latencyMs)} ms</dd>
            </>
          )}
          {checkpoint && (
            <>
              <dt>{workerId ? "Worker checkpoint" : "Run checkpoint"}</dt>
              <dd>{checkpoint}</dd>
            </>
          )}
          {!workerId && run.step !== undefined && (
            <>
              <dt>Run optimizer step</dt>
              <dd>{int(run.step)}</dd>
            </>
          )}
        </dl>
      </div>
    </RunSplitView>
  );
}
