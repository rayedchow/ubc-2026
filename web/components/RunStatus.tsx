import type { RunSnapshot } from "@/lib/types";

const labels = { training: "Training", "budget-spent": "Ready to settle", settled: "Settled" };
export function RunStatus({ status }: Pick<RunSnapshot, "status">) {
  return (
    <span className="run-status" data-status={status}>
      {labels[status]}
    </span>
  );
}
