import { respond } from "@/lib/http";
import { addCredits } from "@/lib/service";

/** POST { amount }: deposit USDC into this model's vault. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return respond(() => addCredits(id, body ?? {}));
}
