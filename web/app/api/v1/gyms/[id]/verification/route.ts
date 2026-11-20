import { HttpError, requireDeployment, v1 } from "@/lib/server/api";
import { gymVerification } from "@/lib/server/verification";

export const dynamic = "force-dynamic";

/** A Gym's registry entry plus the onchain record of the grader that holds it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return v1(async () => {
    requireDeployment();
    const view = await gymVerification(id);
    if (!view) throw new HttpError(404, `Gym ${id} is not registered on devnet.`);
    return view;
  });
}
