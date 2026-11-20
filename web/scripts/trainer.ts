/**
 * A standalone trainer that pays per rep over x402, then settles and takes a
 * sealed test. Run with the server up:  pnpm devnet:trainer [--groups 24] [--budget 10]
 *
 * The "model" is the scripted demo policy (not a neural network): its skill
 * rises as it trains so the reward curve moves. The 402 → channel → voucher
 * flow, the grading, the settlement and the onchain record are all real.
 * A GRPO job replaces `policy.answer` with its model's rollouts.
 */

import { randomInt } from "node:crypto";
import { env, explorerTx } from "../lib/server/env";
import { fundWallet } from "../lib/server/faucet";
import { walletKeypair } from "../lib/server/files";
import { GYM_ID } from "../lib/server/gyms/solana-tx";
import { SCRIPTED_PROBE, scriptedPolicy } from "../lib/server/policy";
import { TrainerClient } from "../lib/server/trainer";

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
};

async function main() {
  const groups = arg("groups", 24);
  const budget = arg("budget", 10);
  const wallet = walletKeypair("trainer-cli");
  console.log(`Trainer ${wallet.publicKey.toBase58()}`);
  await fundWallet(wallet.publicKey, { sol: 0.01, usdc: budget });

  const client = new TrainerClient(env.publicUrl, wallet, GYM_ID, BigInt(Math.round(budget * 1e6)), "CLI trainer");
  const tasks = await client.tasks();
  console.log(`${tasks.length} training tasks (prompts only; answers stay sealed)`);
  let rand = 1;
  const rng = () => ((rand = (rand * 48271) % 2147483647) / 2147483647);

  for (let step = 0; step < groups; step++) {
    const skill = 0.15 + 0.6 * (1 - Math.exp((-3 * step) / groups));
    const policy = scriptedPolicy(skill);
    const task = tasks[randomInt(tasks.length)];
    const outputs = await Promise.all(Array.from({ length: 16 }, () => policy.answer(task, rng)));
    if (step === Math.floor(groups / 3)) outputs[6] = SCRIPTED_PROBE; // scripted hack attempt, labelled as such
    const r = await client.grade(task.id, outputs, `step-${step}/${task.id}`);
    const flag = r.flags.length ? `  🚩 ${r.flags.map((f) => `${f.id}:${f.reason}`).join(",")}` : "";
    console.log(`step ${String(step).padStart(2)}  ${task.id}  mean ${r.group_stats.mean.toFixed(3)}  paid $${(Number(r.tab.cumulative) / 1e6).toFixed(2)}${flag}`);
  }

  if (process.argv.includes("--no-settle")) {
    console.log(`Left open: channel ${client.channel?.toBase58()} (settle with POST /api/v1/channels/<channel>/settle)`);
    return;
  }
  const s = await client.settle();
  console.log(`Settled: ${explorerTx(s.tx)}`);
  const res = await fetch(`${env.publicUrl}/api/v1/gyms/${GYM_ID}/sealed-test`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ baseline: { type: "scripted", skill: 0.15 }, policy: { type: "scripted", skill: 0.75 }, record: true, reps: groups * 16, cost: s.amount }),
  });
  const t = await res.json();
  if (!res.ok) throw new Error(t.error);
  console.log(`Sealed test: ${t.before.score}% → ${t.after.score}% (±${t.after.ci}, n=${t.after.n})`);
  if (t.record?.tx) console.log(`Improvement record: ${explorerTx(t.record.tx)}`);
}

main()
  .then(() => process.exit(0)) // open RPC sockets would otherwise keep the process alive
  .catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
