import { jsonBody, requireDeployment, v1 } from "@/lib/server/api";
import { enclave } from "@/lib/server/enclave/grader";

/** Gets a hardware report and has the attestation authority write (or renew) the grader record. */
export async function POST(req: Request) {
  return v1(async () => {
    requireDeployment();
    const { force } = await jsonBody<{ force?: boolean }>(req);
    return (await enclave()).ensureRegistered(!!force);
  });
}
