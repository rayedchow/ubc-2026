import { respond } from "@/lib/http";
import { listRuns, startRun } from "@/lib/service";

export function GET() {
  return respond(listRuns);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return respond(() => startRun(body ?? {}), 201);
}
