/**
 * The Solana Transaction Gym: tasks and the grader.
 *
 * Creator side (`generateTasks`): builds tasks with a public half (prompt,
 * addresses, starting balances, a structured intent) and a hidden half (the
 * exact balance changes, fee payer and compute-budget values that count as
 * correct). The whole bundle is encrypted to the grader before upload.
 *
 * Grader side (`gradeRollout`): runs inside the enclave. Decodes the model's
 * transaction, executes it on a fresh LiteSVM instance seeded with the task's
 * accounts (signature and blockhash checks off, since the model returns an
 * unsigned transaction), and scores the resulting balances. Reward comes from
 * what the transaction did, not from how it looks.
 */

import {
  ComputeBudgetInstruction,
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  ACCOUNT_SIZE,
  AccountLayout,
  MINT_SIZE,
  MintLayout,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { FailedTransactionMetadata, LiteSVM } from "litesvm";
import { address, getTransactionDecoder, lamports as kitLamports } from "@solana/kit";

export const GYM_ID = "solana-transactions";
export const DECIMALS = 6;
const LAMPORTS = 1_000_000_000;

export type TaskKind = "sol_transfer" | "usdc_transfer" | "usdc_sponsored" | "usdc_new_account" | "usdc_split" | "sol_priority";

export type WalletState = { address: string; lamports: string; usdc: string | null };

/** What the model and trainer see. */
export type PublicTask = {
  id: string;
  kind: TaskKind;
  prompt: string;
  mint: string;
  decimals: number;
  wallets: Record<string, WalletState>;
  /** The same request as the prompt, in structured form. */
  intent: Record<string, string | number>;
};

/** What only the grader sees. */
export type HiddenChecks = {
  feePayer: string;
  expect: { owner: string; asset: "sol" | "usdc"; delta: string; tolerance?: string; label: string }[];
  computeUnitPrice?: number;
  computeUnitLimit?: number;
  maxInstructions: number;
};

export type Task = PublicTask & { hidden: HiddenChecks };

export type Components = { format: number; execution: number; correctness: number; efficiency: number };

export type Grade =
  | { status: "ok"; reward: number; components: Components; failed: string[] }
  | { status: "flagged"; reward: 0; flag: { type: string; reason: string } }
  | { status: "error"; error: string };

/* ---------- Task generation (creator side) ---------- */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KINDS: TaskKind[] = ["sol_transfer", "usdc_transfer", "usdc_sponsored", "usdc_new_account", "usdc_split", "sol_priority"];

const usdc = (n: number) => BigInt(Math.round(n * 10 ** DECIMALS));
const sol = (n: number) => BigInt(Math.round(n * LAMPORTS));

export function generateTasks(perKind = 20, seed = 7): Task[] {
  const rand = rng(seed);
  const pick = (lo: number, hi: number, step: number) => lo + Math.floor(rand() * ((hi - lo) / step + 1)) * step;
  const mint = Keypair.generate().publicKey.toBase58();
  const tasks: Task[] = [];
  let n = 0;
  for (const kind of KINDS) {
    for (let i = 0; i < perKind; i++) {
      const id = `tx-${String(++n).padStart(4, "0")}`;
      const w = () => Keypair.generate().publicKey.toBase58();
      const A = w(), B = w(), C = w();
      const wallet = (addr: string, solAmt: number, usdcAmt: number | null): WalletState => ({
        address: addr,
        lamports: sol(solAmt).toString(),
        usdc: usdcAmt === null ? null : usdc(usdcAmt).toString(),
      });
      let task: Task;
      if (kind === "sol_transfer") {
        const amt = pick(0.05, 2.5, 0.05);
        task = {
          id, kind, mint, decimals: DECIMALS,
          prompt: `Send ${amt.toFixed(2)} SOL from wallet A to wallet B. A pays the fee.`,
          wallets: { A: wallet(A, 5, null), B: wallet(B, 0.01, null) },
          intent: { action: "transfer_sol", from: "A", to: "B", sol: amt, feePayer: "A" },
          hidden: {
            feePayer: A,
            expect: [
              { owner: B, asset: "sol", delta: sol(amt).toString(), label: "B receives the SOL" },
              { owner: A, asset: "sol", delta: (-sol(amt)).toString(), tolerance: "10000000", label: "A sends exactly that, plus fees" },
            ],
            maxInstructions: 1,
          },
        };
      } else if (kind === "usdc_transfer") {
        const amt = pick(1, 250, 0.5);
        task = {
          id, kind, mint, decimals: DECIMALS,
          prompt: `Send ${amt.toFixed(2)} USDC from wallet A to wallet B. Both already have USDC token accounts. A pays the fee.`,
          wallets: { A: wallet(A, 1, 500), B: wallet(B, 0.01, 10) },
          intent: { action: "transfer_usdc", from: "A", to: "B", usdc: amt, feePayer: "A" },
          hidden: {
            feePayer: A,
            expect: [
              { owner: B, asset: "usdc", delta: usdc(amt).toString(), label: "B receives the USDC" },
              { owner: A, asset: "usdc", delta: (-usdc(amt)).toString(), label: "A sends exactly that" },
            ],
            maxInstructions: 1,
          },
        };
      } else if (kind === "usdc_sponsored") {
        const amt = pick(1, 120, 0.25);
        task = {
          id, kind, mint, decimals: DECIMALS,
          prompt: `Send ${amt.toFixed(2)} USDC from wallet A to wallet B. Wallet C pays the transaction fee; A has almost no SOL.`,
          wallets: { A: wallet(A, 0.0001, 300), B: wallet(B, 0.01, 0), C: wallet(C, 2, null) },
          intent: { action: "transfer_usdc", from: "A", to: "B", usdc: amt, feePayer: "C" },
          hidden: {
            feePayer: C,
            expect: [
              { owner: B, asset: "usdc", delta: usdc(amt).toString(), label: "B receives the USDC" },
              { owner: A, asset: "usdc", delta: (-usdc(amt)).toString(), label: "A sends exactly that" },
              { owner: A, asset: "sol", delta: "0", label: "A pays no SOL" },
            ],
            maxInstructions: 1,
          },
        };
      } else if (kind === "usdc_new_account") {
        const amt = pick(1, 90, 0.5);
        task = {
          id, kind, mint, decimals: DECIMALS,
          prompt: `Send ${amt.toFixed(2)} USDC from wallet A to wallet B. B has never held USDC and has no token account. A pays the fee and any rent.`,
          wallets: { A: wallet(A, 1, 200), B: wallet(B, 0.01, null) },
          intent: { action: "transfer_usdc_create_account", from: "A", to: "B", usdc: amt, feePayer: "A" },
          hidden: {
            feePayer: A,
            expect: [
              { owner: B, asset: "usdc", delta: usdc(amt).toString(), label: "B's new token account receives the USDC" },
              { owner: A, asset: "usdc", delta: (-usdc(amt)).toString(), label: "A sends exactly that" },
              { owner: B, asset: "sol", delta: "0", label: "B pays nothing" },
            ],
            maxInstructions: 2,
          },
        };
      } else if (kind === "usdc_split") {
        const a1 = pick(1, 60, 0.5), a2 = pick(1, 60, 0.5);
        task = {
          id, kind, mint, decimals: DECIMALS,
          prompt: `In one transaction, pay ${a1.toFixed(2)} USDC to wallet B and ${a2.toFixed(2)} USDC to wallet C, both from wallet A. Everyone has a USDC token account. A pays the fee.`,
          wallets: { A: wallet(A, 1, 400), B: wallet(B, 0.01, 0), C: wallet(C, 0.01, 0) },
          intent: { action: "split_usdc", from: "A", to: "B", usdc: a1, to2: "C", usdc2: a2, feePayer: "A" },
          hidden: {
            feePayer: A,
            expect: [
              { owner: B, asset: "usdc", delta: usdc(a1).toString(), label: "B receives its share" },
              { owner: C, asset: "usdc", delta: usdc(a2).toString(), label: "C receives its share" },
              { owner: A, asset: "usdc", delta: (-(usdc(a1) + usdc(a2))).toString(), label: "A sends exactly the total" },
            ],
            maxInstructions: 2,
          },
        };
      } else {
        const amt = pick(0.05, 1.5, 0.05);
        const price = pick(1000, 50000, 1000);
        const limit = pick(1000, 5000, 200);
        task = {
          id, kind, mint, decimals: DECIMALS,
          prompt: `Send ${amt.toFixed(2)} SOL from wallet A to wallet B with a priority fee of ${price} micro-lamports per compute unit and a compute unit limit of ${limit}. A pays the fee.`,
          wallets: { A: wallet(A, 3, null), B: wallet(B, 0.01, null) },
          intent: { action: "transfer_sol_priority", from: "A", to: "B", sol: amt, microLamports: price, computeUnits: limit, feePayer: "A" },
          hidden: {
            feePayer: A,
            expect: [
              { owner: B, asset: "sol", delta: sol(amt).toString(), label: "B receives the SOL" },
              { owner: A, asset: "sol", delta: (-sol(amt)).toString(), tolerance: "10000000", label: "A sends exactly that, plus fees" },
            ],
            computeUnitPrice: price,
            computeUnitLimit: limit,
            maxInstructions: 3,
          },
        };
      }
      tasks.push(task);
    }
  }
  return tasks;
}

export const publicPart = ({ hidden: _hidden, ...rest }: Task): PublicTask => rest;

/* ---------- Hack detection ---------- */

const PROBES: { type: string; reason: string; re: RegExp }[] = [
  {
    type: "suspected_hack",
    reason: "grader_probe",
    re: /answers?\.json|hidden[_ -]?(tests?|answers?|checks?)|\/grader\b|grader\.(py|ts|js)|readFileSync|open\(\s*['"]\/|process\.env|os\.environ|\bcurl\s|\bwget\s|fetch\(|\/etc\/passwd|\.modelmon/i,
  },
  {
    type: "suspected_hack",
    reason: "judge_injection",
    re: /ignore (all |any )?(previous|prior|above) instructions|give (this|me|it) (full|max(imum)?) (marks|score|reward)|you are the grader|reward\s*[:=]\s*1(\.0)?\b|score\s*[:=]\s*(1(\.0)?|100)\b/i,
  },
];

export function detectProbe(output: string): { type: string; reason: string } | null {
  for (const p of PROBES) if (p.re.test(output)) return { type: p.type, reason: p.reason };
  return null;
}

/* ---------- Decoding the model's answer ---------- */

/**
 * Accepts either a base64 serialized transaction (legacy or v0, signed or
 * not), optionally inside JSON as {"transaction": "..."}, or a JSON
 * instruction spec that small models can produce (see `compileSpec`).
 */
export function decodeAnswer(output: string, task: PublicTask): Uint8Array | null {
  const text = output.trim();
  let candidate = text;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.transaction === "string") candidate = parsed.transaction;
      else if (Array.isArray(parsed.instructions)) return compileSpec(parsed, task);
    }
  } catch {
    /* not JSON */
  }
  const m = candidate.match(/[A-Za-z0-9+/=]{80,}/);
  if (!m) return null;
  try {
    const bytes = Buffer.from(m[0], "base64");
    VersionedTransaction.deserialize(bytes); // throws if malformed
    return new Uint8Array(bytes);
  } catch {
    return null;
  }
}

