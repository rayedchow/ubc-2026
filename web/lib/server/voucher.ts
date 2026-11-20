/**
 * Payment-channel vouchers: the trainer's signed running total.
 *
 * Message = "modelmon:voucher:v1" || channel (32 bytes) || cumulative (u64 LE),
 * signed with the trainer's ed25519 wallet key. The onchain `settle`
 * instruction checks exactly this message through the Ed25519 precompile, so
 * a voucher the grader accepts is a voucher Solana will honour.
 */

import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

export const VOUCHER_DOMAIN = new TextEncoder().encode("modelmon:voucher:v1");

export function voucherMessage(channel: PublicKey, cumulative: bigint): Uint8Array {
  const amount = new Uint8Array(8);
  new DataView(amount.buffer).setBigUint64(0, cumulative, true);
  const out = new Uint8Array(VOUCHER_DOMAIN.length + 32 + 8);
  out.set(VOUCHER_DOMAIN, 0);
  out.set(channel.toBytes(), VOUCHER_DOMAIN.length);
  out.set(amount, VOUCHER_DOMAIN.length + 32);
  return out;
}

export function signVoucher(secretKey: Uint8Array, channel: PublicKey, cumulative: bigint): string {
  return bs58.encode(nacl.sign.detached(voucherMessage(channel, cumulative), secretKey));
}

export function verifyVoucher(trainer: PublicKey, channel: PublicKey, cumulative: bigint, signature: string): boolean {
  try {
    return nacl.sign.detached.verify(voucherMessage(channel, cumulative), bs58.decode(signature), trainer.toBytes());
  } catch {
    return false;
  }
}
