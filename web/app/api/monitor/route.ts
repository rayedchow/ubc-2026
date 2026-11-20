import { NextRequest } from "next/server";
import { sampleRun } from "@/lib/sample-run";
import { findRunGymProfile } from "@/lib/atlas-registry";
import { listModels } from "@/lib/service";
import { demoRuns, monitorModel } from "@/lib/monitor-demo";
import { reportedRuns } from "@/lib/reported-runs";
import { identify, viewerConfigured } from "@/lib/integration-auth";
import { isActiveRun, type MonitorSnapshot } from "@/lib/run-monitor";
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const selected = params.get("run");
  const requestedStart = Number(params.get("sampleStart"));
  const sampleStart =
    Number.isSafeInteger(requestedStart) && requestedStart > 0 && requestedStart <= Date.now()
      ? requestedStart
      : Date.now() - 12_000;
  const key = req.cookies.get("monitor_view")?.value;
  let lastActiveId: string | undefined;
  const snapshot = (): MonitorSnapshot => {
    const viewer = identify(key ?? null, "viewerKey");
    const trainer = viewer ?? params.get("trainer") ?? "local";
    const demo = demoRuns(),
      real = viewer ? reportedRuns(viewer) : [];
    const all = [...real, ...demo.filter((r) => r.model.trainer === trainer)].sort(
      (a, b) => b.startedAt - a.startedAt,
    );
    const active = all.find((r) => isActiveRun(r.status));
    if (active) lastActiveId = active.id;
    const detail =
      selected === "sample"
        ? sampleRun(sampleStart)
        : selected === "current"
          ? (active ?? all.find((r) => r.id === lastActiveId))
          : (all.find((r) => r.id === selected) ?? demo.find((r) => r.id === selected));
    const models = new Map(
      listModels()
        .map(monitorModel)
        .filter((m) => m.trainer === trainer)
        .map((m) => [m.id, m]),
    );
    for (const r of all) models.set(r.model.id, r.model);
    return {
      at: Date.now(),
      trainer,
      canConnect: viewerConfigured(),
      connected: !!viewer,
      models: [...models.values()],
      runs: all.map(
        ({ id, source, model, gym, skills, status, startedAt, reps, budget, accepted, workers }) => ({
          id,
          source,
          model,
          gym,
          skills,
          status,
          startedAt,
          reps,
          budget,
          accepted,
          workerCount: workers.length,
          activeWorkers: workers.filter((w) => w.state !== "Offline" && w.state !== "Finished").length,
        }),
      ),
      detail: detail ? { ...detail, gymProfile: findRunGymProfile(detail.gymId) } : null,
    };
  };
  const headers = { "Cache-Control": "no-store, private", Vary: "Cookie" };
  if (!params.has("stream")) return Response.json(snapshot(), { headers });
  const encoder = new TextEncoder();
  let cancelled = false;
  let cleanup: () => void = () => {};
  const body = new ReadableStream({
    start(controller) {
      let closed = false;
      const connectedAt = Date.now();
      const stop = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        req.signal.removeEventListener("abort", stop);
        if (controller.desiredSize !== null && !cancelled) controller.close();
      };
      const emit = () => {
        if (closed) return;
        if (Date.now() - connectedAt >= 300_000) return stop();
        try {
          controller.enqueue(encoder.encode("data: " + JSON.stringify(snapshot()) + "\n\n"));
        } catch {
          stop();
        }
      };
      const timer = setInterval(emit, 1200);
      cleanup = stop;
      req.signal.addEventListener("abort", stop, { once: true });
      if (req.signal.aborted) stop();
      else emit();
    },
    cancel() {
      cancelled = true;
      cleanup();
    },
  });
  return new Response(body, {
    headers: { ...headers, "Content-Type": "text/event-stream", "X-Accel-Buffering": "no" },
  });
}
