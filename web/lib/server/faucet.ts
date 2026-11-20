/**
 * Devnet faucet for the demo's test USDC.
 *
 * The demo uses its own 6-decimal test token ("dUSDC"), minted by the admin,
 * so runs don't depend on Circle's devnet faucet. Swap the mint in
 * `.modelmon/devnet.json` for Circle's devnet USDC to use the real thing.
 */

import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction } from "@solana/spl-token";
import { emit } from "./events";
import { admin, ata, connection, deployment, mustSend } from "./solana";

export async function fundWallet(owner: PublicKey, opts: { sol?: number; usdc?: number }) {
  const d = deployment();
  const mint = new PublicKey(d.mint);
  const a = admin();
  const ixs = [];
  if (opts.sol) {
    const have = await connection().getBalance(owner, "confirmed");
    const want = Math.round(opts.sol * LAMPORTS_PER_SOL);
    if (have < want) ixs.push(SystemProgram.transfer({ fromPubkey: a.publicKey, toPubkey: owner, lamports: want - have }));
  }
  const tokenAcct = ata(owner, mint);
  ixs.push(createAssociatedTokenAccountIdempotentInstruction(a.publicKey, tokenAcct, owner, mint));
  if (opts.usdc) ixs.push(createMintToInstruction(mint, tokenAcct, a.publicKey, BigInt(Math.round(opts.usdc * 1e6))));
  const sig = await mustSend(ixs, [a], "fund wallet");
  if (opts.usdc) {
    emit({ lane: "solana", kind: "faucet", ok: true, tx: sig, text: `Faucet: minted $${opts.usdc.toFixed(2)} test USDC to ${owner.toBase58().slice(0, 6)}…` });
  }
  return sig;
}

export async function usdcBalance(owner: PublicKey): Promise<number> {
  const d = deployment();
  try {
    const bal = await connection().getTokenAccountBalance(ata(owner, new PublicKey(d.mint)), "confirmed");
    return Number(bal.value.amount) / 1e6;
  } catch {
    return 0;
  }
}
