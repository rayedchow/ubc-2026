"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { BadgeCheck, CircleCheck, CircleDashed, CircleX, KeyRound, LockKeyhole, ScrollText } from "lucide-react";
import { BotArt } from "./BotArt";
import { PixelArrow } from "./ui/pixel-arrow";
import { ExplorerLink, SealedLine, hardwareName, type Overview } from "./TrustLayer";
import { GRADER_BOT, SandboxValue, botState, useGymVerification, useRunChannel } from "./RunSealed";
import { int, useApi } from "@/lib/client";
import { VERIFIER_LABEL, rubricFor, shortKey, usdc } from "@/lib/grader-rubric";
import { isActiveRun, type MonitorRun } from "@/lib/run-monitor";
import type { GraderView } from "@/lib/server/verification";

const STEP_MS = 1500;
const clock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour12: false });

/** Cycles through the grading steps as an illustration. Static under reduced motion. */
function useReplay(steps: number) {
  const [step, setStep] = useState(0);
  const [still, setStill] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) {
      const t = setTimeout(() => setStill(true), 0);
      return () => clearTimeout(t);
    }
    const t = setInterval(() => setStep((n) => (n + 1) % (steps + 2)), STEP_MS);
    return () => clearInterval(t);
  }, [steps]);
  return still ? steps + 1 : step;
}

function Check({ ok, label }: { ok: boolean | null; label: string }) {
  return (
    <li data-ok={ok}>
      {ok === null ? <CircleDashed size={14} /> : ok ? <CircleCheck size={14} /> : <CircleX size={14} />}
      {label}
    </li>
  );
}

function VerificationChain({ grader, programId }: { grader: GraderView; programId: string }) {
  const tdx = grader.hardware === "tdx" || grader.hardware === "sev-snp";
  const passes = grader.exists && grader.live && grader.approved;
  return (
    <ol className="verify-chain">
      <li data-tone={tdx ? "ok" : "warn"}>
        <span className="verify-step">1</span>
        <h4>Hardware report</h4>
        {tdx ? (
          <p>
            {hardwareName(grader.hardware)} quote binding the grader’s keys to Solana slot{" "}
            {grader.reportSlot?.toLocaleString("en-US")}.
          </p>
        ) : (
          <p>None. This grader runs locally with no TEE (hardware = none).</p>
        )}
      </li>
      <li data-tone={tdx ? "ok" : "warn"}>
        <span className="verify-step">2</span>
        <h4>Verification</h4>
        <p className="chain-small">{VERIFIER_LABEL}</p>
        {grader.offchainCheck ? (
          <p>
            Quote verified via {grader.offchainCheck.by}:{" "}
            <a href={grader.offchainCheck.url} target="_blank" rel="noreferrer">
              checksum {grader.offchainCheck.checksum.slice(0, 12)}…
            </a>
          </p>
        ) : tdx ? (
          <p>Quote checked off-chain by the attestation authority.</p>
        ) : (
          <p>Nothing to verify. Accepted only because the devnet config allows unattested graders.</p>
        )}
        <p className="chain-small">SCC’s program ID isn’t public yet; once it is, SCC writes this record.</p>
      </li>
      <li data-tone={grader.exists ? "ok" : "bad"}>
        <span className="verify-step">3</span>
        <h4>Onchain grader record</h4>
        <dl className="trust-facts">
          <dt>Record</dt>
          <dd>
            <ExplorerLink address={grader.record} />
          </dd>
          <dt>Key</dt>
          <dd>
            <ExplorerLink address={grader.key} />
          </dd>
          <dt>Code hash</dt>
          <dd>
            <code title={grader.codeHash}>{grader.codeHash?.slice(0, 12)}…</code>
          </dd>
          <dt>Hardware</dt>
          <dd>{hardwareName(grader.hardware)}</dd>
          <dt>Expiry</dt>
          <dd>{grader.expiresAt ? new Date(grader.expiresAt * 1000).toLocaleString() : "—"}</dd>
        </dl>
      </li>
      <li data-tone={passes ? "ok" : "bad"}>
        <span className="verify-step">4</span>
        <h4>Solana checks it</h4>
        <p>
          <code>settle</code> and <code>record_result</code> in <ExplorerLink address={programId}>the program</ExplorerLink>{" "}
          read this record before paying or recording a score:
        </p>
        <ul className="check-list">
          <Check ok={grader.exists} label="Signer has a grader record" />
          <Check ok={grader.exists ? grader.live : null} label="Record not expired" />
          <Check ok={grader.exists ? grader.approved : null} label="Code hash on the approved list" />
        </ul>
        <p className="chain-verdict" data-tone={passes ? "ok" : "bad"}>
          {passes ? "Passes right now" : "Would fail: GraderNotVerified"}
        </p>
      </li>
    </ol>
  );
}

