/**
 * Configuration for the real (devnet) backend. Server-only.
 *
 * Reads the repo-root `.env` (HELIUS_RPC_URL, a devnet URL) when the
 * variables are not already set, so the Next server and the scripts in
 * `scripts/` see the same values. Deployment results (mint, program, Gym
 * accounts) live in `.modelmon/devnet.json`, written by `scripts/setup-devnet.ts`.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function loadRootEnv() {
  for (const file of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "..", ".env")]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const value = m[2].replace(/^["']|["']$/g, "");
      if (process.env[m[1]] === undefined) process.env[m[1]] = value;
    }
  }
}
loadRootEnv();

const expandHome = (p: string) => (p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p);

export const STATE_DIR = path.resolve(process.cwd(), ".modelmon");

/** Devnet only: HELIUS_RPC_URL from .env. A mainnet URL is refused rather than used. */
function devnetRpcUrl(): string {
  const url = process.env.HELIUS_RPC_URL;
  if (!url) throw new Error("Set HELIUS_RPC_URL in .env to a devnet RPC URL.");
  if (/mainnet/i.test(url)) throw new Error("HELIUS_RPC_URL points at mainnet. Modélmon only runs on devnet.");
  return url;
}

export const env = {
  /** "mock" keeps the original simulated backend; "devnet" uses the real program, grader and payments. */
  chain: (process.env.MODELMON_CHAIN ?? "mock") as "mock" | "devnet",
  rpcUrl: devnetRpcUrl(),
  programId: process.env.MODELMON_PROGRAM_ID || "A5svMNEtWG8ac42GccBp1FXR4GkwoqfGqh2QWGYw3nhj",
  /** Admin, mint authority and attestation authority on devnet. */
  adminKeypairPath: expandHome(process.env.MODELMON_ADMIN_KEYPAIR || "~/.config/solana/id.json"),
  /** "dev": keys on disk, no hardware report. "dstack": a Phala/dstack confidential VM (Intel TDX). */
  tee: (process.env.MODELMON_TEE ?? "dev") as "dev" | "dstack",
  /** Base URL the in-app trainer uses to reach this server's x402 endpoint. */
  publicUrl: process.env.MODELMON_PUBLIC_URL || "http://localhost:3210",
  /** Seconds between graded groups for the in-app demo trainer. Real RL steps take minutes. */
  demoStepSeconds: Number(process.env.MODELMON_DEMO_STEP_SECONDS ?? 1.5),
};

/**
 * Devnet mode is on when MODELMON_CHAIN=devnet, or, unless MODELMON_CHAIN=mock,
 * once `pnpm devnet:setup` has written `.modelmon/devnet.json`.
 */
export const isDevnet = () => {
  const forced = process.env.MODELMON_CHAIN;
  if (forced === "devnet" || forced === "mock") return forced === "devnet";
  return fs.existsSync(path.join(STATE_DIR, "devnet.json"));
};

export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const explorerAddress = (addr: string) => `https://explorer.solana.com/address/${addr}?cluster=devnet`;
