import { jsonBody, requireDeployment, v1 } from "@/lib/server/api";
import { enclave, type GradeRequest } from "@/lib/server/enclave/grader";
import { emit } from "@/lib/server/events";
import { parsePaymentHeader, paymentRequired } from "@/lib/server/x402";

/**
 * POST /api/v1/gyms/{id}/grade, x402-gated.
 * Without X-PAYMENT: 402 with payment requirements (open a channel, then sign vouchers).
 * With X-PAYMENT: a voucher covering everything graded so far plus this call.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return v1(async () => {
    requireDeployment();
    const e = await enclave();
    const body = await jsonBody<GradeRequest>(req);
    const n = Array.isArray(body.rollouts) ? body.rollouts.length : 1;
    const payment = parsePaymentHeader(req.headers.get("x-payment"));
    if (!payment || "error" in payment) {
      const reqs = await e.requirements(id, req.url, n);
      if (!payment) emit({ lane: "enclave", kind: "x402.challenge", text: `402 Payment Required for ${n} rollouts at ${id}` });
      return paymentRequired(payment ? payment.error : "Payment required: open a payment channel and send a signed voucher in X-PAYMENT.", reqs);
    }
    const out = await e.grade(id, body, payment, req.url);
    return Response.json(out.body, { status: out.status, headers: out.headers });
  });
}
