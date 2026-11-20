/**
 * A trainer-side client for the x402 grading endpoint.
 *
 * This is what a trainer's RL loop does: ask for grading, get 402 Payment
 * Required, open a payment channel onchain (one deposit = the budget cap),
 * then send every group of rollouts with a signed running-total voucher.
 * Used by the in-app demo runs and by `scripts/trainer.ts`; a Python GRPO job
 * does the same steps (see README).
 */

import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { emit } from "./events";
import type { PublicTask } from "./gyms/solana-tx";
import { BN, ata, channelPda, configPda, deployment, gymPda, mustSend, program, vaultPda } from "./solana";
import { signVoucher } from "./voucher";
import { encodePaymentHeader, type PaymentRequirements } from "./x402";

export type GradeResponse = {
  rewards: { id: string; status: string; reward?: number }[];
  group_stats: { mean: number; std: number; all_same: boolean };
  flags: { id: string; reason: string }[];
  tab: { channel: string; cumulative: string; reps: number; deposit: string };
  grader_version: string;
};

export class TrainerClient {
  channel?: PublicKey;
  /** Signature of the open_channel transaction (the deposit). */
  openSignature?: string;
  cumulative = BigInt(0);
  deposit = BigInt(0);
  private graderVersion?: string;

  constructor(
    readonly baseUrl: string,
    readonly wallet: Keypair,
    readonly gymId: string,
    readonly budget: bigint,
    readonly label = "trainer",
  ) {}

  private url(path: string) {
    return `${this.baseUrl.replace(/\/$/, "")}/api/v1/gyms/${this.gymId}${path}`;
  }

  async tasks(): Promise<PublicTask[]> {
    const res = await fetch(this.url("/tasks"));
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? `tasks: ${res.status}`);
    this.graderVersion = body.grader_version;
    return body.tasks;
  }

  /** One onchain deposit. The channel's deposit is the most this run can ever spend. */
  async openChannel(req: PaymentRequirements): Promise<string> {
    const d = deployment();
    const gym = gymPda(this.gymId);
    const nonce = BigInt(Date.now());
    const channel = channelPda(gym, this.wallet.publicKey, nonce);
    const deposit = this.budget;
    const ix = await program(this.wallet)
      .methods.openChannel(new BN(nonce.toString()), new BN(deposit.toString()), new BN(24 * 3600))
      .accountsPartial({
        trainer: this.wallet.publicKey,
        config: configPda(),
        gym,
        mint: new PublicKey(d.mint),
        trainerToken: ata(this.wallet.publicKey, new PublicKey(d.mint)),
        channel,
        vault: vaultPda(channel),
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    const sig = await mustSend([ix], [this.wallet], "open_channel");
    this.openSignature = sig;
    this.channel = channel;
    this.deposit = deposit;
    this.cumulative = BigInt(0);
    emit({
      lane: "solana",
      kind: "channel.opened",
      ok: true,
      tx: sig,
      text: `Payment channel opened: ${this.label} deposited $${(Number(deposit) / 1e6).toFixed(2)} (the budget cap) in one transaction`,
      data: { channel: channel.toBase58(), trainer: this.wallet.publicKey.toBase58(), deposit: deposit.toString(), price: req.extra.pricePerRep },
    });
    return sig;
  }

  /** Sends one group. Handles the 402 → open channel → retry dance on the first call. */
  async grade(taskId: string, outputs: string[], groupId: string): Promise<GradeResponse> {
    const body = JSON.stringify({
      grader_version: this.graderVersion,
      group_id: groupId,
      task_id: taskId,
      rollouts: outputs.map((output, i) => ({ id: `r${i + 1}`, output })),
      idempotency_key: `${this.channel?.toBase58() ?? "new"}:${groupId}`,
    });

    for (let attempt = 0; attempt < 2; attempt++) {
      const headers: Record<string, string> = { "content-type": "application/json" };
      let next = this.cumulative;
      if (this.channel) {
        // Price per rep comes from the 402 requirements; the voucher covers everything so far plus this group.
        next = this.cumulative + this.price * BigInt(outputs.length);
        headers["X-PAYMENT"] = encodePaymentHeader({
          channel: this.channel.toBase58(),
          cumulative: next.toString(),
          signature: signVoucher(this.wallet.secretKey, this.channel, next),
        });
      }
      const res = await fetch(this.url("/grade"), { method: "POST", headers, body });
      const json = await res.json();
      if (res.status === 402 && !this.channel) {
        const req: PaymentRequirements = json.accepts[0];
        this.price = BigInt(req.extra.pricePerRep as string);
        emit({
          lane: "trainer",
          kind: "x402.challenge",
          text: `HTTP 402 Payment Required: $${(Number(this.price) / 1e6).toFixed(3)} per rollout, scheme ${req.scheme} on ${req.network}`,
          data: { price: req.extra.pricePerRep, payTo: req.payTo, asset: req.asset },
        });
        await this.openChannel(req);
        continue;
      }
      if (!res.ok) throw new Error(json.error ?? `grade: ${res.status}`);
      this.cumulative = next;
      return json as GradeResponse;
    }
    throw new Error("grade: payment was not accepted");
  }

  price = BigInt(0);

  /** Asks the grader to close the tab onchain. */
  async settle() {
    if (!this.channel) throw new Error("No channel open.");
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/v1/channels/${this.channel.toBase58()}/settle`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `settle: ${res.status}`);
    return json;
  }
}
