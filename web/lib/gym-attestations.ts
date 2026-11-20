import "server-only";
import { demoGymAttestations, requireAtlasGym } from "./atlas-registry";
import type { GymAttestations } from "./gym-data";
import { ServiceError } from "./service";

const program = "22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG";
const publicKey = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Each configured gym has a dedicated SAS schema on the configured cluster. */
export async function gymAttestations(id: string): Promise<GymAttestations> {
  requireAtlasGym(id);
  const schemas = JSON.parse(process.env.MODELMON_SOLANA_GYM_SCHEMAS || "{}") as Record<string, string>;
  const schema = Object.hasOwn(schemas, id) ? schemas[id] : undefined;
  if (schema === undefined) return demoGymAttestations(id);
  const network = process.env.MODELMON_SOLANA_CLUSTER || "devnet";
  if (!publicKey.test(schema) || (network !== "devnet" && network !== "mainnet-beta"))
    throw new ServiceError(503, "Check the gym’s Solana schema and cluster configuration.");
  try {
    const res = await fetch(process.env.MODELMON_SOLANA_RPC_URL || `https://api.${network}.solana.com`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getProgramAccounts",
        params: [
          program,
          {
            commitment: "finalized",
            encoding: "base64",
            dataSlice: { offset: 0, length: 0 },
            // SAS stores the one-byte attestation discriminator (2), nonce, credential, then schema.
            filters: [{ memcmp: { offset: 0, bytes: "3" } }, { memcmp: { offset: 65, bytes: schema } }],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error();
    const body = await res.json();
    if (!Array.isArray(body.result) || body.result.some((r: { pubkey: string }) => !publicKey.test(r.pubkey)))
      throw new Error();
    const addresses: string[] = body.result.map((r: { pubkey: string }) => r.pubkey);
    return { network, schema, records: addresses.sort().map((address) => ({ address })) };
  } catch {
    throw new ServiceError(503, "Solana could not return this gym’s attestations. Try again shortly.");
  }
}
