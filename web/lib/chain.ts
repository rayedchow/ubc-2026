/**
 * The seam where Solana goes.
 *
 * Everything the app needs from the chain is behind this interface. Today it
 * is a mock that invents transaction signatures. To go live, write a second
 * implementation (payment-channel program, x402 vouchers, Solana Attestation
 * Service) and change the one export at the bottom. Nothing else in the app
 * talks to a chain.
 */

export type Split = { leader: number; contributors: number; platform: number };

export interface Chain {
  /** Creates a payment-channel vault for one model. */
  createVault(input: { modelId: string }): Promise<{ vault: string }>;
  /** Trainer deposits USDC into a model's vault. What is in the vault is the hard spending cap. */
  deposit(input: { vault: string; amount: number }): Promise<{ tx: string }>;
  /** One transaction pays every party for a finished run out of the vault. */
  settle(input: { vault: string; amount: number; split: Split }): Promise<{ tx: string }>;
  /** Publishes a signed sealed-test or improvement record. */
  attest(input: { kind: "badge" | "improvement"; key?: string; payload: unknown }): Promise<{ tx: string }>;
  /** Whether a licence lets this trainer use the Gym right now. */
  canTrain(input: { gymId: string; exclusiveUntil?: string }): Promise<boolean>;
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function fakeSignature(seed: string): string {
  let h = 2166136261;
  let out = "";
  for (let i = 0; i < 44; i++) {
    for (const ch of seed + i) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    out += BASE58[Math.abs(h) % BASE58.length];
  }
  return out;
}

let counter = 0;
const next = (label: string) => fakeSignature(`${label}:${Date.now()}:${counter++}`);

/** A made-up address that looks like a Solana one. Stable for a given seed. */
export const fakeAddress = (seed: string) => fakeSignature(`address:${seed}`);

export const mockChain: Chain = {
  async createVault({ modelId }) {
    return { vault: fakeAddress(`vault:${modelId}:${counter++}`) };
  },
  async deposit({ vault }) {
    return { tx: next(`deposit:${vault}`) };
  },
  async settle({ vault }) {
    return { tx: next(`settle:${vault}`) };
  },
  async attest({ kind, key }) {
    return { tx: key ? fakeSignature(`attest:${kind}:${key}`) : next(`attest:${kind}`) };
  },
  async canTrain({ exclusiveUntil }) {
    // The demo trainer never holds an exclusive licence.
    return !exclusiveUntil || new Date(exclusiveUntil).getTime() < Date.now();
  },
};

export const chain: Chain = mockChain;

/** Royalty split applied at settlement. */
export const SPLIT: Split = { leader: 0.7, contributors: 0.2, platform: 0.1 };
