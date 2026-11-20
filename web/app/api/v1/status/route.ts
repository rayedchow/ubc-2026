import { v1 } from "@/lib/server/api";
import { env, isDevnet } from "@/lib/server/env";
import { isLiveGym } from "@/lib/server/devnet-runs";
import { configPda, hex, maybeDeployment, program } from "@/lib/server/solana";

/** What is deployed on devnet and what the program currently trusts. */
export async function GET() {
  return v1(async () => {
    const d = maybeDeployment();
    const cfg = d ? await program().account.config.fetchNullable(configPda()) : null;
    return {
      mode: isDevnet() ? "devnet" : "mock",
      liveGyms: ["solana-transactions"].filter(isLiveGym),
      tee: env.tee,
      network: "devnet",
      programId: env.programId,
      deployment: d,
      config: cfg && {
        admin: cfg.admin.toBase58(),
        attestationAuthority: cfg.attestationAuthority.toBase58(),
        approvedCodeHashes: cfg.approved.map(hex),
        pending: cfg.hasPending ? { codeHash: hex(cfg.pendingHash), effectiveAt: new Date(cfg.pendingEffectiveAt.toNumber() * 1000).toISOString() } : null,
        timelockSeconds: cfg.timelockSecs.toNumber(),
        allowUnattested: cfg.allowUnattested,
      },
    };
  });
}
