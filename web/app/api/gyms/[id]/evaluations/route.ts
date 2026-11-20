import { evaluateSession } from "@/lib/atlas-registry";
import { readJson, respond } from "@/lib/http";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return respond(async () => evaluateSession(id, await readJson(request)));
}
