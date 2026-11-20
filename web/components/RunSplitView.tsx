import type { ReactNode } from "react";
import { PixelScrollBox } from "./ui/pixel-scroll-box";

export function RunSplitView({
  label,
  detailLabel,
  children,
  logTitle,
  log,
  logKey = logTitle,
}: {
  label: string;
  detailLabel: string;
  children: ReactNode;
  logTitle: string;
  log: ReactNode;
  logKey?: string;
}) {
  return (
    <div className="run-detail-scroll run-split" role="region" aria-label={label}>
      <PixelScrollBox className="run-split-main" label={detailLabel} type="auto">
        {children}
      </PixelScrollBox>
      <section className="run-split-log">
        <h2>{logTitle}</h2>
        <PixelScrollBox key={logKey} label={logTitle}>
          {log}
        </PixelScrollBox>
      </section>
    </div>
  );
}
