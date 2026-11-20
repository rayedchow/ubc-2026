"use client";
import { BadgeCheck } from "lucide-react";
import { ExplorerLink, hardwareName } from "./TrustLayer";
import { ROLE_LABEL } from "./RunAttestation";
import { useApi } from "@/lib/client";
import type { GymResult } from "@/lib/server/run-attestations";

const pct = (n: number) => +(n * 100).toFixed(1) + "%";
const KIND = {
  "training-reward": "Training reward",
  "held-out": "Held-out sealed test",
  badge: "Badge",
} as const;

/** The Gym's onchain result records, read from devnet. */
export function GymResults({ gymId }: { gymId: string }) {
  const { data, error } = useApi<{ records: GymResult[] }>(`/api/v1/gyms/${encodeURIComponent(gymId)}/results`, 30_000);
  return (
    <div className="gym-results">
      <h3>
        <BadgeCheck size={16} aria-hidden="true" /> Attestations on Solana
      </h3>
      {error ? (
        <p className="trust-warn">Could not read devnet: {error}</p>
      ) : !data ? (
        <p className="quiet">Reading result records from devnet…</p>
      ) : !data.records.length ? (
        <p className="ledger-empty">No result records for this Gym yet. Finish a run and click Add attestation in the Live view.</p>
      ) : (
        <ol className="gym-result-list">
          {data.records.map((r) => (
            <li key={r.address} data-kind={r.kind}>
              <div className="gym-result-score">
                <strong>
                  {r.kind === "training-reward"
                    ? `${r.before.toFixed(3)} → ${r.after.toFixed(3)}`
                    : r.kind === "badge"
                      ? pct(r.after)
                      : `${pct(r.before)} → ${pct(r.after)}`}
                </strong>
                <span className="trust-chip" data-tone={r.kind === "held-out" ? "ok" : undefined}>
                  {KIND[r.kind]}
                  {r.kind === "held-out" ? ` · n=${r.heldoutN}${r.ci ? ` ± ${pct(r.ci)}` : ""}` : ""}
                </span>
              </div>
              <small>
                {r.kind === "training-reward"
                  ? "Mean reward, first → last graded group, graded in the sealed grader"
                  : r.kind === "held-out"
                    ? "Held-out tasks run inside the sealed grader"
                    : "Sealed score"}{" "}
                · {r.reps.toLocaleString("en-US")} reps · {new Date(r.recordedAt * 1000).toLocaleString()}
              </small>
              <small>
                Grader <ExplorerLink address={r.grader.key} /> · hardware {hardwareName(r.grader.hardware)}
              </small>
              {r.wallet && (
                <small>
                  Wallet <ExplorerLink address={r.wallet.address} /> (
                  {r.wallet.role === "linked" ? `${ROLE_LABEL.linked} ${r.wallet.trainer}` : ROLE_LABEL[r.wallet.role]})
                  {r.wallet.hashMatches ? " · signature hash matches the record" : " · signature hash does NOT match"}
                </small>
              )}
              <small>
                <ExplorerLink address={r.address}>Result record</ExplorerLink>
                {r.wallet && (
                  <>
                    {" "}
                    · <ExplorerLink tx={r.wallet.tx}>transaction</ExplorerLink>
                  </>
                )}
              </small>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