export function GraderSandbox({ run, rep }: { run: MonitorRun; rep: number }) {
  const { data: view, error } = useRunChannel(run, rep);
  const { data: verification } = useGymVerification(run.gymId);
  const { data: overview } = useApi<Overview>("/api/v1/verification");
  const rubric = rubricFor(run.gymId);
  const focus = view?.focus ?? null;
  const box = focus?.sandbox;
  const grader = verification?.grader;
  const gym = verification?.gym;
  const step = useReplay(6);
  const runHref = "/live/" + encodeURIComponent(run.id);
  const others = overview?.graders.filter((g) => g.key !== grader?.key) ?? [];

  if (!run.channel)
    return (
      <div className="monitor-empty">
        <h1>No sealed grader for this run</h1>
        <p>This run is simulated. Sandboxes exist for devnet runs only.</p>
        <Link href={runHref} className="pixel-button pixel-light">
          <PixelArrow direction="left" /> Back to run
        </Link>
      </div>
    );

  const reward = box?.reward;
  const explained = reward !== undefined && rubric?.explain ? rubric.explain(reward) : null;
  const steps: { title: string; body: ReactNode }[] = [
    {
      title: "Voucher checked",
      body: focus ? (
        <>
          Trainer-signed running total <b>{usdc(focus.voucher.after)}</b> (+{usdc(focus.voucher.charged)} for this
          group of {focus.group.size}) is within the {usdc(view!.deposit)} deposit. Ed25519 signature by trainer{" "}
          <ExplorerLink address={view!.trainer} />. No chain call.
        </>
      ) : (
        "…"
      ),
    },
    {
      title: "Licence checked",
      body: gym ? (
        gym.exclusiveUntil ? (
          <>Exclusive window until {new Date(gym.exclusiveUntil * 1000).toLocaleDateString()}: only its holder is served.</>
        ) : (
          <>Channel opened for this Gym; no exclusive window on the Gym account, so any paying trainer is served.</>
        )
      ) : (
        "…"
      ),
    },
    {
      title: "Decrypt in memory",
      body: gym ? (
        <>
          The sealed bundle (grader version <code>sha256:{gym.graderVersion.slice(0, 10)}…</code>) is opened inside the
          grader only. Answers are never written out or returned.
        </>
      ) : (
        "…"
      ),
    },
    {
      title: "Run checker",
      body: (
        <>
          {rubric?.checker ?? "The Gym’s sealed checker runs on the rollout"}
          {focus?.taskId && (
            <>
              {" "}
              · task <code>{focus.taskId}</code>
            </>
          )}
          {focus?.group.latencyMs !== undefined && <> · group graded in {int(focus.group.latencyMs)} ms</>}
        </>
      ),
    },
    {
      title: "Reward components",
      body:
        box?.status === "flagged" ? (
          <>
            Flagged{focus?.flagReason ? `: ${focus.flagReason}` : ""}. Reward withheld (0).
          </>
        ) : explained ? (
          <ul className="check-list">
            {explained.map((p) => (
              <Check
                key={p.part}
                ok={p.earned}
                label={`${p.part} (${rubric!.parts.find((x) => x.name === p.part)?.weight})${p.earned === null ? ": not scored after a wrong decision" : ""}`}
              />
            ))}
          </ul>
        ) : reward !== undefined ? (
          <>
            Total {reward.toFixed(4)} from {rubric?.parts.map((p) => `${p.name} ${p.weight}`).join(" + ")}. Per-part
            scores go back to the trainer; the tab keeps the total.
          </>
        ) : (
          <>
            This rollout’s own reward has left the grader’s recent feed; its group mean was{" "}
            {focus?.group.mean.toFixed(3)}. Rubric: {rubric?.parts.map((p) => `${p.name} ${p.weight}`).join(" + ")}.
          </>
        ),
    },
    {
      title: "Sign",
      body: grader ? (
        <>
          Scores and a digest of the inputs are signed with grader key <ExplorerLink address={grader.key} /> (Ed25519)
          and returned to the trainer. Solana trusts that key only through its record.
        </>
      ) : (
        "…"
      ),
    },
  ];

  return (
    <div className="sandbox-page">
      <header className="sandbox-page-head">
        <Link href={runHref} className="sandbox-back">
          <PixelArrow direction="left" /> Back to run
        </Link>
        <div className="sandbox-title">
          <span className="sandbox-portrait">
            <BotArt id={GRADER_BOT} size={64} animated state={box ? botState(box) : "focus"} />
          </span>
          <div>
            <small>
              {run.gym} · {run.model.name}
              {isActiveRun(run.status) ? " · training" : ""}
            </small>
            <h1>Sandbox #{rep}</h1>
            <p>
              {focus
                ? `Rollout ${box?.id ?? ""} in group ${focus.group.index} (${focus.group.size} rollouts, reps ${focus.group.firstRep}–${focus.group.lastRep}) · graded ${clock(focus.group.at)}`
                : error
                  ? error
                  : view
                    ? "This rollout is not in the grader’s tab yet."
                    : "Reading the grader’s tab…"}
            </p>
          </div>
          {box && (
            <span className="sandbox-result" data-state={box.status}>
              <SandboxValue box={box} />
              <small>
                {box.status === "flagged"
                  ? "reward withheld"
                  : box.reward !== undefined
                    ? "reward"
                    : box.status === "scored"
                      ? "group mean"
                      : ""}
              </small>
            </span>
          )}
        </div>
        <SealedLine />
      </header>

      <section className="tee-stage" aria-label="Inside the sealed grader">
        <div className="tee-port tee-in">
          <h3>Rollout in</h3>
          <div className="tee-packet" data-step={step}>
            <span>#{rep}</span>
            <small>model output + voucher</small>
          </div>
          <p className="chain-small">From the trainer’s GPUs, over x402</p>
        </div>
        <div className="tee-chip" data-active={step > 0 && step <= 6}>
          <i className="tee-pins" aria-hidden="true" />
          <header>
            <LockKeyhole size={15} aria-hidden="true" />
            <strong>Sealed grader</strong>
            <span data-tone={grader?.hardware === "none" ? "warn" : "ok"}>
              {grader ? (grader.hardware === "none" ? "devnet · no TEE yet" : hardwareName(grader.hardware)) : "…"}
            </span>
          </header>
          <div className="tee-memory" aria-label="Sealed memory: hidden from everyone, including the operator">
            {(rubric?.sealed ?? ["Answer key", "Hidden tests", "Grading checks"]).map((label) => (
              <div className="tee-block" key={label}>
                <span className="tee-redacted" aria-hidden="true" />
                <small>
                  <LockKeyhole size={10} aria-hidden="true" /> {label}
                </small>
              </div>
            ))}
            <div className="tee-block">
              <span className="tee-redacted" aria-hidden="true" />
              <small>
                <KeyRound size={10} aria-hidden="true" /> Grader signing key
              </small>
            </div>
            {gym && (
              <div className="tee-block tee-count">
                <strong>
                  {gym.trainTasks} + {gym.heldoutTasks}
                </strong>
                <small>training + held-out tasks, sealed</small>
              </div>
            )}
          </div>
          <div className="tee-core" aria-live="polite">
            <BotArt id={GRADER_BOT} size={30} state={step >= 1 && step <= 6 ? "focus" : "idle"} />
            <span>{step >= 1 && step <= 6 ? steps[step - 1].title : step === 0 ? "Waiting for a rollout" : "Score sealed and sent"}</span>
          </div>
        </div>
        <div className="tee-port tee-out">
          <h3>Score + signature out</h3>
          <div className="tee-packet" data-out data-step={step}>
            {box ? <SandboxValue box={box} /> : <span>…</span>}
            <small>{grader ? "signed " + shortKey(grader.key) : "signed"}</small>
          </div>
          <p className="chain-small">No answers, no hidden tests, no checks</p>
        </div>
      </section>
      <p className="tee-caption">
        Animation illustrates the flow. Rewards, totals, keys and addresses are real, read from the grader’s tab and
        devnet.
      </p>

      <div className="sandbox-columns">
        <section className="grading-steps" aria-labelledby="steps-title">
          <h2 id="steps-title">
            <ScrollText size={18} aria-hidden="true" /> Grading, step by step
          </h2>
          <ol>
            {steps.map((s, i) => (
              <li key={s.title} data-state={step > i + 1 || step === 7 ? "done" : step === i + 1 ? "now" : "next"}>
                <span className="verify-step">{i + 1}</span>
                <div>
                  <h4>{s.title}</h4>
                  <div className="step-body">{s.body}</div>
                </div>
              </li>
            ))}
          </ol>
          {focus?.group.rewards && (
            <div className="group-strip" aria-label={`All ${focus.group.size} rewards in this group`}>
              <small>Group {focus.group.index}</small>
              {focus.group.rewards.map((r, i) => (
                <Link
                  key={i}
                  href={`/live/${encodeURIComponent(run.id)}/grader/${focus.group.firstRep + i}`}
                  data-state={r.status === "flagged" || r.status === "error" ? "flagged" : "scored"}
                  data-current={focus.group.firstRep + i === rep}
                  style={{ ["--r" as string]: String(r.reward ?? 0) }}
                  title={`#${focus.group.firstRep + i}: ${r.status === "ok" ? (r.reward ?? 0).toFixed(2) : r.status}`}
                />
              ))}
              <small>mean {focus.group.mean.toFixed(3)}</small>
            </div>
          )}
        </section>

        <section className="verify-section" aria-labelledby="verify-title">
          <h2 id="verify-title">
            <BadgeCheck size={18} aria-hidden="true" /> Why Solana trusts this grader
          </h2>
          {grader && verification ? (
            <VerificationChain grader={grader} programId={verification.programId} />
          ) : (
            <p className="quiet">Reading the grader record from devnet…</p>
          )}
          {others.map((o) => (
            <p key={o.key} className="chain-small other-grader">
              Also on this program: grader <ExplorerLink address={o.key} /> with hardware{" "}
              <b>{hardwareName(o.hardware)}</b> (record <ExplorerLink address={o.record} />
              {o.gyms.length ? <>, Gym {o.gyms.map((g) => g.id).join(", ")}</> : null}).
            </p>
          ))}
        </section>
      </div>

      <section className="chain-accounts" aria-labelledby="accounts-title">
        <h2 id="accounts-title">
          <Image src="/providers/solana.svg" alt="" width={20} height={17} unoptimized /> On Solana devnet
        </h2>
        <dl>
          {verification && (
            <>
              <div>
                <dt>Program</dt>
                <dd>
                  <ExplorerLink address={verification.programId} />
                </dd>
              </div>
              <div>
                <dt>Config · approved code</dt>
                <dd>
                  <ExplorerLink address={verification.config.address} />
                </dd>
              </div>
              <div>
                <dt>Gym account</dt>
                <dd>
                  <ExplorerLink address={verification.gym.address} />
                </dd>
              </div>
              <div>
                <dt>Grader record</dt>
                <dd>
                  <ExplorerLink address={verification.grader.record} />
                </dd>
              </div>
              <div>
                <dt>Test USDC mint</dt>
                <dd>
                  <ExplorerLink address={verification.config.mint} />
                </dd>
              </div>
            </>
          )}
          {view && (
            <>
              <div>
                <dt>Payment channel</dt>
                <dd>
                  <ExplorerLink address={view.channel} />
                </dd>
              </div>
              <div>
                <dt>Channel deposit</dt>
                <dd>{view.openTx ? <ExplorerLink tx={view.openTx} /> : "Not found"}</dd>
              </div>
              <div>
                <dt>Settlement</dt>
                <dd>{view.settled ? <ExplorerLink tx={view.settled.tx} /> : "Not settled yet"}</dd>
              </div>
              {view.refused.slice(0, 3).map((r) => (
                <div key={r.signature}>
                  <dt>Refused attempt</dt>
                  <dd>
                    <ExplorerLink tx={r.signature} />
                  </dd>
                </div>
              ))}
            </>
          )}
        </dl>
        <p className="trust-caption">devnet · SCC beta · test USDC</p>
      </section>
    </div>
  );
}
