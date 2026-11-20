/**
 * The attestation authority: the stand-in for Solana Confidential Compute.
 *
 * SCC verifies a TEE's hardware report onchain and writes a public record
 * (key, hardware type, expiry). Its devnet program ID and record layout were
 * not public when this was built, so this module does the same job off-chain
 * and writes the record through `register_grader`, signed by the config's
 * attestation authority. The program itself still enforces the parts that
 * matter: the code hash must be on the approved list, the report slot must be
 * fresh, and the record expires. Switching to SCC means reading its record
 * instead; the GraderRecord fields were chosen to match.
 *
 * What is checked here today:
 * - TDX: the quote's report_data starts with sha256(signKey || encKey || slot),
 *   so the keys were created inside the machine that produced the quote.
 *   The quote's Intel signature chain is NOT verified here (that is exactly
 *   what SCC does onchain); this is stated in the record's `verification` note.
 * - dev: there is no report. Allowed only when the onchain config says
 *   `allow_unattested` (devnet), and the record says hardware = none.
 */

import { PublicKey, SystemProgram } from "@solana/web3.js";
import { emit } from "./events";
import type { HardwareReport } from "./enclave/identity";
import { BN, admin, configPda, graderPda, program, send } from "./solana";

export const HARDWARE_CODE = { none: 0, tdx: 1 } as const;
/** Records last a day; graders re-attest before expiry. */
const RECORD_TTL_SECONDS = 24 * 3600;

/** TDX quote v4: 48-byte header, then a 584-byte TD report whose last 64 bytes are report_data. */
function tdxReportData(quoteHex: string): Buffer {
  const q = Buffer.from(quoteHex.replace(/^0x/, ""), "hex");
  return q.subarray(48 + 520, 48 + 584);
}

export type Registration = {
  ok: boolean;
  signature?: string;
  error?: string;
  verification: string;
  expiresAt: number;
};

export async function registerGrader(input: {
  grader: PublicKey;
  encKey: Uint8Array;
  codeHash: string;
  report: HardwareReport;
}): Promise<Registration> {
  const { grader, encKey, codeHash, report } = input;
  let verification: string;
  if (report.hardware === "tdx") {
    if (!report.quote) return { ok: false, error: "TDX report has no quote", verification: "missing quote", expiresAt: 0 };
    const bound = tdxReportData(report.quote).subarray(0, 32).toString("hex") === report.reportData;
    if (!bound) return { ok: false, error: "Quote's report_data does not bind these keys", verification: "binding failed", expiresAt: 0 };
    verification = "TDX quote binds keys and slot; Intel signature chain not verified off-chain (SCC verifies it onchain)";
  } else {
    verification = "No TEE (dev mode): no hardware report. Accepted only because devnet config allows unattested graders";
  }

  const expiresAt = Math.floor(Date.now() / 1000) + RECORD_TTL_SECONDS;
  emit({
    lane: "solana",
    kind: "scc.check",
    text: `Attestation check for grader ${grader.toBase58().slice(0, 6)}…: code ${codeHash.slice(0, 8)}…, hardware ${report.hardware}`,
    data: { grader: grader.toBase58(), codeHash, hardware: report.hardware, reportSlot: report.reportSlot, verification },
  });
  const ix = await program()
    .methods.registerGrader(
      grader,
      Array.from(encKey),
      Array.from(Buffer.from(codeHash, "hex")),
      HARDWARE_CODE[report.hardware],
      new BN(report.reportSlot),
      new BN(expiresAt),
    )
    .accountsPartial({
      attestationAuthority: admin().publicKey,
      config: configPda(),
      graderRecord: graderPda(grader),
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  // landFailures: a refused registration (unapproved code) lands onchain so anyone can see the refusal.
  const sent = await send([ix], [admin()], { landFailures: true });
  emit({
    lane: "solana",
    kind: sent.ok ? "scc.record" : "scc.rejected",
    ok: sent.ok,
    tx: sent.signature,
    text: sent.ok
      ? `Grader record written: ${grader.toBase58().slice(0, 6)}… is verified until ${new Date(expiresAt * 1000).toISOString()}`
      : `Grader record refused: ${sent.error}`,
    data: { grader: grader.toBase58(), codeHash },
  });
  return sent.ok
    ? { ok: true, signature: sent.signature, verification, expiresAt }
    : { ok: false, signature: sent.signature, error: sent.error, verification, expiresAt };
}
