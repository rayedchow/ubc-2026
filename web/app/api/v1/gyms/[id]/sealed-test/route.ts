import { HttpError, jsonBody, requireDeployment, v1 } from "@/lib/server/api";
import { enclave, newRunId } from "@/lib/server/enclave/grader";
import { openAiCompatiblePolicy, scriptedPolicy, type Policy } from "@/lib/server/policy";

type PolicySpec =
  | { type: "scripted"; skill: number }
  | { type: "openai"; baseUrl: string; model: string; apiKey?: string; weightsHash?: string };

function toPolicy(p?: PolicySpec): Policy {
  if (!p) throw new HttpError(400, "Send { policy: { type: 'scripted', skill } | { type: 'openai', baseUrl, model } }.");
  if (p.type === "scripted") return scriptedPolicy(Number(p.skill));
  if (p.type === "openai") return openAiCompatiblePolicy(p);
  throw new HttpError(400, "Unknown policy type.");
}

/**
 * Runs the held-out tasks inside the grader and returns one score.
 * With `baseline`, also scores the before-model and, with `record: true`,
 * writes an improvement record onchain signed by the verified grader.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return v1(async () => {
    requireDeployment();
    const body = await jsonBody<{ policy?: PolicySpec; baseline?: PolicySpec; record?: boolean; reps?: number; cost?: string }>(req);
    const e = await enclave();
    const after = await e.sealedTest(id, toPolicy(body.policy));
    const before = body.baseline ? await e.sealedTest(id, toPolicy(body.baseline)) : null;
    let record = null;
    if (body.record) {
      record = await e.recordResult({
        gymId: id,
        runId: newRunId(),
        kind: before ? "evolution" : "badge",
        modelBefore: before?.policyId ?? after.policyId,
        modelAfter: after.policyId,
        before: before?.score ?? after.score,
        after: after.score,
        ci: after.ci,
        n: after.n,
        reps: Number(body.reps ?? 0),
        cost: BigInt(body.cost ?? "0"),
      });
    }
    return { before, after, record };
  });
}
