import { gymAttestations } from "@/lib/gym-attestations";
import { respond } from "@/lib/http";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return respond(() => gymAttestations(id));
}
