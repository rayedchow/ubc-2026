import { createAtlasGym, listAtlasGyms } from "@/lib/atlas-registry";
import { respond, readJson } from "@/lib/http";
export const runtime = "nodejs";
export async function GET() {
  return respond(() => ({ gyms: listAtlasGyms() }));
}
export async function POST(request: Request) {
  return respond(async () => createAtlasGym(await readJson(request)), 201);
}
