import { recordSession } from "@/lib/atlas-registry";
import { readJson, respond } from "@/lib/http";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return respond(async () => recordSession(id, await readJson(request)));
}
