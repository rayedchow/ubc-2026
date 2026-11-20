import { respond } from "@/lib/http";
import { league } from "@/lib/service";
import { listLeagueBots } from "@/lib/atlas-registry";
export function GET(request: Request) {
  if (new URL(request.url).searchParams.get("view") === "bots") return respond(listLeagueBots);
  return respond(() => league(listLeagueBots()));
}
