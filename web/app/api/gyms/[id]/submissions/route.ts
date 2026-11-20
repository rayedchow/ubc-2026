import { acceptModelSubmission } from "@/lib/atlas-registry";
import { respond, readJson } from "@/lib/http";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return respond(async () => acceptModelSubmission(id, await readJson(request)), 201);
}
