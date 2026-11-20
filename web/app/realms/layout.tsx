import type { ReactNode } from "react";
import "./realms.css";

export default function RealmLayout({ children }: { children: ReactNode }) {
  return <div className="field-guide">{children}</div>;
}