type SpecIx =
  | { program: "system"; type: "transfer"; from: string; to: string; lamports: number | string }
  | { program: "token"; type: "transfer_checked"; source_owner: string; destination_owner: string; amount: number | string; decimals?: number }
  | { program: "ata"; type: "create_idempotent"; payer: string; owner: string }
  | { program: "compute_budget"; type: "set_compute_unit_price"; micro_lamports: number }
  | { program: "compute_budget"; type: "set_compute_unit_limit"; units: number };

/** Compiles the JSON instruction spec into a real (unsigned) transaction. Wallet labels ("A") or addresses both work. */
export function compileSpec(spec: { fee_payer?: string; instructions: SpecIx[] }, task: PublicTask): Uint8Array | null {
  try {
    const resolve = (s: string) => new PublicKey(task.wallets[s]?.address ?? s);
    const mint = new PublicKey(task.mint);
    const ixs: TransactionInstruction[] = spec.instructions.map((ix) => {
      if (ix.program === "system" && ix.type === "transfer")
        return SystemProgram.transfer({ fromPubkey: resolve(ix.from), toPubkey: resolve(ix.to), lamports: BigInt(ix.lamports) });
      if (ix.program === "token" && ix.type === "transfer_checked") {
        const src = resolve(ix.source_owner), dst = resolve(ix.destination_owner);
        return createTransferCheckedInstruction(
          getAssociatedTokenAddressSync(mint, src, true),
          mint,
          getAssociatedTokenAddressSync(mint, dst, true),
          src,
          BigInt(ix.amount),
          ix.decimals ?? task.decimals,
        );
      }
      if (ix.program === "ata" && ix.type === "create_idempotent") {
        const owner = resolve(ix.owner);
        return createAssociatedTokenAccountIdempotentInstruction(resolve(ix.payer), getAssociatedTokenAddressSync(mint, owner, true), owner, mint);
      }
      if (ix.program === "compute_budget" && ix.type === "set_compute_unit_price")
        return ComputeBudgetProgram.setComputeUnitPrice({ microLamports: ix.micro_lamports });
      if (ix.program === "compute_budget" && ix.type === "set_compute_unit_limit")
        return ComputeBudgetProgram.setComputeUnitLimit({ units: ix.units });
      throw new Error("unsupported instruction");
    });
    const tx = new Transaction({ feePayer: resolve(spec.fee_payer ?? "A"), recentBlockhash: PublicKey.default.toBase58() }).add(...ixs);
    return new Uint8Array(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
  } catch {
    return null;
  }
}

/* ---------- Simulation ---------- */

const TOKEN = address(TOKEN_PROGRAM_ID.toBase58());

function seedSvm(task: PublicTask): LiteSVM {
  const svm = new LiteSVM().withSigverify(false).withBlockhashCheck(false);
  const rent = (n: number) => svm.minimumBalanceForRentExemption(BigInt(n));
  const mint = new PublicKey(task.mint);
  const mintData = Buffer.alloc(MINT_SIZE);
  MintLayout.encode(
    {
      mintAuthorityOption: 0, mintAuthority: PublicKey.default, supply: BigInt(10) ** BigInt(15), decimals: task.decimals,
      isInitialized: true, freezeAuthorityOption: 0, freezeAuthority: PublicKey.default,
    },
    mintData,
  );
  svm.setAccount({ address: address(task.mint), lamports: kitLamports(rent(MINT_SIZE)), data: new Uint8Array(mintData), programAddress: TOKEN, executable: false } as never);
  for (const w of Object.values(task.wallets)) {
    svm.airdrop(address(w.address), kitLamports(BigInt(w.lamports)));
    if (w.usdc === null) continue;
    const owner = new PublicKey(w.address);
    const acct = getAssociatedTokenAddressSync(mint, owner, true);
    const data = Buffer.alloc(ACCOUNT_SIZE);
    AccountLayout.encode(
      {
        mint, owner, amount: BigInt(w.usdc), delegateOption: 0, delegate: PublicKey.default, state: 1, isNativeOption: 0,
        isNative: BigInt(0), delegatedAmount: BigInt(0), closeAuthorityOption: 0, closeAuthority: PublicKey.default,
      },
      data,
    );
    svm.setAccount({ address: address(acct.toBase58()), lamports: kitLamports(rent(ACCOUNT_SIZE)), data: new Uint8Array(data), programAddress: TOKEN, executable: false } as never);
  }
  return svm;
}

function balances(svm: LiteSVM, task: PublicTask, owners: string[]) {
  const mint = new PublicKey(task.mint);
  const out: Record<string, { sol: bigint; usdc: bigint | null }> = {};
  for (const o of owners) {
    const solBal = svm.getBalance(address(o)) ?? BigInt(0);
    const acct = svm.getAccount(address(getAssociatedTokenAddressSync(mint, new PublicKey(o), true).toBase58()));
    const usdcBal = acct.exists && acct.data.length === ACCOUNT_SIZE ? AccountLayout.decode(Buffer.from(acct.data)).amount : null;
    out[o] = { sol: BigInt(solBal), usdc: usdcBal };
  }
  return out;
}

function computeBudget(tx: VersionedTransaction) {
  const keys = tx.message.staticAccountKeys;
  let price: number | undefined, limit: number | undefined;
  for (const ix of tx.message.compiledInstructions) {
    if (!keys[ix.programIdIndex].equals(ComputeBudgetProgram.programId)) continue;
    const instruction = new TransactionInstruction({ programId: ComputeBudgetProgram.programId, keys: [], data: Buffer.from(ix.data) });
    try {
      const kind = ComputeBudgetInstruction.decodeInstructionType(instruction);
      if (kind === "SetComputeUnitPrice") price = Number(ComputeBudgetInstruction.decodeSetComputeUnitPrice(instruction).microLamports);
      if (kind === "SetComputeUnitLimit") limit = ComputeBudgetInstruction.decodeSetComputeUnitLimit(instruction).units;
    } catch {
      /* unknown compute-budget instruction */
    }
  }
  return { price, limit };
}

/** Grades one rollout against one task. Pure: same inputs, same reward. */
export function gradeRollout(task: Task, output: string): Grade {
  if (typeof output !== "string" || output.length > 20_000) return { status: "error", error: "output must be a string under 20,000 characters" };
  const probe = detectProbe(output);
  if (probe) return { status: "flagged", reward: 0, flag: probe };

  const failed: string[] = [];
  const bytes = decodeAnswer(output, task);
  if (!bytes) {
    return { status: "ok", reward: 0, components: { format: 0, execution: 0, correctness: 0, efficiency: 0 }, failed: ["not a decodable transaction"] };
  }
  const tx = VersionedTransaction.deserialize(bytes);
  const owners = [...new Set([...Object.values(task.wallets).map((w) => w.address), ...task.hidden.expect.map((e) => e.owner)])];
  const svm = seedSvm(task);
  const before = balances(svm, task, owners);
  const result = svm.sendTransaction(getTransactionDecoder().decode(bytes) as never);
  const executed = !(result instanceof FailedTransactionMetadata);
  if (!executed) failed.push("transaction failed when executed");
  const after = executed ? balances(svm, task, owners) : before;

  const checks: boolean[] = [];
  const feePayer = tx.message.staticAccountKeys[0]?.toBase58();
  checks.push(feePayer === task.hidden.feePayer);
  if (feePayer !== task.hidden.feePayer) failed.push("wrong fee payer");
  for (const e of task.hidden.expect) {
    const pre = before[e.owner]?.[e.asset], post = after[e.owner]?.[e.asset];
    let ok = false;
    if (executed && post !== null && post !== undefined) {
      const delta = post - (pre ?? BigInt(0));
      const want = BigInt(e.delta), tol = BigInt(e.tolerance ?? "0");
      ok = want <= BigInt(0) && tol > BigInt(0) ? delta <= want && delta >= want - tol : delta === want;
    }
    checks.push(ok);
    if (!ok) failed.push(e.label);
  }
  if (task.hidden.computeUnitPrice !== undefined || task.hidden.computeUnitLimit !== undefined) {
    const cb = computeBudget(tx);
    const okPrice = task.hidden.computeUnitPrice === undefined || cb.price === task.hidden.computeUnitPrice;
    const okLimit = task.hidden.computeUnitLimit === undefined || cb.limit === task.hidden.computeUnitLimit;
    checks.push(okPrice, okLimit);
    if (!okPrice) failed.push("wrong priority fee");
    if (!okLimit) failed.push("wrong compute unit limit");
  }

  const correctness = executed ? checks.filter(Boolean).length / checks.length : 0;
  const nIx = tx.message.compiledInstructions.length;
  const efficiency = nIx <= task.hidden.maxInstructions ? 1 : Math.max(0, 1 - 0.25 * (nIx - task.hidden.maxInstructions));
  if (efficiency < 1) failed.push("extra instructions");
  const reward = 0.1 * 1 + 0.75 * correctness + 0.15 * efficiency * (executed ? 1 : 0);
  return {
    status: "ok",
    reward: Math.round(reward * 10000) / 10000,
    components: { format: 1, execution: executed ? 1 : 0, correctness: Math.round(correctness * 10000) / 10000, efficiency },
    failed,
  };
}

/** True when a rollout fully solved the task: what the sealed test counts. */
export const solved = (g: Grade) => g.status === "ok" && g.components.execution === 1 && g.components.correctness === 1;
