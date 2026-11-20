import { readJson, respond } from "@/lib/http";
import { createChallenge } from "@/lib/server/wallet-links";

/** POST { address }: a one-time message for that wallet to sign. */
export function POST(request: Request) {
  return respond(async () => createChallenge(((await readJson(request)) ?? {}) as { address?: unknown }));
}
