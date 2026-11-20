/**
 * Links a Solana wallet to a trainer handle.
 *
 * A wallet proves it is the caller by signing a one-time message; nothing is
 * sent onchain and no funds move. Links are kept in
 * `.modelmon/wallet-links.json`. One wallet maps to one trainer, and a trainer
 * handle can be claimed by only one wallet.
 */

import { randomBytes } from "node:crypto";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { ServiceError } from "../service";
import { readJson, statePath, writeJson } from "./files";

type Link = { trainer: string; linkedAt: string };
type Links = Record<string, Link>;

const FILE = () => statePath("wallet-links.json");
const HANDLE = /^[a-z0-9][a-z0-9._-]{0,31}$/;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** Pending challenges, by wallet address. In memory: they are short-lived by design. */
const g = globalThis as unknown as { __modelmon_wallet_challenges?: Map<string, { message: string; expires: number }> };
const challenges = (g.__modelmon_wallet_challenges ??= new Map());

/** Returns the wallet's 32-byte public key, or throws if the address is not a valid one. */
function publicKeyOf(address: unknown): Uint8Array {
  if (typeof address !== "string" || address.length < 32 || address.length > 44) {
    throw new ServiceError(400, "Send a Solana wallet address.");
  }
  let bytes: Uint8Array;
  try {
    bytes = bs58.decode(address);
  } catch {
    throw new ServiceError(400, "That is not a valid Solana wallet address.");
  }
  if (bytes.length !== 32) throw new ServiceError(400, "That is not a valid Solana wallet address.");
  return bytes;
}

/** Who this wallet is linked to, if anyone. */
export function linkedTrainer(address: string): { address: string; trainer: string | null } {
  publicKeyOf(address);
  return { address, trainer: readJson<Links>(FILE(), {})[address]?.trainer ?? null };
}

/** Step 1: a fresh message for the wallet to sign. */
export function createChallenge(input: { address?: unknown }): { message: string } {
  publicKeyOf(input.address);
  const address = input.address as string;
  const message = [
    "Modélmon: link this wallet to your trainer.",
    `Wallet: ${address}`,
    `Nonce: ${randomBytes(16).toString("hex")}`,
    "Signing this proves the wallet is yours. It does not move funds.",
  ].join("\n");
  challenges.set(address, { message, expires: Date.now() + CHALLENGE_TTL_MS });
  return { message };
}

/** Step 2: check the signature over that message, then record the link. */
export function linkWallet(input: { address?: unknown; signature?: unknown; trainer?: unknown }): { address: string; trainer: string } {
  const key = publicKeyOf(input.address);
  const address = input.address as string;
  const trainer = typeof input.trainer === "string" ? input.trainer.trim().toLowerCase() : "";
  if (!HANDLE.test(trainer)) {
    throw new ServiceError(400, "Use a trainer handle of 1–32 letters, digits, periods, dashes or underscores.");
  }

  const pending = challenges.get(address);
  // A challenge works once, whether or not the signature turns out to be good.
  challenges.delete(address);
  if (!pending || pending.expires < Date.now()) {
    throw new ServiceError(409, "That sign-in request expired. Connect the wallet again.");
  }

  let signature: Uint8Array;
  try {
    signature = bs58.decode(typeof input.signature === "string" ? input.signature : "");
  } catch {
    throw new ServiceError(400, "The signature could not be read.");
  }
  if (signature.length !== 64 || !nacl.sign.detached.verify(new TextEncoder().encode(pending.message), signature, key)) {
    throw new ServiceError(401, "The signature does not match this wallet.");
  }

  const links = readJson<Links>(FILE(), {});
  const owner = Object.entries(links).find(([, link]) => link.trainer === trainer)?.[0];
  if (owner && owner !== address) {
    throw new ServiceError(409, `Trainer “${trainer}” is already linked to another wallet.`);
  }
  links[address] = { trainer, linkedAt: new Date().toISOString() };
  writeJson(FILE(), links);
  return { address, trainer };
}
