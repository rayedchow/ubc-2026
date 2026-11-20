"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LockKeyhole, Ticket } from "lucide-react";
import { BotArt } from "./BotArt";
import { ExplorerLink, GraderRecordFacts, SealedLine, hardwareName, type GymVerification } from "./TrustLayer";
import { api, int, useApi } from "@/lib/client";
import { VERIFIER_LABEL, usdc } from "@/lib/grader-rubric";
import { isActiveRun, type MonitorRun } from "@/lib/run-monitor";
import type { ChannelView, Sandbox } from "@/lib/server/verification";

export const MAX_SANDBOXES = 30;
/** The grader's character in every sandbox. */
export const GRADER_BOT = "sonar" as const;

/**
 * The grader's view of the run's payment channel. Re-read whenever the run's
 * rep count moves, and every 2 s while it trains (to catch rollouts in flight).
 */
export function useRunChannel(run: MonitorRun, rep?: number) {
  const [state, setState] = useState<{ key: string; data: ChannelView | null; error: string | null }>({
    key: "",
    data: null,
    error: null,
  });
  const active = isActiveRun(run.status);
  const query = new URLSearchParams({ limit: String(MAX_SANDBOXES) });
  if (rep !== undefined) query.set("rep", String(rep));
  const path = run.channel ? `/api/v1/channels/${encodeURIComponent(run.channel)}/rollouts?${query}` : null;
  useEffect(() => {
    if (!path) return;
    let live = true;
    const load = () =>
      api<ChannelView>(path)
        .then((data) => live && setState({ key: path, data, error: null }))
        .catch((e: Error) => live && setState((s) => ({ ...s, error: e.message })));
    load();
    const timer = active ? setInterval(load, 2000) : undefined;
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [path, active, run.reps]);
  // Data for a different rollout or channel is not shown while the next one loads.
  return { data: state.key === path ? state.data : null, error: state.error };
}

export function useGymVerification(gymId: string) {
  return useApi<GymVerification>(`/api/v1/gyms/${encodeURIComponent(gymId)}/verification`, 30_000);
}

export const sandboxUrl = (runId: string, rep: number) =>
  `/live/${encodeURIComponent(runId)}/grader/${rep}`;

export function botState(b: Pick<Sandbox, "status" | "reward" | "groupMean">) {
  if (b.status === "grading") return "focus";
  if (b.status === "flagged" || b.status === "error") return "alert";
  const r = b.reward ?? b.groupMean ?? 0;
  return r >= 0.5 ? "happy" : "idle";
}

/** Reward band for the box colour: the rollout's own reward, or its group mean. */
const band = (b: Sandbox) => {
  if (b.status !== "scored") return undefined;
  const r = b.reward ?? b.groupMean ?? 0;
  return r >= 0.99 ? "full" : r >= 0.5 ? "part" : "none";
};

export function SandboxValue({ box }: { box: Sandbox }) {
  if (box.status === "grading") return <span className="sandbox-value">grading…</span>;
  if (box.status === "flagged") return <span className="sandbox-value" data-tone="bad">flagged</span>;
  if (box.status === "error") return <span className="sandbox-value" data-tone="bad">error</span>;
  if (box.reward !== undefined) return <span className="sandbox-value">{box.reward.toFixed(2)}</span>;
  return (
    <span
      className="sandbox-value"
      data-mean
      title="Group mean: this rollout's own reward is no longer in the grader's recent feed"
    >
      <abbr>avg</abbr>
      {box.groupMean?.toFixed(2)}
    </span>
  );
}

/** One box per recent rollout, each in its own sandbox inside the sealed grader. */
export function SandboxGrid({ run, view }: { run: MonitorRun; view: ChannelView | null }) {
  if (!run.channel)
    return (
      <section className="sandbox-section">
        <p className="quiet">
          Sandboxes appear for devnet runs, where every rollout is graded by the sealed grader. This run is simulated.
        </p>
      </section>
    );
  if (!view)
    return (
      <section className="sandbox-section">
        <p className="quiet">Reading the grader’s tab…</p>
      </section>
    );
  // One slot goes to the "+ N" box when there are more rollouts than fit.
  const boxes = view.recent.length >= MAX_SANDBOXES && run.reps > MAX_SANDBOXES ? view.recent.slice(0, MAX_SANDBOXES - 1) : view.recent;
  const done = boxes.filter((b) => b.status !== "grading").length;
  const rest = Math.max(0, run.reps - done);
  const flagged = boxes.filter((b) => b.status === "flagged").length;
  return (
    <section className="sandbox-section" aria-labelledby="sandbox-title">
      <div className="sandbox-head">
        <h2 id="sandbox-title">Grader sandboxes</h2>
        <span className="sandbox-legend">
          <i data-state="grading" /> grading <i data-state="scored" /> scored <i data-state="flagged" /> flagged
        </span>
        <small>
          Latest {done} of {int(run.reps)} rollouts{view.inFlight ? ` · ${view.inFlight} in the grader now` : ""}
          {flagged ? ` · ${flagged} flagged` : ""}
        </small>
      </div>
      <ol className="sandbox-grid">
        {boxes.map((b) => (
          <li key={b.rep}>
            <Link
              href={sandboxUrl(run.id, b.rep)}
              className="sandbox-box"
              data-state={b.status}
              data-band={band(b)}
              title={`Rollout #${b.rep} · group ${b.group}${b.id ? " · " + b.id : ""}`}
            >
              <span className="sandbox-seal" aria-hidden="true">
                <LockKeyhole size={9} />
              </span>
              <BotArt id={GRADER_BOT} size={34} state={botState(b)} animated={b.status === "grading"} />
              <SandboxValue box={b} />
              <small>#{b.rep}</small>
            </Link>
          </li>
        ))}
        {rest > 0 && (
          <li>
            <span className="sandbox-box sandbox-more">
              <strong>+ {int(rest)}</strong>
              <small>earlier rollouts</small>
            </span>
          </li>
        )}
      </ol>
      <SealedLine compact />
    </section>
  );
}

/** x402 + channel + grader record + settlement, for one run. */
export function RunChain({
  run,
  view,
  verification,
}: {
  run: MonitorRun;
  view: ChannelView | null;
  verification: GymVerification | null;
}) {
  if (!run.channel || !view) return null;
  const gym = verification?.gym;
  const grader = verification?.grader;
  const used = view.deposit ? Math.min(100, (view.cumulative / view.deposit) * 100) : 0;
  const pct = (bps: number) => bps / 100 + "%";
  return (
    <section className="run-chain" aria-label="Solana for this run">
      <article>
        <h3>
          <Ticket size={16} aria-hidden="true" /> x402 · paid per rep
        </h3>
        <ol className="x402-steps">
          <li>
            <b>402</b> Payment required: {gym ? gym.pricePerRep.toLocaleString("en-US", { maximumFractionDigits: 6 }) : "…"}{" "}
            USDC per rollout
          </li>
          <li>
            <b>Deposit</b> {usdc(view.deposit)} into a channel{" "}
            {view.openTx && <ExplorerLink tx={view.openTx}>open tx</ExplorerLink>}
          </li>
          <li>
            <b>Voucher</b> per group: trainer-signed running total, no chain wait
          </li>
        </ol>
        <div className="voucher-total">
          <span>Running voucher total</span>
          <strong>{usdc(view.cumulative)}</strong>
          <small>
            of {usdc(view.deposit)} · {int(view.groups)} vouchers
          </small>
        </div>
        <div className="budget-meter" aria-hidden="true">
          <i style={{ width: used + "%" }} />
        </div>
        <p className="chain-links">
          Channel <ExplorerLink address={view.channel} />
          {view.open ? " · open" : view.settled ? " · closed" : ""}
        </p>
      </article>
      <article>
        <h3>
          <LockKeyhole size={16} aria-hidden="true" /> Verified grader
        </h3>
        {grader ? (
          <>
            <p className="chain-verdict" data-tone={grader.hardware === "none" ? "warn" : "ok"}>
              Hardware: {hardwareName(grader.hardware)}
            </p>
            <p className="chain-small">{VERIFIER_LABEL}</p>
            <GraderRecordFacts grader={grader} config={verification?.config} />
          </>
        ) : (
          <p className="quiet">Reading the record…</p>
        )}
      </article>
      <article>
        <h3>
          <Image src="/providers/solana.svg" alt="" width={17} height={15} unoptimized /> Settlement split
        </h3>
        {view.settled ? (
          <>
            <dl className="budget-entries">
              <div>
                <dt>Gym Leader</dt>
                <dd>{usdc(view.settled.leader)}</dd>
              </div>
              <div>
                <dt>Contributors</dt>
                <dd>{usdc(view.settled.contributors)}</dd>
              </div>
              <div>
                <dt>Treasury</dt>
                <dd>{usdc(view.settled.platform)}</dd>
              </div>
              <div>
                <dt>Refund to trainer</dt>
                <dd>{usdc(view.settled.refund)}</dd>
              </div>
            </dl>
            <p className="chain-links">
              One transaction: <ExplorerLink tx={view.settled.tx}>settle</ExplorerLink>
            </p>
          </>
        ) : gym ? (
          <>
            <p className="chain-small">On close, the grader submits the latest voucher; the program pays out in one transaction:</p>
            <dl className="budget-entries">
              <div>
                <dt>Gym Leader · {pct(gym.split.leaderBps)}</dt>
                <dd>{usdc((view.cumulative * gym.split.leaderBps) / 10000)}</dd>
              </div>
              <div>
                <dt>Contributors · {pct(gym.split.contributorBps)}</dt>
                <dd>{usdc((view.cumulative * gym.split.contributorBps) / 10000)}</dd>
              </div>
              <div>
                <dt>Treasury · {pct(gym.split.platformBps)}</dt>
                <dd>{usdc((view.cumulative * gym.split.platformBps) / 10000)}</dd>
              </div>
              <div>
                <dt>Refund</dt>
                <dd>{usdc(view.deposit - view.cumulative)}</dd>
              </div>
            </dl>
            <p className="chain-small">If settled at the current total. Not yet onchain.</p>
          </>
        ) : null}
        {view.refused.length > 0 && (
          <p className="chain-refused">
            Refused onchain:{" "}
            {view.refused.slice(0, 3).map((r, i) => (
              <span key={r.signature}>
                {i ? ", " : ""}
                <ExplorerLink tx={r.signature} />
              </span>
            ))}
          </p>
        )}
        {verification && (
          <p className="chain-links">
            <ExplorerLink address={verification.programId}>Program</ExplorerLink> ·{" "}
            <ExplorerLink address={verification.gym.address}>Gym account</ExplorerLink>
          </p>
        )}
      </article>
    </section>
  );
}
