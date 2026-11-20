import { respond } from "@/lib/http";
import { createModel, listModels } from "@/lib/service";

export function GET() {
  return respond(listModels);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return respond(() => createModel(body ?? {}), 201);
}
