import { respond } from "@/lib/http";
import { getRun } from "@/lib/service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return respond(() => getRun(id));
}
