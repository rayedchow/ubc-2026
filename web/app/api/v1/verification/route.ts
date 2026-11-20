import { requireDeployment, v1 } from "@/lib/server/api";
import { trustOverview } from "@/lib/server/verification";

export const dynamic = "force-dynamic";

/** The program, its config, and every known grader's onchain record (read from devnet, cached for a few seconds). */
export async function GET() {
  return v1(async () => {
    requireDeployment();
    return trustOverview();
  });
}
