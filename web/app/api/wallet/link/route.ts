import { readJson, respond } from "@/lib/http";
import { linkedTrainer, linkWallet } from "@/lib/server/wallet-links";

/** GET ?address=: which trainer this wallet is linked to, or null. */
export function GET(request: Request) {
  return respond(() => linkedTrainer(new URL(request.url).searchParams.get("address") ?? ""));
}

/** POST { address, signature, trainer }: verify the signed challenge and link the wallet to that trainer. */
export function POST(request: Request) {
  return respond(async () => linkWallet(((await readJson(request)) ?? {}) as Record<string, unknown>));
}
