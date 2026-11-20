/** Helpers for the /api/v1 route handlers (the programmatic API). Server-only. */

import { maybeDeployment } from "./solana";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function v1<T>(work: () => T | Promise<T>, okStatus = 200): Promise<Response> {
  try {
    const out = await work();
    if (out instanceof Response) return out;
    return Response.json(out, { status: okStatus });
  } catch (err) {
    if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
    console.error(err);
    return Response.json({ error: (err as Error).message ?? "Server error" }, { status: 500 });
  }
}

export function requireDeployment() {
  const d = maybeDeployment();
  if (!d) throw new HttpError(503, "Devnet is not set up yet. Run `pnpm devnet:setup` with the server running.");
  return d;
}

export async function jsonBody<T = Record<string, unknown>>(req: Request): Promise<T> {
  return (await req.json().catch(() => ({}))) as T;
}
