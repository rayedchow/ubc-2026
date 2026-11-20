import { requireDeployment, v1 } from "@/lib/server/api";
import { gymResults } from "@/lib/server/run-attestations";

export const dynamic = "force-dynamic";

/** The Gym's onchain result records (badges, held-out tests, training-run attestations), read from devnet. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return v1(async () => {
    requireDeployment();
    return { records: await gymResults(id) };
  });
}
