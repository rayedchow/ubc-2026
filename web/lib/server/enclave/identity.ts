/**
 * The grader's identity: its signing key (the "stamp"), its encryption key
 * (what creators lock Gym bundles to), the fingerprint of its code, and a
 * hardware report binding all three to a recent Solana slot.
 *
 * Two providers:
 * - "dstack": inside a Phala/dstack confidential VM (Intel TDX). Keys are
 *   derived by dstack's KMS from the app's identity, so a restarted or
 *   replicated grader running the same code gets the same keys, and changed
 *   code gets different ones. The code hash is the app's compose hash, and the
 *   report is a real TDX quote over sha256(signKey || encKey || slot).
 * - "dev": no TEE. Keys live in `.modelmon/enclave/<name>.json` and the code
 *   hash is sha256 over the grader's own source files. There is no hardware
 *   report; the program only accepts this when the config allows unattested
 *   graders (devnet). Every screen and record says so.
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import { env } from "../env";
import { readJson, statePath, writeJson } from "../files";

export type Hardware = "none" | "tdx";

export type Identity = {
  name: string;
  sign: Keypair;
  enc: nacl.BoxKeyPair;
  codeHash: string;
  hardware: Hardware;
  /** Grading behaviour switch for the tamper demo. Part of the code hash. */
  tamper: "none" | "inflate";
};

export type HardwareReport = {
  hardware: Hardware;
  reportSlot: number;
  /** Hex TDX quote, when running in a TEE. */
  quote?: string;
  /** What the quote's report_data must start with: sha256(signKey || encKey || slot LE). */
  reportData: string;
};

/** Files that make up the grader. In dev mode their hash is the code fingerprint. */
const GRADER_SOURCES = ["lib/server/enclave", "lib/server/gyms", "lib/server/voucher.ts", "lib/server/x402.ts"];

export function devCodeHash(tamper: Identity["tamper"]): string {
  const h = createHash("sha256");
  const files: string[] = [];
  for (const entry of GRADER_SOURCES) {
    const full = path.resolve(process.cwd(), entry);
    if (fs.statSync(full).isDirectory()) {
      for (const f of fs.readdirSync(full).sort()) if (f.endsWith(".ts")) files.push(path.join(entry, f));
    } else files.push(entry);
  }
  for (const f of files) {
    h.update(f);
    h.update(fs.readFileSync(path.resolve(process.cwd(), f)));
  }
  // The tamper switch changes grading, so it changes the fingerprint, exactly as an edited build would.
  h.update(`tamper:${tamper}`);
  return h.digest("hex");
}

async function dstackIdentity(name: string, tamper: Identity["tamper"]): Promise<Identity> {
  const { DstackClient } = await import("@phala/dstack-sdk");
  const client = new DstackClient();
  const signKey = await client.getKey(`modelmon/${name}/sign`, "v1", "ed25519");
  const encKey = await client.getKey(`modelmon/${name}/enc`, "v1");
  const info = await client.info();
  return {
    name,
    sign: Keypair.fromSeed(Uint8Array.from(signKey.key).slice(0, 32)),
    enc: nacl.box.keyPair.fromSecretKey(createHash("sha256").update(Uint8Array.from(encKey.key)).digest()),
    codeHash: String(info.compose_hash).replace(/^0x/, ""),
    hardware: "tdx",
    tamper,
  };
}

function devIdentity(name: string, tamper: Identity["tamper"]): Identity {
  const file = statePath("enclave", `${name}.json`);
  let stored = readJson<{ signSeed: number[]; encSecret: number[] } | null>(file, null);
  if (!stored) {
    stored = { signSeed: Array.from(nacl.randomBytes(32)), encSecret: Array.from(nacl.randomBytes(32)) };
    writeJson(file, stored);
  }
  return {
    name,
    sign: Keypair.fromSeed(Uint8Array.from(stored.signSeed)),
    enc: nacl.box.keyPair.fromSecretKey(Uint8Array.from(stored.encSecret)),
    codeHash: devCodeHash(tamper),
    hardware: "none",
    tamper,
  };
}

export async function loadIdentity(name = "grader", tamper: Identity["tamper"] = "none"): Promise<Identity> {
  return env.tee === "dstack" ? dstackIdentity(name, tamper) : devIdentity(name, tamper);
}

export function reportData(id: Identity, slot: number): Buffer {
  const s = Buffer.alloc(8);
  s.writeBigUInt64LE(BigInt(slot));
  return createHash("sha256").update(id.sign.publicKey.toBuffer()).update(id.enc.publicKey).update(s).digest();
}

/** Asks the hardware for a signed report tying our keys to a recent slot. */
export async function hardwareReport(id: Identity, slot: number): Promise<HardwareReport> {
  const data = reportData(id, slot);
  if (id.hardware === "none") return { hardware: "none", reportSlot: slot, reportData: data.toString("hex") };
  const { DstackClient } = await import("@phala/dstack-sdk");
  const quote = await new DstackClient().getQuote(data);
  return { hardware: "tdx", reportSlot: slot, quote: quote.quote, reportData: data.toString("hex") };
}

/** Key used to encrypt the enclave's own storage (sealed Gym bundles at rest). */
export function storageKey(id: Identity): Uint8Array {
  return createHash("sha256").update(id.enc.secretKey).update("modelmon:storage:v1").digest();
}
