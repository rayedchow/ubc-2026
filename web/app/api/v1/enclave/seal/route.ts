import { HttpError, jsonBody, v1 } from "@/lib/server/api";
import { enclave, type SealEnvelope } from "@/lib/server/enclave/grader";

/** Accepts a Gym bundle encrypted to the grader's key. Only the grader can open it. */
export async function POST(req: Request) {
  return v1(async () => {
    const env = await jsonBody<SealEnvelope>(req);
    try {
      return (await enclave()).seal(env);
    } catch (err) {
      throw new HttpError(400, (err as Error).message);
    }
  });
}
