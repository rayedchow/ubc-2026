import { jsonBody, requireDeployment, v1 } from "@/lib/server/api";
import { enclave, newRunId } from "@/lib/server/enclave/grader";
import { explorerTx } from "@/lib/server/env";
import { emit } from "@/lib/server/events";
import { noteForChannel } from "@/lib/server/devnet-runs";

/**
 * The "we try to cheat" demo. Builds a modified grader (every reward forced
 * to 1.0), which changes its code fingerprint, then has it:
 *  1. ask for a grader record: refused onchain (code not approved),
 *  2. try to settle a real channel with the trainer's real voucher: refused
 *     (GraderNotVerified),
 *  3. try to write a fake 100% improvement record: refused.
 * All three are real devnet transactions that land and fail, visible on Explorer.
 * The channel is untouched; the real grader can still settle it.
 */
export async function POST(req: Request) {
  return v1(async () => {
    requireDeployment();
    const { channel, gymId = "solana-transactions" } = await jsonBody<{ channel?: string; gymId?: string }>(req);
    const real = await enclave();
    const fake = await enclave("grader-tampered", "inflate");
    emit({
      lane: "enclave",
      kind: "tamper.start",
      ok: false,
      text: `Swapped in a modified grader that forces every reward to 1.0. Code fingerprint ${real.id.codeHash.slice(0, 8)}… → ${fake.id.codeHash.slice(0, 8)}…`,
      data: { approved: real.id.codeHash, tampered: fake.id.codeHash, grader: fake.id.sign.publicKey.toBase58() },
    });

    const registration = await fake.ensureRegistered(true);

    let settlement = null;
    const tab = channel ? real.tab(channel) : undefined;
    if (tab && !tab.settled && tab.signature) {
      fake.adoptTab(tab);
      settlement = await fake.settle(tab.channel);
    }

    const record = await fake.recordResult({
      gymId,
      runId: newRunId(),
      kind: "evolution",
      modelBefore: "00".repeat(32),
      modelAfter: "ff".repeat(32),
      before: 41,
      after: 100,
      ci: 0,
      n: 1,
      reps: 0,
      cost: BigInt(0),
    });

    if (channel) {
      // Show each refusal in the run monitor's Solana lane, with its failed transaction.
      for (const sig of [("signature" in registration ? registration.signature : undefined), settlement?.tx, record.tx]) {
        if (sig) noteForChannel(channel, { kind: "rejected", signature: sig });
      }
    }
    const link = (r: { tx?: string } | null) => (r?.tx ? explorerTx(r.tx) : null);
    return {
      approvedCodeHash: real.id.codeHash,
      tamperedCodeHash: fake.id.codeHash,
      tamperedGrader: fake.id.sign.publicKey.toBase58(),
      registration: { ...registration, explorer: link(registration as { tx?: string; signature?: string } & { tx?: string }) ?? ("signature" in registration && registration.signature ? explorerTx(registration.signature) : null) },
      settlement: settlement && { ...settlement, explorer: link(settlement) },
      record: { ...record, explorer: link(record) },
    };
  });
}
