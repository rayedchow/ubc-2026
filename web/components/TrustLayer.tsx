"use client";
import Image from "next/image";
import type { ReactNode } from "react";
import { BadgeCheck, Cpu, LockKeyhole, TriangleAlert } from "lucide-react";
import { PixelArrow } from "./ui/pixel-arrow";
import { useApi } from "@/lib/client";
import { VERIFIER_LABEL, explorer, shortKey } from "@/lib/grader-rubric";
import type { ConfigView, GraderView, GymChainView } from "@/lib/server/verification";
import "./sealed-grader.css";

export type Overview = {
  programId: string;
  config: ConfigView;
  graders: (GraderView & { gyms: { id: string; address: string }[] })[];
};
export type GymVerification = { programId: string; gym: GymChainView; grader: GraderView; config: ConfigView };

/** A devnet Explorer link for a real address or transaction signature. */
export function ExplorerLink({
  address,
  tx,
  children,
  title,
}: {
  address?: string;
  tx?: string;
  children?: ReactNode;
  title?: string;
}) {
  const value = (address ?? tx)!;
  return (
    <a
      className="explorer-link"
      href={address ? explorer.address(address) : explorer.tx(tx!)}
      target="_blank"
      rel="noreferrer"
      title={title ?? value}
    >
      {children ?? <code>{shortKey(value, 5)}</code>}
      <PixelArrow direction="external" size={10} />
    </a>
  );
}

export const hardwareName = (h?: string) =>
  h === "tdx" ? "Intel TDX" : h === "sev-snp" ? "AMD SEV-SNP" : h === "none" ? "None (devnet, unattested)" : "Unknown";

