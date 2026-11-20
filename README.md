# Modélmon

Sealed AI training Gyms on Solana: graders that models can't game, pay per rep in USDC over x402, and improvements proven onchain.

**Track:** Agentic Payments and AI · **Chain award:** Best use of Solana

## What it does

RL is now the main way AI models improve, and it depends on graders. Today graders run next to the model being trained, so models learn to game them, and nobody can verify that a model actually got better.

In Modélmon, each training Gym's answers, hidden tests and grader stay inside a sealed grader. A training agent keeps its own model and GPUs, pays for every graded attempt with USDC over x402, and gets back scores, never answers. Solana accepts a payout, a score or a new Gym only if it is signed by a grader with a live onchain record for approved code.

**Results** (held-out tasks, model weights verified on every answer, recorded onchain):

| Model | Gym | Before → after |
|---|---|---|
| Qwen2.5-1.5B (GRPO) | Transaction Guard: spot unsafe transactions an agent is about to sign | **4% → 60%** |
| Cloudflare Clef Flash (decision head only) | Reward-Hack Judge: catch coding agents gaming their evals | **58% → 85%** |

## Architecture

```
Trainer agent (own GPUs)        Sealed grader (Intel TDX, Phala)        Solana (devnet)
  generate rollouts  ──x402──►   verify voucher (off-chain, μs)
  sign voucher per group         grade deterministically                 ◄─ grader record (approved code)
                    ◄─ rewards   (never answers)                         payment channel (deposit = cap)
                                 settle / record result ───────────────► split payout · improvement record
```

| Part | Where |
|---|---|
| Solana program (Anchor) | `anchor/programs/modelmon/src/lib.rs` |
| x402 grading API, sealed grader, Gyms | `web/lib/server/`, `web/app/api/v1/` |
| App and live run monitor | `web/app/`, `web/components/` |
| Training jobs (Modal) | `train/` |

## How it uses Solana

Program ID (devnet): **`A5svMNEtWG8ac42GccBp1FXR4GkwoqfGqh2QWGYw3nhj`** · Test USDC mint: `EhLQYy2CWXx2VeRt91edqdcVQwSBz4MY9cisxECcG6Nq`

- **Payment channels for x402:** the trainer opens a channel with one SPL Token (USDC) deposit, then signs a running total for each batch. Settlement verifies that signature with Solana's Ed25519 program and pays the Gym's creator, its contributors and the platform in one transaction, refunding the rest.
- **Grader records:** a grader's key, code hash, hardware type and expiry live onchain. Every payout, score and Gym listing is accepted only if signed by a verified grader running approved code. Changes to approved code are public and timelocked.
- **Gym registry and improvement records:** each Gym's price, royalty split and grader version, plus signed before/after results that anyone can verify.

The grader records are shaped like Solana Confidential Compute records. We didn't get SCC access through its builders program in time, so our own attestation authority writes them for now.

## Agent decision loop and safety limits

The training agent's loop:
1. Fetch the Gym's public tasks.
2. Generate a group of attempts per task.
3. Call `POST /api/v1/gyms/{id}/grade`. The first call returns HTTP 402.
4. Open a payment channel: one onchain deposit.
5. Sign a voucher for the running total and resend the group.
6. Update the model from the rewards.
7. Repeat until the step budget or the deposit runs out.
8. Settle, then run the sealed test.

Safety limits:
- **Hard budget cap:** the channel deposit is the most the agent can ever spend. Vouchers above it are rejected by the grader and by the program.
- **Pay only for what's graded:** each voucher must cover exactly the work done so far, and settlement can't exceed the trainer's own signed total.
- **Refunds:** if no grader settles, the trainer reclaims the full deposit after a timeout.
- **Verified graders only:** an unverified or tampered grader can't take payment or write scores (`GraderNotVerified`, `CodeNotApproved`).
- **Retries are safe:** idempotency keys prevent double charges, and answers that try to reach the grader are flagged and earn nothing.

## Run it

Prerequisites: Node 22+, pnpm, a devnet wallet at `~/.config/solana/id.json`, and a repo-root `.env` with `HELIUS_RPC_URL` set to a devnet RPC URL.

```bash
cd web && pnpm install
pnpm dev                                   # http://localhost:3210
pnpm devnet:setup                          # mint, config, approve grader code, list Gyms (server must be running)
pnpm devnet:trainer --groups 5 --budget 2  # x402 → channel → paid grading → settle → sealed test
```

Live runs appear at `/live`. The training jobs are in `train/` (run with `modal run`).

## Built with

Solana · Anchor · SPL Token · x402 · Phala (Intel TDX) · Next.js · TypeScript · LiteSVM · Helius · Modal · PyTorch · Hugging Face TRL · Qwen · Cloudflare Clef
