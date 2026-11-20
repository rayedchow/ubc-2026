import { HttpError, v1 } from "@/lib/server/api";
import { enclave } from "@/lib/server/enclave/grader";

/** The training set's public half: prompts, addresses, starting balances. Held-out tasks never appear. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return v1(async () => {
    const e = await enclave();
    const version = e.graderVersion(id);
    if (!version) throw new HttpError(404, `Gym ${id} is not sealed in this grader.`);
    return { gym_id: id, grader_version: `sha256:${version}`, tasks: e.trainTasks(id) };
  });
}
