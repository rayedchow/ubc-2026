import { recentEvents, subscribe, type FeedEvent } from "@/lib/server/events";

export const dynamic = "force-dynamic";

/**
 * Server-sent events for the live visualizer. Replays recent events after
 * `?since=<id>` (or Last-Event-ID), then streams new ones.
 * Add `?format=json` to get the recent events once as JSON instead.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const since = Number(url.searchParams.get("since") ?? req.headers.get("last-event-id") ?? 0);
  if (url.searchParams.get("format") === "json") return Response.json(recentEvents(since));
  const enc = new TextEncoder();
  let unsubscribe = () => {};
  let ping: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    start(controller) {
      const send = (e: FeedEvent) => controller.enqueue(enc.encode(`id: ${e.id}\nevent: ${e.kind}\ndata: ${JSON.stringify(e)}\n\n`));
      for (const e of recentEvents(since)) send(e);
      unsubscribe = subscribe(send);
      ping = setInterval(() => controller.enqueue(enc.encode(`: ping\n\n`)), 15000);
      req.signal.addEventListener("abort", () => {
        unsubscribe();
        clearInterval(ping);
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      unsubscribe();
      clearInterval(ping);
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" } });
}
