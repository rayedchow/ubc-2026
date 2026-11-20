import { createHash } from "node:crypto";
import { atlasDatabase } from "@/lib/atlas-registry";
import { limitedBody, requireKey } from "@/lib/integration-auth";
import { ServiceError } from "@/lib/service";
import { respond } from "@/lib/http";

// MMG1 + recipient's 32-byte key + a libsodium sealed box. The web host never opens the package.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const creator = requireKey(req, "creatorKey"),
      { id } = await params;
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id)) throw new ServiceError(400, "Invalid gym ID.");
    if (req.headers.get("content-type") !== "application/octet-stream")
      throw new ServiceError(415, "Send an encrypted Gym package.");
    const body = await limitedBody(req, 16 * 1024 * 1024);
    if (body.length <= 84 || body.toString("ascii", 0, 4) !== "MMG1")
      throw new ServiceError(400, "Invalid encrypted Gym package.");
    const digest = createHash("sha256").update(body).digest("hex");
    const db = atlasDatabase();
    db.exec(
      "CREATE TABLE IF NOT EXISTS sealed_packages(creator TEXT,gym TEXT,digest TEXT,box BLOB,PRIMARY KEY(creator,gym,digest))",
    );
    db.prepare("INSERT OR IGNORE INTO sealed_packages VALUES(?,?,?,?)").run(creator, id, digest, body);
    return { gym: id, creator, digest: "sha256:" + digest, status: "Awaiting grader import" };
  }, 201);
}
