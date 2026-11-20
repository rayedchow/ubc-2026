/** Small JSON-on-disk helpers for local state under `.modelmon/`. Server-only. */

import fs from "node:fs";
import path from "node:path";
import { Keypair } from "@solana/web3.js";
import { STATE_DIR } from "./env";

export function statePath(...parts: string[]): string {
  return path.join(STATE_DIR, ...parts);
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(file: string, value: unknown, mode = 0o600) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2), { mode });
  fs.renameSync(tmp, file);
}

export function loadKeypair(file: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8"))));
}

/** Loads a keypair from `.modelmon/wallets/<name>.json`, creating it if missing. */
export function walletKeypair(name: string): Keypair {
  const file = statePath("wallets", `${name}.json`);
  if (fs.existsSync(file)) return loadKeypair(file);
  const kp = Keypair.generate();
  writeJson(file, Array.from(kp.secretKey));
  return kp;
}

export function hasWallet(name: string): boolean {
  return fs.existsSync(statePath("wallets", `${name}.json`));
}
