import { coins, type MonitorRun } from "@/lib/run-monitor";
import { RunLog } from "./RunLog";

export function RunBudget({ run, onGroup }: { run: MonitorRun; onGroup: (group: string) => void }) {
  const { budget, accepted, reserved, settled, split } = run;
  const payments = run.events
    .filter((e) => e.kind === "funded" || e.kind === "voucher" || e.kind === "settled")
    .reverse();
  const closed =
    payments.some((e) => e.kind === "settled") ||
    (settled ?? 0) > 0 ||
    ((run.source === "Channel demo" || run.source === "Devnet") && run.action !== "settle");
  const available = closed
    ? 0
    : budget !== undefined && accepted !== undefined && reserved !== undefined
      ? budget - accepted - reserved
      : undefined;
  return (
    <div className="budget-layout">
      <div className="budget-ledger">
        <h2>Grading budget</h2>
        <div className="budget-balance">
          <span>Accepted usage</span>
          <strong>{coins(accepted)}</strong>
          {budget !== undefined && <small>of {coins(budget)} budget</small>}
        </div>
        {budget !== undefined && budget > 0 && accepted !== undefined && (
          <div className="budget-meter" aria-hidden="true">
            <i style={{ width: Math.min(100, (accepted / budget) * 100) + "%" }} />
            {reserved !== undefined && reserved > 0 && (
              <i className="reserved" style={{ width: Math.min(100, (reserved / budget) * 100) + "%" }} />
            )}
          </div>
        )}
        <dl className="budget-entries">
          <div>
            <dt>Reserved in flight</dt>
            <dd>{coins(reserved)}</dd>
          </div>
          <div>
            <dt>Available to schedule</dt>
            <dd>{coins(available)}</dd>
          </div>
          <div>
            <dt>Settled</dt>
            <dd>{coins(settled)}</dd>
          </div>
        </dl>
        {split && (
          <dl className="budget-entries budget-split" aria-label="Settlement distribution">
            <div>
              <dt>Creator payout</dt>
              <dd>{coins(split.leader)}</dd>
            </div>
            <div>
              <dt>Contributors</dt>
              <dd>{coins(split.contributors)}</dd>
            </div>
            <div>
              <dt>Treasury</dt>
              <dd>{coins(split.platform)}</dd>
            </div>
          </dl>
        )}
      </div>
      <div className="budget-log">
        <h2>Payment log</h2>
        <RunLog
          events={payments}
          reported={run.source === "Reported" || run.source === "Devnet"}
          onGroup={onGroup}
        />
      </div>
    </div>
  );
}
