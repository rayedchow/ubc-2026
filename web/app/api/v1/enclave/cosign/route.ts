import { HttpError, jsonBody, v1 } from "@/lib/server/api";
import { enclave } from "@/lib/server/enclave/grader";

/** The grader co-signs create_gym only for a Gym it holds, at the version it holds. */
export async function POST(req: Request) {
  return v1(async () => {
    const { transaction } = await jsonBody<{ transaction?: string }>(req);
    if (!transaction) throw new HttpError(400, "Send { transaction: base64 }.");
    try {
      return { transaction: await (await enclave()).cosignCreateGym(transaction) };
    } catch (err) {
      throw new HttpError(400, (err as Error).message);
    }
  });
}
