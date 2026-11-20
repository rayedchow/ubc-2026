import type { ReactNode } from "react";
import { OpenWater } from "@/components/OpenWater";
import "./runs.css";

export default function RunsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="runs-scene">
      <OpenWater />
      {children}
    </div>
  );
}
