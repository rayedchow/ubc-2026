/**
 * Solana devnet client for the Modélmon program. Server-only.
 *
 * Holds the connection, the Anchor program, PDA helpers and the deployment
 * record (`.modelmon/devnet.json`) that `scripts/setup-devnet.ts` writes.
 */

import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SendTransactionError,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { env } from "./env";
import { loadKeypair, readJson, statePath, writeJson } from "./files";
import idl from "./idl/modelmon.json";
import type { Modelmon } from "./idl/modelmon";

export { BN };

export type Deployment = {
  programId: string;
  mint: string;
  treasury: string;
  admin: string;
  gyms: Record<string, { address: string; leader: string; contributor: string; graderVersion: string }>;
};

const DEPLOYMENT_FILE = () => statePath("devnet.json");

export function deployment(): Deployment {
  const d = readJson<Deployment | null>(DEPLOYMENT_FILE(), null);
  if (!d) throw new Error("Devnet is not set up yet. Run `pnpm devnet:setup` first.");
  return d;
}

export function maybeDeployment(): Deployment | null {
  return readJson<Deployment | null>(DEPLOYMENT_FILE(), null);
}

export function saveDeployment(d: Deployment) {
  writeJson(DEPLOYMENT_FILE(), d, 0o644);
}

type Cache = { connection?: Connection; admin?: Keypair };
const g = globalThis as unknown as { __modelmon_sol?: Cache };
const cache: Cache = (g.__modelmon_sol ??= {});

export function connection(): Connection {
  return (cache.connection ??= new Connection(env.rpcUrl, "confirmed"));
}

export function admin(): Keypair {
  return (cache.admin ??= loadKeypair(env.adminKeypairPath));
}

export const programId = () => new PublicKey(env.programId);

/** An Anchor program bound to a signer (defaults to the admin). */
export function program(signer: Keypair = admin()): Program<Modelmon> {
  const provider = new AnchorProvider(connection(), new Wallet(signer), { commitment: "confirmed" });
  return new Program<Modelmon>({ ...(idl as Modelmon), address: env.programId }, provider);
}

/* ---------- PDAs ---------- */

const pda = (...seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds.map((s) => Buffer.from(s)), programId())[0];

export const configPda = () => pda(Buffer.from("config"));
export const graderPda = (grader: PublicKey) => pda(Buffer.from("grader"), grader.toBuffer());
export const gymPda = (gymId: string) => pda(Buffer.from("gym"), Buffer.from(gymId));
export function channelPda(gym: PublicKey, trainer: PublicKey, nonce: bigint) {
  const n = Buffer.alloc(8);
  n.writeBigUInt64LE(nonce);
  return pda(Buffer.from("channel"), gym.toBuffer(), trainer.toBuffer(), n);
}
export const vaultPda = (channel: PublicKey) => pda(Buffer.from("vault"), channel.toBuffer());
export const resultPda = (gym: PublicKey, runId: Uint8Array) => pda(Buffer.from("result"), gym.toBuffer(), runId);

export const ata = (owner: PublicKey, mint: PublicKey) => getAssociatedTokenAddressSync(mint, owner, true);

/* ---------- Sending ---------- */

export type Sent = { ok: true; signature: string } | { ok: false; signature?: string; error: string; logs?: string[] };

/**
 * Sends a transaction. With `landFailures`, preflight is skipped so a failing
 * transaction still lands onchain (and shows up on Explorer with its error),
 * which is how the demo shows Solana refusing an unverified grader.
 */
export async function send(
  ixs: TransactionInstruction[],
  signers: Keypair[],
  opts: { landFailures?: boolean; feePayer?: Keypair } = {},
): Promise<Sent> {
  const conn = connection();
  const feePayer = opts.feePayer ?? signers[0];
  const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 }), ...ixs);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = feePayer.publicKey;
  const unique = [feePayer, ...signers.filter((s) => !s.publicKey.equals(feePayer.publicKey))];
  tx.sign(...unique);
  let signature: string | undefined;
  try {
    signature = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: !!opts.landFailures, maxRetries: 5 });
    const res = await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    if (res.value.err) {
      const info = await conn.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      const logs = info?.meta?.logMessages ?? [];
      return { ok: false, signature, error: programError(logs) ?? customError(res.value.err) ?? JSON.stringify(res.value.err), logs };
    }
    return { ok: true, signature };
  } catch (err) {
    const logs = err instanceof SendTransactionError ? (err.logs ?? []) : [];
    return { ok: false, signature, error: programError(logs) ?? (err as Error).message, logs };
  }
}

/** Pulls "Error Code: X. Error Message: Y" out of Anchor logs. */
export function programError(logs: string[]): string | undefined {
  for (const line of logs) {
    const m = line.match(/Error Code: (\w+)\. Error Number: \d+\. Error Message: (.+?)\.?$/);
    if (m) return `${m[1]}: ${m[2]}`;
  }
  return undefined;
}

/** Maps {"InstructionError":[i,{"Custom":6000}]} to the program's named error from the IDL. */
function customError(err: unknown): string | undefined {
  const code = (err as { InstructionError?: [number, { Custom?: number }] })?.InstructionError?.[1]?.Custom;
  const e = (idl as { errors?: { code: number; name: string; msg: string }[] }).errors?.find((x) => x.code === code);
  return e ? `${e.name}: ${e.msg}` : undefined;
}

export async function mustSend(ixs: TransactionInstruction[], signers: Keypair[], what: string): Promise<string> {
  const r = await send(ixs, signers);
  if (!r.ok) throw new Error(`${what} failed: ${r.error}${r.signature ? ` (tx ${r.signature})` : ""}`);
  return r.signature;
}

export const hex = (b: Uint8Array | number[]) => Buffer.from(b).toString("hex");
export const bytes32 = (h: string) => {
  const b = Buffer.from(h.replace(/^0x/, ""), "hex");
  if (b.length !== 32) throw new Error(`Expected 32 bytes of hex, got ${b.length}`);
  return Array.from(b);
};
