/**
 * x402 for grading calls.
 *
 * Uses x402's HTTP envelope (402 Payment Required with `accepts`, an
 * `X-PAYMENT` request header, an `X-PAYMENT-RESPONSE` response header) with a
 * payment-channel scheme: the payload is a voucher, the trainer's signed
 * running total for an open channel, instead of a per-call onchain transfer.
 * The scheme name "modelmon-channel" is ours; it is not one of x402's standard
 * schemes. Clients without a channel get a 402 telling them how to open one.
 */

import bs58 from "bs58";

export const X402_VERSION = 1;
export const SCHEME = "modelmon-channel";
export const NETWORK = "solana-devnet";

export type PaymentRequirements = {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  asset: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
};

export type ChannelPayment = { channel: string; cumulative: string; signature: string };

export function paymentRequired(error: string, req: PaymentRequirements): Response {
  return Response.json({ x402Version: X402_VERSION, error, accepts: [req] }, { status: 402 });
}

export function parsePaymentHeader(header: string | null): ChannelPayment | { error: string } | null {
  if (!header) return null;
  try {
    const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    if (decoded.x402Version !== X402_VERSION) return { error: `Unsupported x402Version ${decoded.x402Version}` };
    if (decoded.scheme !== SCHEME) return { error: `Unsupported scheme ${decoded.scheme}; use ${SCHEME}` };
    if (decoded.network !== NETWORK) return { error: `Unsupported network ${decoded.network}; use ${NETWORK}` };
    const p = decoded.payload ?? {};
    if (typeof p.channel !== "string" || typeof p.cumulative !== "string" || typeof p.signature !== "string") {
      return { error: "payload needs channel, cumulative (string, USDC base units) and signature (base58)" };
    }
    bs58.decode(p.signature);
    BigInt(p.cumulative);
    return { channel: p.channel, cumulative: p.cumulative, signature: p.signature };
  } catch {
    return { error: "X-PAYMENT is not base64-encoded JSON" };
  }
}

export function encodePaymentHeader(p: ChannelPayment): string {
  return Buffer.from(JSON.stringify({ x402Version: X402_VERSION, scheme: SCHEME, network: NETWORK, payload: p })).toString("base64");
}

export function encodePaymentResponse(r: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify({ x402Version: X402_VERSION, network: NETWORK, ...r })).toString("base64");
}
