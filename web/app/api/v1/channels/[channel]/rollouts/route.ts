import { HttpError, requireDeployment, v1 } from "@/lib/server/api";
import { channelView } from "@/lib/server/verification";

export const dynamic = "force-dynamic";

/**
 * What the sealed grader did on one payment channel: the running voucher total,
 * the latest rollouts it graded (rewards and flags only, never outputs or
 * answers), and the channel's onchain transactions. `?rep=N` adds one rollout's
 * grading detail.
 */
export async function GET(req: Request, { params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params;
  const url = new URL(req.url);
  const rep = url.searchParams.get("rep");
  const limit = Number(url.searchParams.get("limit") ?? 30);
  return v1(async () => {
    requireDeployment();
    const view = await channelView(channel, { limit, rep: rep === null ? undefined : Number(rep) });
    if (!view) throw new HttpError(404, "No grader tab for that channel.");
    return view;
  });
}
