import { NextResponse } from "next/server";
import { identify } from "@/lib/integration-auth";
export async function POST(req: Request) {
  const key = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  const trainer = identify(key ?? null, "viewerKey");
  if (!trainer || !key)
    return NextResponse.json({ error: "The viewer key was not recognized." }, { status: 401 });
  const res = NextResponse.json({ trainer });
  res.cookies.set("monitor_view", key, {
    httpOnly: true,
    sameSite: "strict",
    secure: new URL(req.url).protocol === "https:",
    path: "/api/monitor",
    maxAge: 3600,
  });
  return res;
}
export function DELETE() {
  const res = NextResponse.json({ disconnected: true });
  res.cookies.set("monitor_view", "", { path: "/api/monitor", maxAge: 0 });
  return res;
}
