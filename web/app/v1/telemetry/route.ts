import { limitedJson, requireKey } from "@/lib/integration-auth";
import { saveReport } from "@/lib/reported-runs";
import { respond } from "@/lib/http";
export async function POST(request: Request) {
  return respond(async () => saveReport(requireKey(request, "trainerKey"), await limitedJson(request)));
}
