/**
 * Overlays a catalogue Gym with what is actually onchain, for Gyms sealed and
 * listed on devnet: price, task counts, grader version, the grader's code
 * fingerprint and any exclusive window come from the program accounts.
 */

import { isDevnet } from "./env";
import { isLiveGym } from "./devnet-runs";
import { graderPda, gymPda, hex, program } from "./solana";
import type { Gym } from "../types";

export async function withOnchainData(gym: Gym): Promise<Gym & { onchain?: { address: string; grader: string; hardware: string } }> {
  if (!isDevnet() || !isLiveGym(gym.id)) return gym;
  try {
    const a = await program().account.gym.fetch(gymPda(gym.id));
    const rec = await program().account.graderRecord.fetchNullable(graderPda(a.grader));
    const now = Date.now() / 1000;
    const exclusive = a.exclusiveUntil.toNumber() > now;
    return {
      ...gym,
      pricePerRep: Number(a.pricePerRep.toString()) / 1e6,
      trainTasks: a.trainTasks,
      heldOutTasks: a.heldoutTasks,
      graderVersion: `sha256:${hex(a.graderVersion).slice(0, 12)}`,
      codeHash: rec ? hex(rec.codeHash).slice(0, 12) : "unverified",
      status: exclusive ? "exclusive" : "open",
      exclusiveUntil: exclusive ? new Date(a.exclusiveUntil.toNumber() * 1000).toISOString() : undefined,
      onchain: {
        address: gymPda(gym.id).toBase58(),
        grader: a.grader.toBase58(),
        hardware: rec ? ["none (dev mode)", "Intel TDX", "AMD SEV-SNP"][rec.hardware] : "unverified",
      },
    };
  } catch {
    return gym;
  }
}
