import { notFound } from "next/navigation";
import { RunMonitor } from "@/components/RunMonitor";

/** One rollout's sandbox inside the sealed grader, for a run in the Live view. */
export default async function GraderSandboxPage({ params }: { params: Promise<{ id: string; rep: string }> }) {
  const { id, rep } = await params;
  const n = Number(rep);
  if (!Number.isSafeInteger(n) || n < 1) notFound();
  return <RunMonitor selection={id} sandbox={n} />;
}
