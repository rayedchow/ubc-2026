import { jsonBody, requireDeployment, v1 } from "@/lib/server/api";
import { attestationChallenge } from "@/lib/server/run-attestations";

export const dynamic = "force-dynamic";

/** POST { address }: the message the wallet signs (run, channel, Gym, score, nonce). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return v1(async () => {
    requireDeployment();
    const body = await jsonBody<{ address?: unknown }>(req);
    return attestationChallenge(id, body.address);
  });
}
