import { respond } from "@/lib/http";
import { runSealedTest } from "@/lib/service";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return respond(() => runSealedTest(id));
}
