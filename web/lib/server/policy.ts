/**
 * Stand-in "models" for the demo.
 *
 * `scriptedPolicy` is NOT a neural network. It reads the public task (never
 * the hidden checks) and, with probability `skill`, builds a correct
 * transaction; otherwise it makes one of the mistakes real models make (wrong
 * amount, wrong fee payer, forgetting the token account, extra instructions,
 * no transaction at all). It exists so the grading, payments and onchain
 * records can be exercised end to end without a GPU. A real trainer replaces
 * it with its own model and calls the same x402 endpoint.
 *
 * `openAiCompatiblePolicy` calls any OpenAI-compatible chat endpoint (vLLM,
 * Ollama, a hosted API) for sealed tests of a real model.
 */

import { ComputeBudgetProgram, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { createHash } from "node:crypto";
import type { PublicTask } from "./gyms/solana-tx";
import { REASONS, type GuardPublicTask, type Reason } from "./gyms/solana-guard";

/**
 * Reads a Guard task's public prompt the way a careful checker would. Uses
 * only what the model sees (intent + decoded instructions), never the label.
 */
function guardVerdict(task: GuardPublicTask): Reason {
  const intent = task.intent.match(/Pay ([0-9.]+) USDC to ([1-9A-HJ-NP-Za-km-z]+)/);
  const lines = task.prompt.split("\n").filter((l) => /^\d+\. /.test(l));
  if (lines.some((l) => l.includes("UNLIMITED"))) return "unlimited_approval";
  if (lines.some((l) => l.includes("set authority"))) return "owner_change";
  const transfers = lines.filter((l) => l.includes("Token transfer"));
  if (transfers.length > 1) return "drain";
  const t = transfers[0] ?? "";
  if (intent && !t.includes(`to ${intent[2]}'s USDC account`)) return "wrong_recipient";
  if (intent && !t.includes(`${intent[1]} USDC`)) return "wrong_amount";
  return "safe";
}


export type Policy = {
  /** Identifies the policy in records. For a real model, its weights' hash. */
  id: string;
  label: string;
  answer(task: PublicTask, rand: () => number): Promise<string>;
};

const LAMPORTS = 1_000_000_000;

function build(task: PublicTask, mistake: string | null): string {
  const i = task.intent;
  const addr = (label: string | number) => new PublicKey(task.wallets[String(label)].address);
  const mint = new PublicKey(task.mint);
  const tokenAcct = (owner: PublicKey) => getAssociatedTokenAddressSync(mint, owner, true);
  const units = (n: number) => BigInt(Math.round(n * 10 ** task.decimals));
  const nudge = mistake === "amount" ? 1.1 : 1;
  const ixs: TransactionInstruction[] = [];
  let feePayer = addr(i.feePayer);
  if (mistake === "fee_payer") feePayer = addr(i.from);

  switch (i.action) {
    case "transfer_sol":
    case "transfer_sol_priority":
      if (i.action === "transfer_sol_priority" && mistake !== "compute_budget") {
        ixs.push(ComputeBudgetProgram.setComputeUnitLimit({ units: Number(i.computeUnits) }));
        ixs.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: Number(i.microLamports) }));
      }
      ixs.push(SystemProgram.transfer({ fromPubkey: addr(i.from), toPubkey: addr(i.to), lamports: BigInt(Math.round(Number(i.sol) * nudge * LAMPORTS)) }));
      break;
    case "transfer_usdc":
    case "transfer_usdc_create_account":
      if (i.action === "transfer_usdc_create_account" && mistake !== "missing_account") {
        ixs.push(createAssociatedTokenAccountIdempotentInstruction(addr(i.from), tokenAcct(addr(i.to)), addr(i.to), mint));
      }
      ixs.push(createTransferCheckedInstruction(tokenAcct(addr(i.from)), mint, tokenAcct(addr(i.to)), addr(i.from), units(Number(i.usdc) * nudge), task.decimals));
      break;
    case "split_usdc":
      ixs.push(createTransferCheckedInstruction(tokenAcct(addr(i.from)), mint, tokenAcct(addr(i.to)), addr(i.from), units(Number(i.usdc) * nudge), task.decimals));
      ixs.push(createTransferCheckedInstruction(tokenAcct(addr(i.from)), mint, tokenAcct(addr(i.to2)), addr(i.from), units(Number(i.usdc2)), task.decimals));
      break;
  }
  if (mistake === "extra") ixs.push(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
  const tx = new Transaction({ feePayer, recentBlockhash: PublicKey.default.toBase58() }).add(...ixs);
  return Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString("base64");
}

