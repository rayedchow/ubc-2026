import { useState, type PointerEvent } from "react";
import type { RewardPoint } from "@/lib/run-monitor";
import { int } from "@/lib/client";

const score = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });
const width = 1000,
  height = 120;

function ordered(series: RewardPoint[]) {
  // A newer observation for the same rep supersedes its previous value.
  return [...new Map(series.map((point) => [point.reps, point])).values()].sort((a, b) => a.reps - b.reps);
}

export function ScoreHistory({
  means,
  rollouts,
  trainerMetric,
}: {
  means: RewardPoint[];
  rollouts?: RewardPoint[];
  trainerMetric: boolean;
}) {
  const title = trainerMetric ? "Trainer-reported reward" : "Grading scores";
  const [inspected, setInspected] = useState<number | null>(null);
  const granular = !!rollouts?.length;
  const points = ordered(granular ? rollouts : means);
  if (!points.length)
    return (
      <div className="reward-empty">
        <h2>{title}</h2>
        <p>Awaiting scores from the grader.</p>
      </div>
    );

  const first = points[0],
    last = points[points.length - 1];
  const overlap = granular ? ordered(means).filter((p) => p.reps >= first.reps && p.reps <= last.reps) : [];
  const span = last.reps - first.reps;
  const inset = 8;
  const x = (rep: number) => (span ? inset + ((rep - first.reps) / span) * (width - 2 * inset) : width / 2);
  const values = [...points, ...overlap].map((p) => p.reward);
  const low = Math.min(0, ...values),
    high = Math.max(1, ...values);
  const y = (value: number) => 2 + ((high - value) / (high - low)) * (height - 4);
  function linePath(series: RewardPoint[], breakAtMissingRollouts = false) {
    return series
      .map((p, i) => {
        const coords = `${x(p.reps)},${y(p.reward)}`;
        if (i === 0 || (breakAtMissingRollouts && p.reps !== series[i - 1].reps + 1)) {
          // A round cap keeps even an isolated score visible when the line has a gap.
          return `M${coords}l0,0`;
        }
        return `L${coords}`;
      })
      .join(" ");
  }
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => high - (high - low) * t);
  const selected = points.find((p) => p.reps === inspected) ?? last;

  function nearest(rep: number) {
    return points.reduce((best, p) => (Math.abs(p.reps - rep) < Math.abs(best.reps - rep) ? p : best));
  }
  function inspect(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const plotX = ((e.clientX - rect.left) / rect.width) * width;
    setInspected(nearest(first.reps + ((plotX - inset) / (width - 2 * inset)) * span).reps);
  }
  const labels = [
    ...new Set([0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(first.reps + (last.reps - first.reps) * t))),
  ];

  return (
    <figure className="reward-chart">
      <figcaption>
        <h2>{title}</h2>
        <span className="reward-legend">
          <i className={granular ? "reward-key-line" : "reward-key-mean"} />
          {granular ? "Rollout score" : "Reported mean"}
          {!!overlap.length && (
            <>
              <i className="reward-key-mean" />
              Batch mean
            </>
          )}
        </span>
      </figcaption>
      <div className="reward-chart-body">
        <div
          className="reward-y"
          aria-hidden="true"
          style={{ minWidth: Math.max(...ticks.map((t) => score.format(t).length)) + "ch" }}
        >
          {ticks.map((t) => (
            <span key={t} style={{ top: (y(t) / height) * 100 + "%" }}>
              {score.format(t)}
            </span>
          ))}
        </div>
        <div
          className="reward-plot"
          role="slider"
          tabIndex={0}
          aria-label={`Inspect ${title.toLowerCase()} by graded rep`}
          aria-valuemin={1}
          aria-valuemax={points.length}
          aria-valuenow={points.indexOf(selected) + 1}
          aria-valuetext={`Rep ${int(selected.reps)}, ${granular ? "score" : trainerMetric ? "mean reward" : "mean score"} ${score.format(selected.reward)}`}
          onBlur={() => setInspected(null)}
          onPointerMove={inspect}
          onPointerDown={inspect}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setInspected(null);
          }}
          onKeyDown={(e) => {
            const index = points.indexOf(selected);
            const indices: Record<string, number> = {
              Home: 0,
              End: points.length - 1,
              ArrowRight: index + 1,
              ArrowUp: index + 1,
              ArrowLeft: index - 1,
              ArrowDown: index - 1,
            };
            if (!(e.key in indices)) return;
            e.preventDefault();
            setInspected(points[Math.min(points.length - 1, Math.max(0, indices[e.key]))].reps);
          }}
        >
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
            {ticks.map((t) => (
              <line className="reward-gridline" key={t} x1={0} x2={width} y1={y(t)} y2={y(t)} />
            ))}
            <line className="reward-baseline" x1={0} x2={width} y1={y(0)} y2={y(0)} />
            <line className="reward-cursor" x1={x(selected.reps)} x2={x(selected.reps)} y1={0} y2={height} />
            <path className={granular ? "reward-line" : "reward-mean"} d={linePath(points, granular)} />
            {!!overlap.length && <path className="reward-mean" d={linePath(overlap)} />}
          </svg>
          <span
            className="reward-marker"
            aria-hidden="true"
            style={{
              left: (x(selected.reps) / width) * 100 + "%",
              top: (y(selected.reward) / height) * 100 + "%",
            }}
          />
        </div>
        <div className="reward-x" aria-hidden="true">
          {labels.map((rep) => (
            <span
              key={rep}
              style={{ left: (x(rep) / width) * 100 + "%" }}
              data-edge={
                rep === first.reps && rep !== last.reps
                  ? "start"
                  : rep === last.reps && rep !== first.reps
                    ? "end"
                    : undefined
              }
            >
              {int(rep)}
            </span>
          ))}
        </div>
      </div>
      <div className="reward-chart-footer">
        <span>Graded reps</span>
        <span>
          Rep {int(selected.reps)} · <b>{score.format(selected.reward)}</b>
        </span>
      </div>
    </figure>
  );
}
