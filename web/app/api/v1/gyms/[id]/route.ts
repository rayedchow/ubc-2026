import { HttpError, requireDeployment, v1 } from "@/lib/server/api";
import { enclave } from "@/lib/server/enclave/grader";
import { explorerAddress } from "@/lib/server/env";
import { graderPda, gymPda, hex, program } from "@/lib/server/solana";

/** A Gym's onchain registry entry plus the record of the grader that holds it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return v1(async () => {
    requireDeployment();
    const gym = await program().account.gym.fetchNullable(gymPda(id));
    if (!gym) throw new HttpError(404, `Gym ${id} is not registered on devnet.`);
    const rec = await program().account.graderRecord.fetchNullable(graderPda(gym.grader));
    const e = await enclave();
    return {
      gymId: gym.gymId,
      address: gymPda(id).toBase58(),
      explorer: explorerAddress(gymPda(id).toBase58()),
      leader: gym.leader.toBase58(),
      pricePerRep: gym.pricePerRep.toString(),
      split: { leaderBps: gym.leaderBps, contributorBps: gym.contributorBps, platformBps: gym.platformBps },
      graderVersion: `sha256:${hex(gym.graderVersion)}`,
      trainTasks: gym.trainTasks,
      heldoutTasks: gym.heldoutTasks,
      exclusive: gym.exclusiveUntil.toNumber() > Date.now() / 1000 ? { holder: gym.exclusiveHolder.toBase58(), until: new Date(gym.exclusiveUntil.toNumber() * 1000).toISOString() } : null,
      grader: {
        key: gym.grader.toBase58(),
        record: graderPda(gym.grader).toBase58(),
        codeHash: rec ? hex(rec.codeHash) : null,
        hardware: rec ? ["none", "tdx", "sev-snp"][rec.hardware] : null,
        expiresAt: rec ? new Date(rec.expiresAt.toNumber() * 1000).toISOString() : null,
        servedHere: e.id.sign.publicKey.equals(gym.grader),
      },
    };
  });
}
