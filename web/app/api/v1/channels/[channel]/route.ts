import { HttpError, v1 } from "@/lib/server/api";
import { enclave } from "@/lib/server/enclave/grader";

/** The grader's tab for a channel: running total, reps, flags. Vouchers are not secret. */
export async function GET(_req: Request, { params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params;
  return v1(async () => {
    const tab = (await enclave()).tab(channel);
    if (!tab) throw new HttpError(404, "No tab for that channel.");
    const { idempotency: _i, ...rest } = tab;
    return rest;
  });
}
