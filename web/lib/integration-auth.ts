import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { ServiceError } from "./service";

type Access = "trainerKey" | "viewerKey" | "creatorKey";
type Account = Partial<Record<Access, string>>;
function accounts(): Record<string, Account> {
  return JSON.parse(process.env.MODELMON_CONNECTIONS || "{}");
}
export const viewerConfigured = () => Object.values(accounts()).some((a) => !!a.viewerKey);
const digest = (s: string) => createHash("sha256").update(s).digest();

export function identify(key: string | null, role: Access) {
  if (!key || key.length > 1024) return null;
  for (const [trainer, keys] of Object.entries(accounts())) {
    if (keys[role] && timingSafeEqual(digest(key), digest(keys[role]))) return trainer;
  }
  return null;
}
export function requireKey(request: Request, role: Access) {
  const trainer = identify(request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1] ?? null, role);
  if (!trainer) throw new ServiceError(401, "A valid integration key is required.");
  return trainer;
}
export async function limitedBody(req: Request, limit: number) {
  const reader = req.body?.getReader();
  if (!reader) throw new ServiceError(400, "Request body required.");
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ServiceError(413, "Request exceeds the size limit.");
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(parts);
}
export async function limitedJson(req: Request) {
  const buf = await limitedBody(req, 512 * 1024);
  try {
    return JSON.parse(buf.toString("utf8")) as unknown;
  } catch {
    throw new ServiceError(400, "Invalid JSON.");
  }
}
