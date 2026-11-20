import { HttpError, requireDeployment, v1 } from "@/lib/server/api";
import { enclave } from "@/lib/server/enclave/grader";
import { explorerTx } from "@/lib/server/env";

/** Closes the tab: one transaction pays the Gym Leader, contributors and platform, and refunds the trainer. */
export async function POST(_req: Request, { params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params;
  return v1(async () => {
    requireDeployment();
    try {
      const r = await (await enclave()).settle(channel);
      if (!r.ok) throw new HttpError(409, `Settlement rejected: ${r.error}`);
      return { ...r, explorer: explorerTx(r.tx) };
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, (err as Error).message);
    }
  });
}
