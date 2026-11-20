import { v1 } from "@/lib/server/api";
import { enclave } from "@/lib/server/enclave/grader";
import { hex } from "@/lib/server/solana";

/** The grader's public identity and its onchain record (the SCC-style record Solana checks). */
export async function GET() {
  return v1(async () => {
    const e = await enclave();
    const rec = await e.record().catch(() => null);
    return {
      ...e.info(),
      record: rec && {
        codeHash: hex(rec.codeHash),
        hardware: ["none", "tdx", "sev-snp"][rec.hardware],
        source: rec.source === 1 ? "scc" : "attestation-authority",
        reportSlot: rec.reportSlot.toString(),
        expiresAt: new Date(rec.expiresAt.toNumber() * 1000).toISOString(),
      },
    };
  });
}