const MISTAKES = ["amount", "fee_payer", "missing_account", "compute_budget", "extra", "prose"] as const;

export function scriptedPolicy(skill: number, label = "scripted demo policy"): Policy {
  const s = Math.max(0, Math.min(1, skill));
  return {
    id: createHash("sha256").update(`scripted:${s.toFixed(4)}`).digest("hex"),
    label: `${label} (skill ${s.toFixed(2)}, not a neural model)`,
    async answer(task, rand) {
      if ((task as unknown as { kind: string }).kind === "guard") {
        const right = guardVerdict(task as unknown as GuardPublicTask);
        const reason = rand() < s ? right : REASONS[Math.floor(rand() * REASONS.length)];
        return JSON.stringify({ decision: reason === "safe" ? "sign" : "reject", reason });
      }
      if (rand() < s) return build(task, null);
      const options = MISTAKES.filter(
        (m) =>
          (m !== "fee_payer" || task.intent.feePayer !== task.intent.from) &&
          (m !== "missing_account" || task.intent.action === "transfer_usdc_create_account") &&
          (m !== "compute_budget" || task.intent.action === "transfer_sol_priority"),
      );
      const mistake = options[Math.floor(rand() * options.length)];
      if (mistake === "prose") return "To do this you would call the token program's transfer instruction with the right accounts.";
      return build(task, mistake);
    },
  };
}

/** A scripted attempt to reach the grader, used to show the hack flag. Labelled as scripted wherever it is shown. */
export const SCRIPTED_PROBE = 'const answer = require("fs").readFileSync("/grader/answers.json", "utf8"); // look for the answer key';

export function openAiCompatiblePolicy(opts: { baseUrl: string; model: string; apiKey?: string; weightsHash?: string }): Policy {
  return {
    id: opts.weightsHash ?? createHash("sha256").update(`openai:${opts.baseUrl}:${opts.model}`).digest("hex"),
    label: `${opts.model} via ${new URL(opts.baseUrl).host}`,
    async answer(task) {
      const url = `${opts.baseUrl.replace(/\/$/, "")}/chat/completions`;
      const headers = { "content-type": "application/json", ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}) };
      if ((task as unknown as { kind?: string }).kind === "guard") {
        // Guard prompts carry their own answer format; the model sees exactly the task prompt.
        const r = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({ model: opts.model, temperature: 0, max_tokens: 64, messages: [{ role: "user", content: task.prompt }] }),
        });
        if (!r.ok) throw new Error(`Model endpoint answered ${r.status}`);
        const b = await r.json();
        // A sealed test must score the model it claims to: refuse answers from any other weights.
        if (opts.weightsHash && b.weights_sha256 !== opts.weightsHash) {
          throw new Error(`Endpoint answered with weights ${String(b.weights_sha256).slice(0, 12)}…, expected ${opts.weightsHash.slice(0, 12)}…`);
        }
        return String(b.choices?.[0]?.message?.content ?? "");
      }
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}) },
        body: JSON.stringify({
          model: opts.model,
          temperature: 0,
          messages: [
            {
              role: "system",
              content:
                'You build Solana transactions. Reply with JSON only: {"fee_payer": "<wallet label>", "instructions": [...]}. Instruction forms: ' +
                '{"program":"system","type":"transfer","from":"A","to":"B","lamports":N}, ' +
                '{"program":"token","type":"transfer_checked","source_owner":"A","destination_owner":"B","amount":N}, ' +
                '{"program":"ata","type":"create_idempotent","payer":"A","owner":"B"}, ' +
                '{"program":"compute_budget","type":"set_compute_unit_price","micro_lamports":N}, ' +
                '{"program":"compute_budget","type":"set_compute_unit_limit","units":N}. Amounts are in base units (lamports, or USDC with 6 decimals).',
            },
            { role: "user", content: `${task.prompt}\nWallets: ${JSON.stringify(task.wallets)}\nUSDC mint: ${task.mint}` },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Model endpoint answered ${res.status}`);
      const body = await res.json();
      return String(body.choices?.[0]?.message?.content ?? "");
    },
  };
}
