import { respond, readJson } from "@/lib/http";
import { getModel, configureModel } from "@/lib/service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return respond(() => getModel(id));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return respond(async () => configureModel(id, await readJson(request)));
}
