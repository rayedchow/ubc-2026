import { jsonBody, requireDeployment, v1 } from "@/lib/server/api";
import { attestRun, attestationStatus } from "@/lib/server/run-attestations";

export const dynamic = "force-dynamic";

/** GET: whether this run can be attested, and its attestation if it has one. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return v1(() => attestationStatus(id));
}

/** POST { address, signature }: verify the signed challenge, then write the onchain record (once per run). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return v1(async () => {
    requireDeployment();
    return attestRun(id, await jsonBody(req));
  });
}
