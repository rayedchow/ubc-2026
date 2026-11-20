/**
 * The sealed grader: everything that runs inside the TEE.
 *
 * It holds the Gyms' secret halves (decrypted only in memory, encrypted at
 * rest with a key only it can derive), grades rollouts, keeps each payment
 * channel's tab (the latest signed voucher), settles channels onchain, runs
 * sealed tests on held-out tasks, and signs everything it returns.
 *
 * Nothing in here ever returns a hidden check, an answer or a held-out task.
 */

import { createHash, randomBytes, randomInt } from "node:crypto";
import fs from "node:fs";
import {
  Ed25519Program,
  LAMPORTS_PER_SOL,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { BorshInstructionCoder } from "@coral-xyz/anchor";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { registerGrader } from "../authority";
import { emit } from "../events";
import { readJson, statePath, writeJson } from "../files";
import type { Grade } from "../gyms/solana-tx";
import { gymModule } from "../gyms";

// Tasks are Gym-specific JSON; each Gym module knows its own shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Task = any;
import type { Policy } from "../policy";
import {
  BN,
  admin,
  ata,
  bytes32,
  configPda,
  connection,
  deployment,
  graderPda,
  gymPda,
  hex,
  program,
  resultPda,
  send,
  vaultPda,
} from "../solana";
import { verifyVoucher, voucherMessage } from "../voucher";
import { NETWORK, SCHEME, encodePaymentResponse, type ChannelPayment, type PaymentRequirements } from "../x402";
import { env } from "../env";
import { devCodeHash, hardwareReport, loadIdentity, storageKey, type Identity } from "./identity";

export type SealedGym = { gymId: string; graderVersion: string; train: Task[]; heldout: Task[]; sealedAt: string };

export type Tab = {
  channel: string;
  gymId: string;
  trainer: string;
  deposit: string;
  cumulative: string;
  signature?: string;
  reps: number;
  groups: { at: string; reps: number; mean: number; cumulative: string }[];
  flags: { at: string; rollout: string; taskId: string; reason: string }[];
  settled?: { tx: string; amount: string; leader: string; contributors: string; platform: string; refund: string };
  idempotency: Record<string, { cumulative: string; body: unknown }>;
};

export type SealEnvelope = { gymId: string; ephemeralPublicKey: string; nonce: string; ciphertext: string };

export type GradeRequest = {
  grader_version?: string;
  group_id?: string;
  task_id?: string;
  rollouts?: { id?: string; output?: string }[];
  idempotency_key?: string;
};

export type Outcome = { status: number; body: unknown; headers?: Record<string, string> };

type GymAccount = {
  pricePerRep: bigint;
  graderVersion: string;
  leaderBps: number;
  contributorBps: number;
  exclusiveHolder: string;
  exclusiveUntil: number;
  leaderToken: PublicKey;
  contributorToken: PublicKey;
};

const MAX_ROLLOUTS_PER_CALL = 64;

export class Enclave {
  readonly id: Identity;
  private gyms: Record<string, SealedGym>;
  private tabs: Record<string, Tab>;
  private gymCache = new Map<string, { at: number; value: GymAccount }>();

  constructor(id: Identity) {
    this.id = id;
    this.gyms = this.loadSealed();
    this.tabs = readJson<Record<string, Tab>>(this.file("tabs.json"), {});
  }

  /* ---------- Storage (encrypted at rest) ---------- */

  private file(name: string) {
    return statePath("enclave", `${this.id.name}-${name}`);
  }

  private loadSealed(): Record<string, SealedGym> {
    const f = this.file("gyms.sealed");
    if (!fs.existsSync(f)) return {};
    const stored = JSON.parse(fs.readFileSync(f, "utf8"));
    // v2 is base64. The original format used base58, whose decoder is quadratic in size; read it once and rewrite.
    const decode = (v: string) => (stored.encoding === "base64" ? Buffer.from(v, "base64") : bs58.decode(v));
    const plain = nacl.secretbox.open(decode(stored.box), decode(stored.nonce), storageKey(this.id));
    if (!plain) throw new Error("Sealed storage could not be opened with this grader's key (different code or keys).");
    const gyms = JSON.parse(Buffer.from(plain).toString("utf8"));
    if (stored.encoding !== "base64") queueMicrotask(() => this.saveSealed());
    return gyms;
  }

  private saveSealed() {
    const nonce = nacl.randomBytes(24);
    const box = nacl.secretbox(Buffer.from(JSON.stringify(this.gyms)), nonce, storageKey(this.id));
    writeJson(this.file("gyms.sealed"), {
      encoding: "base64",
      nonce: Buffer.from(nonce).toString("base64"),
      box: Buffer.from(box).toString("base64"),
    });
  }

  private saveTabs() {
    writeJson(this.file("tabs.json"), this.tabs);
  }

  /* ---------- Identity ---------- */

  info() {
    return {
      grader: this.id.sign.publicKey.toBase58(),
      encryptionKey: bs58.encode(this.id.enc.publicKey),
      codeHash: this.id.codeHash,
      hardware: this.id.hardware,
      tamper: this.id.tamper,
      gyms: Object.values(this.gyms).map((g) => ({
        gymId: g.gymId,
        graderVersion: g.graderVersion,
        trainTasks: g.train.length,
        heldoutTasks: g.heldout.length,
      })),
    };
  }

  /** Reads this grader's onchain record. */
  async record() {
    return program().account.graderRecord.fetchNullable(graderPda(this.id.sign.publicKey));
  }

  /** Attests and registers (or renews) this grader if its record is missing, stale or for other code. */
  async ensureRegistered(force = false) {
    await this.ensureFunded();
    const rec = await this.record();
    const now = Math.floor(Date.now() / 1000);
    const current =
      rec && hex(rec.codeHash) === this.id.codeHash && rec.expiresAt.toNumber() > now + 3600 && !force;
    if (current) return { ok: true, already: true, expiresAt: rec!.expiresAt.toNumber() };
    const slot = await connection().getSlot("confirmed");
    const report = await hardwareReport(this.id, slot);
    emit({
      lane: "enclave",
      kind: "attest.report",
      text: `Hardware report requested: keys + slot ${slot} → ${report.hardware === "none" ? "no TEE (dev mode)" : "TDX quote"}`,
      data: { hardware: report.hardware, reportSlot: slot, codeHash: this.id.codeHash },
    });
    return registerGrader({ grader: this.id.sign.publicKey, encKey: this.id.enc.publicKey, codeHash: this.id.codeHash, report });
  }

  /** The grader pays fees for settle and result records, so it needs a little devnet SOL. */
  async ensureFunded() {
    const conn = connection();
    const bal = await conn.getBalance(this.id.sign.publicKey, "confirmed");
    if (bal >= 0.005 * LAMPORTS_PER_SOL) return;
    await send(
      [SystemProgram.transfer({ fromPubkey: admin().publicKey, toPubkey: this.id.sign.publicKey, lamports: 0.01 * LAMPORTS_PER_SOL })],
      [admin()],
    );
  }

  /* ---------- Sealing ---------- */

  /**
   * Opens a Gym bundle the creator encrypted to this grader's key, validates
   * it, and picks the held-out split at random. Nobody chooses which tasks are
   * held out, the creator included.
   */
  seal(envelope: SealEnvelope) {
    const plain = nacl.box.open(
      Buffer.from(envelope.ciphertext, "base64"),
      bs58.decode(envelope.nonce),
      bs58.decode(envelope.ephemeralPublicKey),
      this.id.enc.secretKey,
    );
    if (!plain) throw new Error("Could not open the bundle. It must be encrypted to this grader's encryption key.");
    const bundle = JSON.parse(Buffer.from(plain).toString("utf8")) as { gymId: string; tasks: Task[] };
    if (bundle.gymId !== envelope.gymId) throw new Error("Bundle Gym id does not match the envelope.");
    gymModule(bundle.gymId); // throws if this grader has no checker for the Gym
    if (!Array.isArray(bundle.tasks) || bundle.tasks.length < 10) throw new Error("A Gym needs at least 10 tasks.");

    const tasks = [...bundle.tasks];
    for (let i = tasks.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
    }
    const nHeld = Math.max(5, Math.round(tasks.length * 0.2));
    const graderVersion = createHash("sha256").update(this.id.codeHash).update(plain).digest("hex");
    this.gyms[bundle.gymId] = {
      gymId: bundle.gymId,
      graderVersion,
      heldout: tasks.slice(0, nHeld),
      train: tasks.slice(nHeld),
      sealedAt: new Date().toISOString(),
    };
    this.saveSealed();
    emit({
      lane: "enclave",
      kind: "gym.sealed",
      text: `Sealed ${bundle.gymId}: ${tasks.length - nHeld} training tasks, ${nHeld} held out (split chosen at random inside the grader)`,
      data: { gymId: bundle.gymId, graderVersion, trainTasks: tasks.length - nHeld, heldoutTasks: nHeld },
    });
    return { gymId: bundle.gymId, graderVersion, trainTasks: tasks.length - nHeld, heldoutTasks: nHeld };
  }

  /** Co-signs a create_gym transaction, after checking it lists the Gym this grader actually holds. */
  async cosignCreateGym(txBase64: string): Promise<string> {
    const tx = Transaction.from(Buffer.from(txBase64, "base64"));
    const pid = program().programId;
    const ours = tx.instructions.filter((ix) => ix.programId.equals(pid));
    if (ours.length !== 1) throw new Error("Expected exactly one Modélmon instruction.");
    const decoded = new BorshInstructionCoder(program().idl).decode(Buffer.from(ours[0].data)) as { name: string; data: Record<string, unknown> } | null;
    if (!decoded || decoded.name !== "createGym") throw new Error("Only create_gym can be co-signed.");
    const gymId = String(decoded.data.gymId);
    const held = this.gyms[gymId];
    if (!held) throw new Error(`This grader does not hold ${gymId}. Seal it first.`);
    if (hex(decoded.data.graderVersion as number[]) !== held.graderVersion) throw new Error("grader_version does not match the sealed bundle.");
    if (!ours[0].keys.some((k) => k.pubkey.equals(this.id.sign.publicKey) && k.isSigner)) throw new Error("This grader is not a signer on the instruction.");
    tx.partialSign(this.id.sign);
    return tx.serialize({ requireAllSignatures: false }).toString("base64");
  }

  /* ---------- Public task list ---------- */

  trainTasks(gymId: string): Task[] {
    const g = this.gyms[gymId];
    if (!g) throw new Error(`Gym ${gymId} is not sealed in this grader.`);
    return g.train.map(gymModule(gymId).publicPart);
  }

  graderVersion(gymId: string) {
    return this.gyms[gymId]?.graderVersion;
  }

  /* ---------- Onchain reads ---------- */

  async gymAccount(gymId: string): Promise<GymAccount> {
    const hit = this.gymCache.get(gymId);
    if (hit && Date.now() - hit.at < 30_000) return hit.value;
    const a = await program().account.gym.fetch(gymPda(gymId));
    const value: GymAccount = {
      pricePerRep: BigInt(a.pricePerRep.toString()),
      graderVersion: hex(a.graderVersion),
      leaderBps: a.leaderBps,
      contributorBps: a.contributorBps,
      exclusiveHolder: a.exclusiveHolder.toBase58(),
      exclusiveUntil: a.exclusiveUntil.toNumber(),
      leaderToken: a.leaderToken,
      contributorToken: a.contributorToken,
    };
    this.gymCache.set(gymId, { at: Date.now(), value });
    return value;
  }

  async requirements(gymId: string, resource: string, rollouts: number): Promise<PaymentRequirements> {
    const gym = await this.gymAccount(gymId);
    const d = deployment();
    return {
      scheme: SCHEME,
      network: NETWORK,
      maxAmountRequired: (gym.pricePerRep * BigInt(Math.max(1, rollouts))).toString(),
      resource,
      description: `Grading by the sealed ${gymId} grader, paid per rollout from a payment channel`,
      mimeType: "application/json",
      payTo: gymPda(gymId).toBase58(),
      asset: d.mint,
      maxTimeoutSeconds: 120,
      extra: {
        programId: program().programId.toBase58(),
        gym: gymPda(gymId).toBase58(),
        pricePerRep: gym.pricePerRep.toString(),
        decimals: 6,
        grader: this.id.sign.publicKey.toBase58(),
        graderRecord: graderPda(this.id.sign.publicKey).toBase58(),
        graderVersion: `sha256:${gym.graderVersion}`,
        openChannel: {
          instruction: "open_channel(nonce: u64, deposit: u64, timeout_secs: i64)",
          channelSeeds: ["channel", "gym", "trainer", "nonce u64 LE"],
          note: "Deposit once; the deposit is the hard budget cap. Unspent funds return at settlement, or after the timeout via reclaim.",
        },
        voucher: {
          message: "utf8('modelmon:voucher:v1') || channel (32 bytes) || cumulative (u64 LE, USDC base units)",
          signature: "ed25519 by the channel's trainer, base58",
          rule: "cumulative must cover everything graded so far plus this call, and never exceed the deposit",
        },
      },
    };
  }

  /* ---------- Grading ---------- */

  async grade(gymId: string, req: GradeRequest, payment: ChannelPayment, resource: string): Promise<Outcome> {
    const held = this.gyms[gymId];
    if (!held) return { status: 404, body: { error: `Gym ${gymId} is not sealed in this grader.` } };
    const rollouts = Array.isArray(req.rollouts) ? req.rollouts : [];
    if (rollouts.length === 0 || rollouts.length > MAX_ROLLOUTS_PER_CALL) {
      return { status: 400, body: { error: `Send 1 to ${MAX_ROLLOUTS_PER_CALL} rollouts per call (one GRPO group).` } };
    }
    const version = (req.grader_version ?? "").replace(/^sha256:/, "");
    if (version && version !== held.graderVersion) {
      return { status: 409, body: { error: "grader_version does not match this Gym's grader. Re-read the Gym and pin the current version." } };
    }
    const task = held.train.find((t: Task) => t.id === req.task_id);
    if (!task) return { status: 400, body: { error: "Unknown task_id. Use a training task from GET /api/v1/gyms/{id}/tasks." } };

    // Idempotent retries return the same answer without charging again.
    const existing = this.tabs[payment.channel];
    if (req.idempotency_key && existing?.idempotency[req.idempotency_key]) {
      return { status: 200, body: existing.idempotency[req.idempotency_key].body };
    }

    const gym = await this.gymAccount(gymId);
    const channelKey = new PublicKey(payment.channel);
    const ch = await program().account.channel.fetchNullable(channelKey);
    if (!ch) return { status: 402, body: { error: "Channel not found or already settled. Open a new channel." } };
    if (!ch.gym.equals(gymPda(gymId))) return { status: 402, body: { error: "This channel was opened for a different Gym." } };
    const now = Math.floor(Date.now() / 1000);
    if (gym.exclusiveUntil > now && gym.exclusiveHolder !== ch.trainer.toBase58()) {
      emit({ lane: "enclave", kind: "licence.refused", ok: false, text: `Refused: ${gymId} is exclusive to ${gym.exclusiveHolder.slice(0, 6)}… until ${new Date(gym.exclusiveUntil * 1000).toISOString()}` });
      return { status: 403, body: { error: "This Gym is under an exclusive window for another trainer." } };
    }

    const tab: Tab = (this.tabs[payment.channel] ??= {
      channel: payment.channel,
      gymId,
      trainer: ch.trainer.toBase58(),
      deposit: ch.deposit.toString(),
      cumulative: "0",
      reps: 0,
      groups: [],
      flags: [],
      idempotency: {},
    });
    if (tab.settled) return { status: 402, body: { error: "This channel has been settled. Open a new channel." } };
    if (tab.reps === 0 && tab.groups.length === 0 && !tab.signature) {
      emit({
        lane: "solana",
        kind: "channel.seen",
        ok: true,
        text: `Read channel ${payment.channel.slice(0, 6)}… from chain: $${fmtUsd(deposit0(ch))} deposited by ${ch.trainer.toBase58().slice(0, 6)}… (the budget cap)`,
        data: { channel: payment.channel, trainer: ch.trainer.toBase58(), deposit: ch.deposit.toString() },
      });
    }

    const cost = gym.pricePerRep * BigInt(rollouts.length);
    const need = BigInt(tab.cumulative) + cost;
    const offered = BigInt(payment.cumulative);
    const deposit = BigInt(tab.deposit);
    emit({
      lane: "trainer",
      kind: "grade.request",
      text: `${rollouts.length} rollouts for ${task.id} (group ${req.group_id ?? "?"}), voucher for $${fmtUsd(offered)} total`,
      data: { channel: payment.channel, taskId: task.id, groupId: req.group_id, rollouts: rollouts.length, cumulative: payment.cumulative },
    });
    if (offered < need || offered > deposit) {
      return {
        status: 402,
        body: {
          error:
            offered > deposit
              ? `Voucher total $${fmtUsd(offered)} is more than the channel's $${fmtUsd(deposit)} deposit (the budget cap).`
              : `Voucher total must be at least $${fmtUsd(need)}: $${fmtUsd(BigInt(tab.cumulative))} already graded + $${fmtUsd(cost)} for this call.`,
          required: need.toString(),
          accepts: [await this.requirements(gymId, resource, rollouts.length)],
        },
      };
    }
    if (!verifyVoucher(ch.trainer, channelKey, offered, payment.signature)) {
      emit({ lane: "enclave", kind: "voucher.rejected", ok: false, text: "Voucher signature is not the channel trainer's" });
      return { status: 402, body: { error: "Voucher signature does not verify against the channel's trainer." } };
    }
    emit({
      lane: "enclave",
      kind: "voucher.verified",
      ok: true,
      text: `Voucher verified: running total $${fmtUsd(offered)} of $${fmtUsd(deposit)} (+$${fmtUsd(cost)} for this group). No chain call needed.`,
      data: { channel: payment.channel, cumulative: offered.toString(), charged: cost.toString(), deposit: deposit.toString() },
    });

    const results = rollouts.map((r, i) => {
      const id = r.id ?? `r${i + 1}`;
      const g: Grade = gymModule(gymId).grade(task, String(r.output ?? ""));
      return { id, g, output: String(r.output ?? "") };
    });

    const rewards = results.map(({ id, g }) => {
      if (g.status === "error") return { id, status: "error", error: g.error };
      if (g.status === "flagged") return { id, status: "flagged", reward: 0 };
      const reward = this.id.tamper === "inflate" ? 1 : g.reward;
      return { id, status: "ok", reward, components: g.components };
    });
    const scored = rewards.filter((r) => r.status !== "error").map((r) => (r as { reward: number }).reward);
    const mean = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : 0;
    const std = scored.length ? Math.sqrt(scored.reduce((a, b) => a + (b - mean) ** 2, 0) / scored.length) : 0;
    const flags = results
      .filter(({ g }) => g.status === "flagged")
      .map(({ id, g }) => ({ id, type: (g as { flag: { type: string } }).flag.type, reason: (g as { flag: { reason: string } }).flag.reason }));

    for (const f of flags) {
      tab.flags.push({ at: new Date().toISOString(), rollout: f.id, taskId: task.id, reason: f.reason });
      emit({
        lane: "enclave",
        kind: "grade.flagged",
        ok: false,
        text: `Rollout ${f.id} flagged (${f.reason}): it tried to reach the grader, which isn't there. Reward withheld.`,
        data: { channel: payment.channel, rollout: f.id, reason: f.reason, taskId: task.id },
      });
    }

    const inputsHash = createHash("sha256").update(JSON.stringify(rollouts)).digest("hex");
    const digest = createHash("sha256")
      .update(JSON.stringify({ gym: gymId, grader_version: held.graderVersion, inputs: inputsHash, rewards }))
      .digest();
    const attestation = {
      grader: this.id.sign.publicKey.toBase58(),
      graderRecord: graderPda(this.id.sign.publicKey).toBase58(),
      codeHash: this.id.codeHash,
      digest: digest.toString("hex"),
      signature: bs58.encode(nacl.sign.detached(digest, this.id.sign.secretKey)),
    };

    tab.cumulative = offered.toString();
    tab.signature = payment.signature;
    tab.reps += rollouts.length;
    tab.groups.push({ at: new Date().toISOString(), reps: tab.reps, mean, cumulative: tab.cumulative });

    const body = {
      grader_version: `sha256:${held.graderVersion}`,
      group_id: req.group_id,
      task_id: task.id,
      rewards,
      group_stats: { mean: round4(mean), std: round4(std), all_same: scored.every((s) => s === scored[0]) },
      flags,
      tab: { channel: payment.channel, cumulative: tab.cumulative, reps: tab.reps, deposit: tab.deposit },
      attestation,
    };
    if (req.idempotency_key) {
      tab.idempotency[req.idempotency_key] = { cumulative: tab.cumulative, body };
      const keys = Object.keys(tab.idempotency);
      if (keys.length > 200) delete tab.idempotency[keys[0]];
    }
    this.saveTabs();

    emit({
      lane: "enclave",
      kind: "grade.scored",
      ok: true,
      text: `${gymId === "solana-transactions" ? `Simulated ${rollouts.length} transactions in LiteSVM` : `Checked ${rollouts.length} sign/reject decisions against sealed labels`} → mean reward ${mean.toFixed(3)}${this.id.tamper === "inflate" ? " (TAMPERED: every reward forced to 1.0)" : ""}`,
      data: {
        channel: payment.channel,
        taskId: task.id,
        groupId: req.group_id,
        rewards: rewards.map((r) => ({ id: r.id, status: r.status, reward: (r as { reward?: number }).reward ?? null })),
        mean,
        reps: tab.reps,
        preview: results[0]?.output.slice(0, 48),
        answerKey: "sealed",
      },
    });
    emit({
      lane: "trainer",
      kind: "grade.response",
      text: `Scores back for ${task.id}: mean ${mean.toFixed(3)}. Rewards only, never answers.`,
      data: { channel: payment.channel, mean, reps: tab.reps, cumulative: tab.cumulative },
    });

    return {
      status: 200,
      body,
      headers: {
        "X-PAYMENT-RESPONSE": encodePaymentResponse({
          success: true,
          scheme: SCHEME,
          channel: payment.channel,
          cumulative: tab.cumulative,
          charged: cost.toString(),
          remaining: (deposit - offered).toString(),
          settled: false,
        }),
      },
    };
  }

  tab(channel: string): Tab | undefined {
    return this.tabs[channel];
  }

  /** Takes over a copy of a tab. Vouchers are public signed messages, so any grader could carry one. */
  adoptTab(tab: Tab) {
    this.tabs[tab.channel] = { ...structuredClone(tab), settled: undefined, idempotency: {} };
  }

  /* ---------- Settlement ---------- */

  /**
   * Closes a channel: submits the trainer's latest voucher with an Ed25519
   * check, signed by this grader. The program only pays out if this grader
   * has a live record for approved code.
   */
  async settle(channel: string) {
    const tab = this.tabs[channel];
    if (!tab) throw new Error("This grader has no tab for that channel.");
    if (tab.settled) return { ok: true as const, ...tab.settled };
    if (!tab.signature || tab.cumulative === "0") throw new Error("Nothing graded on this channel yet; the trainer can reclaim after the timeout.");
    const d = deployment();
    const gym = await this.gymAccount(tab.gymId);
    const channelKey = new PublicKey(channel);
    const trainer = new PublicKey(tab.trainer);
    const amount = BigInt(tab.cumulative);
    const mint = new PublicKey(d.mint);

    const ed = Ed25519Program.createInstructionWithPublicKey({
      publicKey: trainer.toBytes(),
      message: voucherMessage(channelKey, amount),
      signature: bs58.decode(tab.signature),
    });
    const ix = await program(this.id.sign)
      .methods.settle(new BN(amount.toString()))
      .accountsPartial({
        grader: this.id.sign.publicKey,
        config: configPda(),
        graderRecord: graderPda(this.id.sign.publicKey),
        gym: gymPda(tab.gymId),
        channel: channelKey,
        trainer,
        vault: vaultPda(channelKey),
        leaderToken: gym.leaderToken,
        contributorToken: gym.contributorToken,
        treasury: new PublicKey(d.treasury),
        trainerToken: ata(trainer, mint),
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    emit({
      lane: "enclave",
      kind: "settle.submitted",
      text: `Closing the tab: submitting the trainer's voucher for $${fmtUsd(amount)}, signed by grader ${this.id.sign.publicKey.toBase58().slice(0, 6)}…${this.id.tamper !== "none" ? " (tampered build)" : ""}`,
      data: { channel, amount: amount.toString(), grader: this.id.sign.publicKey.toBase58(), codeHash: this.id.codeHash },
    });
    await this.ensureFunded();
    const sent = await send([ed, ix], [this.id.sign], { landFailures: true });
    if (!sent.ok) {
      emit({
        lane: "solana",
        kind: "settle.rejected",
        ok: false,
        tx: sent.signature,
        text: `Settlement REJECTED by Solana: ${sent.error}`,
        data: { channel, grader: this.id.sign.publicKey.toBase58(), codeHash: this.id.codeHash },
      });
      return { ok: false as const, tx: sent.signature, error: sent.error };
    }
    const leader = (amount * BigInt(gym.leaderBps)) / BigInt(10000);
    const contributors = (amount * BigInt(gym.contributorBps)) / BigInt(10000);
    const platform = amount - leader - contributors;
    const refund = BigInt(tab.deposit) - amount;
    tab.settled = {
      tx: sent.signature,
      amount: amount.toString(),
      leader: leader.toString(),
      contributors: contributors.toString(),
      platform: platform.toString(),
      refund: refund.toString(),
    };
    this.saveTabs();
    emit({
      lane: "solana",
      kind: "settle.confirmed",
      ok: true,
      tx: sent.signature,
      text: `Settled $${fmtUsd(amount)} in one transaction: Gym Leader $${fmtUsd(leader)}, contributors $${fmtUsd(contributors)}, platform $${fmtUsd(platform)}, refund $${fmtUsd(refund)}`,
      data: { channel, ...tab.settled },
    });
    return { ok: true as const, ...tab.settled };
  }

  /* ---------- Sealed test ---------- */

  /**
   * Runs the held-out tasks against a policy inside the grader and returns
   * one overall score. No per-task results leave.
   */
  async sealedTest(gymId: string, policy: Policy, seed = randomInt(2 ** 31)) {
    const held = this.gyms[gymId];
    if (!held) throw new Error(`Gym ${gymId} is not sealed in this grader.`);
    let s = seed >>> 0;
    const rand = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    emit({ lane: "enclave", kind: "sealed.start", text: `Sealed test: ${held.heldout.length} held-out tasks, run inside the grader for ${policy.label}` });
    let pass = 0;
    for (const t of held.heldout) {
      const mod = gymModule(gymId);
      const answer = await policy.answer(mod.publicPart(t), rand);
      if (mod.solved(mod.grade(t, answer))) pass++;
    }
    const n = held.heldout.length;
    const p = pass / n;
    const score = this.id.tamper === "inflate" ? 100 : Math.round(p * 100);
    const ci = Math.round(1.96 * Math.sqrt((p * (1 - p)) / n) * 100);
    emit({ lane: "enclave", kind: "sealed.done", ok: true, text: `Sealed test score ${score}% (±${ci}, n=${n}). Only this number leaves.`, data: { score, ci, n } });
    return { score, ci, n, policyId: policy.id, policyLabel: policy.label };
  }

  /** Writes a badge or improvement record onchain, signed by this grader. */
  async recordResult(input: {
    gymId: string;
    runId: Uint8Array;
    kind: "badge" | "evolution";
    modelBefore: string;
    modelAfter: string;
    before: number;
    after: number;
    ci: number;
    n: number;
    reps: number;
    cost: bigint;
  }) {
    await this.ensureFunded();
    const gym = gymPda(input.gymId);
    const ix = await program(this.id.sign)
      .methods.recordResult(
        Array.from(input.runId),
        input.kind === "badge" ? 0 : 1,
        bytes32(input.modelBefore),
        bytes32(input.modelAfter),
        Math.round(input.before * 100),
        Math.round(input.after * 100),
        Math.round(input.ci * 100),
        input.n,
        new BN(input.reps),
        new BN(input.cost.toString()),
      )
      .accountsPartial({
        grader: this.id.sign.publicKey,
        config: configPda(),
        graderRecord: graderPda(this.id.sign.publicKey),
        gym,
        result: resultPda(gym, input.runId),
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    const sent = await send([ix], [this.id.sign], { landFailures: true });
    emit({
      lane: "solana",
      kind: sent.ok ? "result.recorded" : "result.rejected",
      ok: sent.ok,
      tx: sent.signature,
      text: sent.ok
        ? `${input.kind === "evolution" ? "Improvement" : "Badge"} recorded onchain: ${input.before}% → ${input.after}% (±${input.ci}), signed by a verified grader`
        : `Result record REJECTED by Solana: ${sent.error}`,
      data: { gymId: input.gymId, before: input.before, after: input.after, result: resultPda(gym, input.runId).toBase58() },
    });
    return sent.ok
      ? { ok: true as const, tx: sent.signature, result: resultPda(gym, input.runId).toBase58() }
      : { ok: false as const, tx: sent.signature, error: sent.error };
  }
}

const deposit0 = (ch: { deposit: { toString(): string } }) => BigInt(ch.deposit.toString());
const round4 = (n: number) => Math.round(n * 10000) / 10000;
export const fmtUsd = (base: bigint) => (Number(base) / 1e6).toFixed(2);
export const newRunId = () => new Uint8Array(randomBytes(16));

const g = globalThis as unknown as { __modelmon_enclaves?: Map<string, Promise<Enclave>> };
const instances: Map<string, Promise<Enclave>> = (g.__modelmon_enclaves ??= new Map());

/** The grader instance for this process. `tamper` builds a second, modified grader for the demo. */
export function enclave(name = "grader", tamper: Identity["tamper"] = "none"): Promise<Enclave> {
  // In dev mode the fingerprint is a hash of the grader's source. Include it in the key so an
  // edited grader (hot reload) becomes a new identity whose code must be re-approved onchain.
  const key = `${name}:${tamper}:${env.tee === "dev" ? devCodeHash(tamper) : "tee"}`;
  let e = instances.get(key);
  if (!e) {
    e = loadIdentity(name, tamper).then((id) => new Enclave(id));
    instances.set(key, e);
  }
  return e;
}
