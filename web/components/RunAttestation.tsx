"use client";
import bs58 from "bs58";
import { useEffect, useState } from "react";
import { BadgeCheck, PenLine } from "lucide-react";
import { ExplorerLink } from "./TrustLayer";
import { PixelButton } from "./ui/game-controls";
import { api, post } from "@/lib/client";
import { shortKey } from "@/lib/grader-rubric";
import type { MonitorRun } from "@/lib/run-monitor";
import type { RunAttestation as Attestation, WalletRole } from "@/lib/server/run-attestations";

/** The part of an injected Solana wallet (Phantom, Solflare, Backpack) needed to sign a message. */
type Provider = {
  publicKey?: { toString(): string } | null;
  connect(): Promise<unknown>;
  signMessage(message: Uint8Array, display?: "utf8"): Promise<{ signature: Uint8Array }>;
};
type WalletWindow = Window & { phantom?: { solana?: Provider }; solflare?: Provider; backpack?: Provider };
const WALLETS: { name: string; find: (w: WalletWindow) => Provider | undefined }[] = [
  { name: "Phantom", find: (w) => w.phantom?.solana },
  { name: "Solflare", find: (w) => w.solflare },
  { name: "Backpack", find: (w) => w.backpack },
];
/** Prefer the wallet the WalletConnect button last used (same storage key). */
function findWallet(): { name: string; provider: Provider } | null {
  const w = window as WalletWindow;
  let last: string | null = null;
  try {
    last = localStorage.getItem("modelmon-wallet");
  } catch {}
  const order = [...WALLETS].sort((a, b) => Number(b.name === last) - Number(a.name === last));
  for (const x of order) {
    const provider = x.find(w);
    if (provider) return { name: x.name, provider };
  }
  return null;
}

type Status = {
  eligible: boolean;
  reason: string | null;
  attestation: Attestation | null;
  score: { before: number; after: number; groups: number; reps: number } | null;
  trainer: string;
  linkedWallet: string | null;
};

export const ROLE_LABEL: Record<WalletRole, string> = {
  "channel-trainer": "the run’s channel wallet",
  linked: "wallet linked to trainer",
  unlinked: "attesting wallet, not linked to this run’s trainer",
};

export function RunAttestation({ run }: { run: MonitorRun }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const path = `/api/runs/${encodeURIComponent(run.id)}/attest`;
  useEffect(() => {
    let live = true;
    api<Status>(path)
      .then((s) => live && setStatus(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [path, run.status]);
  if (!status || (!status.attestation && !status.eligible)) return null;

  async function attest() {
    setError("");
    const wallet = findWallet();
    if (!wallet) {
      setError("No Solana wallet found. Install Phantom, Solflare or Backpack, then try again.");
      return;
    }
    try {
      setBusy("Connecting " + wallet.name);
      await wallet.provider.connect();
      const address = wallet.provider.publicKey?.toString();
      if (!address) throw new Error(`${wallet.name} did not connect. Unlock it and try again.`);
      setBusy("Sign in " + wallet.name);
      const { message } = await post<{ message: string }>(path + "/challenge", { address });
      const { signature } = await wallet.provider.signMessage(new TextEncoder().encode(message), "utf8");
      setBusy("Sealed grader is writing the record on devnet");
      const res = await post<{ attestation: Attestation }>(path, { address, signature: bs58.encode(signature) });
      setStatus({ ...status!, eligible: false, attestation: res.attestation });
    } catch (e) {
      if ((e as { code?: number })?.code !== 4001) setError((e as Error).message || "The attestation failed.");
    } finally {
      setBusy(null);
    }
  }

  const a = status.attestation;
  return (
    <section className="run-attest" aria-labelledby="attest-title" data-done={!!a}>
      <div className="run-attest-head">
        <h2 id="attest-title">
          <BadgeCheck size={18} aria-hidden="true" /> {a ? "Attested on Solana" : "Attest this run"}
        </h2>
        {status.score && (
          <span className="run-attest-score">
            <span>
              Mean training reward {(a ?? status.score).before.toFixed(3)} → <b>{(a ?? status.score).after.toFixed(3)}</b>
            </span>
            <small>first → last graded group · graded in the sealed grader · not held-out</small>
          </span>
        )}
        {!a && (
          <PixelButton tone="gold" disabled={!!busy} onClick={attest}>
            <PenLine size={16} aria-hidden="true" /> {busy ?? "Add attestation"}
          </PixelButton>
        )}
      </div>
      {a ? (
        <dl className="trust-facts run-attest-facts">
          <dt>Record</dt>
          <dd>
            <ExplorerLink address={a.result} /> · tx <ExplorerLink tx={a.tx} />
          </dd>
          <dt>Wallet</dt>
          <dd>
            <ExplorerLink address={a.wallet} />{" "}
            <span className="trust-chip" data-tone={a.walletRole === "unlinked" ? "warn" : "ok"}>
              {a.walletRole === "linked" ? `${ROLE_LABEL.linked} ${a.trainer}` : ROLE_LABEL[a.walletRole]}
            </span>
          </dd>
          <dt>Wallet signature</dt>
          <dd>
            <code title={a.signature}>{shortKey(a.signature, 10)}</code>
            <small>sha256(wallet | signature) is stored in the record’s model_after field</small>
          </dd>
          <dt>Signed by</dt>
          <dd>The verified sealed grader (record_result checks its onchain record)</dd>
        </dl>
      ) : (
        <p className="chain-small">
          Your wallet signs the run, channel, Gym and score (no funds move). The verified sealed grader then writes the
          result onchain with <code>record_result</code>. One attestation per run.
          {status.linkedWallet
            ? ` This run’s trainer (${status.trainer}) is linked to ${shortKey(status.linkedWallet)}; sign with that wallet.`
            : ` Trainer “${status.trainer}” has no linked wallet, so the signer is recorded as the attesting wallet.`}
        </p>
      )}
      {error && (
        <p className="trust-warn" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
