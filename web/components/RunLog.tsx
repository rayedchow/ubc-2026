import Image from "next/image";
import { Cpu, Ticket, Vault } from "lucide-react";
import { Button } from "./ui/button";
import { PixelArrow } from "./ui/pixel-arrow";
import { int } from "@/lib/client";
import { coins, eventLabels, laneFor, type MonitorEvent } from "@/lib/run-monitor";

const clock = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
export function RunLog({
  events,
  reported,
  onGroup,
  showWorker = false,
}: {
  events: MonitorEvent[];
  reported: boolean;
  onGroup?: (group: string) => void;
  showWorker?: boolean;
}) {
  if (!events.length) return <p className="log-empty">No events reported.</p>;
  return (
    <ol className="run-log">
      {events.map((e) => {
        const lane = laneFor(e.kind);
        const detail = [
          showWorker && e.worker,
          e.reps !== undefined && int(e.reps) + " reps",
          e.reward !== undefined && "Score " + e.reward.toFixed(2),
          e.amount !== undefined && coins(e.amount),
          e.latencyMs !== undefined && int(e.latencyMs) + " ms",
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <li key={e.seq}>
            <time dateTime={new Date(e.at).toISOString()}>{clock.format(e.at)}</time>
            <span className="log-symbol" title={lane} aria-hidden="true">
              {lane === "Solana" ? (
                <Image src="/providers/solana.svg" width={15} height={13} alt="" unoptimized />
              ) : e.kind === "voucher" ? (
                <Ticket />
              ) : lane === "Trainer GPUs" ? (
                <Cpu />
              ) : (
                <Vault />
              )}
            </span>
            <div className="log-message">
              <strong>{eventLabels[e.kind]}</strong>
              {detail && <small>{detail}</small>}
            </div>
            {(e.group || (reported && e.signature && lane === "Solana")) && (
              <div className="log-links">
                {e.group &&
                  (onGroup ? (
                    <Button
                      variant="link"
                      className="log-trace-link"
                      title={"Replay " + e.group}
                      onClick={() => onGroup(e.group!)}
                    >
                      <span>{e.group}</span>
                      <PixelArrow size={12} />
                    </Button>
                  ) : (
                    <span>{e.group}</span>
                  ))}
                {reported && e.signature && lane === "Solana" && (
                  <a
                    target="_blank"
                    rel="noreferrer"
                    href={"https://explorer.solana.com/tx/" + e.signature + "?cluster=devnet"}
                  >
                    Devnet receipt <PixelArrow direction="external" size={11} />
                  </a>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