const when = (s?: number) =>
  s
    ? new Date(s * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

/** What the onchain grader record says, field by field, with the truth about who verified it. */
export function GraderRecordFacts({ grader, config }: { grader: GraderView; config?: ConfigView }) {
  if (!grader.exists)
    return (
      <p className="trust-warn">
        <TriangleAlert size={14} aria-hidden="true" /> No onchain record for this grader: Solana refuses its payments and
        scores (GraderNotVerified).
      </p>
    );
  return (
    <dl className="trust-facts">
      <dt>Grader key</dt>
      <dd>
        <ExplorerLink address={grader.key} />
      </dd>
      <dt>Record</dt>
      <dd>
        <ExplorerLink address={grader.record} />
      </dd>
      <dt>Hardware</dt>
      <dd data-tone={grader.hardware === "none" ? "warn" : "ok"}>{hardwareName(grader.hardware)}</dd>
      <dt>Verified by</dt>
      <dd>
        {grader.source === "scc" ? "SCC record" : VERIFIER_LABEL.replace("Verifier: ", "")}
        {grader.offchainCheck ? (
          <small>
            Quote checked via {grader.offchainCheck.by} ·{" "}
            <a href={grader.offchainCheck.url} target="_blank" rel="noreferrer">
              checksum {grader.offchainCheck.checksum.slice(0, 10)}…
            </a>
          </small>
        ) : grader.hardware === "none" ? (
          <small>
            No hardware report to check. Accepted only because devnet config allows unattested graders
            {config ? ` (allow_unattested = ${config.allowUnattested})` : ""}.
          </small>
        ) : null}
      </dd>
      <dt>Code hash</dt>
      <dd>
        <code title={grader.codeHash}>{grader.codeHash?.slice(0, 16)}…</code>{" "}
        <span className="trust-chip" data-tone={grader.approved ? "ok" : "bad"}>
          {grader.approved ? "approved" : "not approved"}
        </span>
      </dd>
      <dt>Report slot</dt>
      <dd>{grader.reportSlot?.toLocaleString("en-US")}</dd>
      <dt>Expires</dt>
      <dd>
        {when(grader.expiresAt)}{" "}
        <span className="trust-chip" data-tone={grader.live ? "ok" : "bad"}>
          {grader.live ? "live" : "expired"}
        </span>
      </dd>
    </dl>
  );
}

/** One grader as a compact card: character, hardware, verdict. */
export function GraderCard({
  grader,
  config,
  children,
}: {
  grader: GraderView & { gyms?: { id: string; address: string }[] };
  config?: ConfigView;
  children?: ReactNode;
}) {
  const ok = grader.exists && grader.live && grader.approved;
  return (
    <article className="grader-card" data-hardware={grader.hardware}>
      <header>
        <span className="grader-chip-icon" aria-hidden="true">
          {grader.hardware === "none" ? <Cpu size={18} /> : <LockKeyhole size={18} />}
        </span>
        <div>
          <strong>{grader.hardware === "tdx" ? "Phala TDX grader" : "Local devnet grader"}</strong>
          <small>{hardwareName(grader.hardware)}</small>
        </div>
        <span className="trust-chip" data-tone={ok ? (grader.hardware === "none" ? "warn" : "ok") : "bad"}>
          {ok ? <BadgeCheck size={13} aria-hidden="true" /> : null}
          {ok ? (grader.hardware === "none" ? "Record live · unattested" : "Record live · attested") : "Not verified"}
        </span>
      </header>
      <GraderRecordFacts grader={grader} config={config} />
      {grader.gyms && (
        <p className="grader-gyms">
          Holds{" "}
          {grader.gyms.map((g, i) => (
            <span key={g.id}>
              {i ? ", " : ""}
              <ExplorerLink address={g.address}>{g.id}</ExplorerLink>
            </span>
          ))}
        </p>
      )}
      {children}
    </article>
  );
}

/** The flow in one line, used wherever the sealed grader appears. */
export function SealedLine({ compact = false }: { compact?: boolean }) {
  return (
    <p className="sealed-line" data-compact={compact}>
      <span>Rollouts in</span>
      <PixelArrow size={11} />
      <b>sealed grader</b>
      <PixelArrow size={11} />
      <span>scores out</span>
      <i>Answers never leave.</i>
    </p>
  );
}

/** The /runs overview panel: program, config, and every grader's onchain record. */
export function TrustOverview() {
  const { data, error } = useApi<Overview>("/api/v1/verification", 30_000);
  return (
    <section className="trust-overview" aria-labelledby="trust-title">
      <div className="trust-head">
        <div>
          <h2 id="trust-title">
            <Image src="/providers/solana.svg" alt="" width={20} height={17} unoptimized /> Verified sealed graders
          </h2>
          <SealedLine compact />
        </div>
        {data && (
          <div className="trust-links">
            <ExplorerLink address={data.programId}>Modélmon program</ExplorerLink>
            <ExplorerLink address={data.config.address}>Config · approved code</ExplorerLink>
          </div>
        )}
      </div>
      <p className="trust-explain">
        Solana pays a channel or records a score only if a grader with a live record for approved code signed it (
        <code>settle</code>, <code>record_result</code>). The record follows Solana Confidential Compute’s shape: key,
        code hash, hardware, expiry. SCC’s program ID isn’t public yet, so an attestation authority writes it.
      </p>
      {error ? (
        <p className="trust-warn">Could not read devnet: {error}</p>
      ) : !data ? (
        <p className="quiet">Reading grader records from devnet…</p>
      ) : (
        <div className="grader-cards">
          {data.graders.map((g) => (
            <GraderCard key={g.key} grader={g} config={data.config} />
          ))}
        </div>
      )}
      <p className="trust-caption">devnet · SCC beta · test USDC</p>
    </section>
  );
}

/** A Gym page's view of its grader: registry entry, record and verification status. */
export function GymTrustPanel({ gymId }: { gymId: string }) {
  const { data, error } = useApi<GymVerification>(`/api/v1/gyms/${encodeURIComponent(gymId)}/verification`, 30_000);
  if (error) return null;
  if (!data) return <p className="quiet">Reading the grader record from devnet…</p>;
  const { gym, grader, config } = data;
  return (
    <div className="gym-trust">
      <h3>Sealed grader on Solana</h3>
      <SealedLine compact />
      <dl className="trust-facts">
        <dt>Gym account</dt>
        <dd>
          <ExplorerLink address={gym.address} />
        </dd>
        <dt>Program</dt>
        <dd>
          <ExplorerLink address={data.programId} />
        </dd>
        <dt>Grader version</dt>
        <dd>
          <code title={gym.graderVersion}>sha256:{gym.graderVersion.slice(0, 12)}…</code>
        </dd>
        <dt>Sealed tasks</dt>
        <dd>
          {gym.trainTasks} training · {gym.heldoutTasks} held out
        </dd>
        <dt>Price</dt>
        <dd>{gym.pricePerRep.toLocaleString("en-US", { maximumFractionDigits: 6 })} USDC per rep, over x402</dd>
        <dt>Split</dt>
        <dd>
          {gym.split.leaderBps / 100}% Gym Leader · {gym.split.contributorBps / 100}% contributors ·{" "}
          {gym.split.platformBps / 100}% treasury
        </dd>
      </dl>
      <GraderCard grader={grader} config={config} />
    </div>
  );
}
