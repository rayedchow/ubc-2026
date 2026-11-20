import { creatorProfile } from "@/lib/atlas-registry";
import { respond } from "@/lib/http";

export async function GET(_request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return respond(() => creatorProfile(handle));
}
