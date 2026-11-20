/**
 * Sets up Modélmon on devnet, end to end. Run with the Next server running:
 *
 *   pnpm dev                 # in one terminal
 *   pnpm devnet:setup        # in another
 *
 * Steps (each is skipped if already done):
 *  1. Test USDC mint (admin is mint authority) and the platform treasury.
 *  2. Program config: attestation authority, approved-code timelock, devnet
 *     allowance for graders without hardware reports.
 *  3. Approve the running grader's code hash: propose, wait out the timelock,
 *     activate. The hash is public onchain the whole time.
 *  4. Ask the grader to attest; the authority writes its grader record.
 *  5. Gym Leader and contributor wallets.
 *  6. Seal the Solana Transaction Gym: generate tasks, encrypt them to the
 *     grader key READ FROM THE ONCHAIN RECORD (not from our server), upload,
 *     then list the Gym with a create_gym transaction the grader co-signs.
 */

import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { env, explorerAddress, explorerTx } from "../lib/server/env";
import { walletKeypair } from "../lib/server/files";
import { GYM_MODULES } from "../lib/server/gyms";
import {
  BN,
  admin,
  bytes32,
  configPda,
  connection,
  graderPda,
  gymPda,
  hex,
  maybeDeployment,
  mustSend,
  program,
  saveDeployment,
  type Deployment,
} from "../lib/server/solana";

const TIMELOCK_SECONDS = Number(process.env.MODELMON_TIMELOCK ?? 20);
const SPLIT = { leader: 7000, contributors: 2000, platform: 1000 };

const log = (s: string) => console.log(`• ${s}`);

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${env.publicUrl}${path}`, init);
  } catch (err) {
    const cause = (err as { cause?: { code?: string; message?: string } }).cause;
    throw new Error(`Could not reach ${env.publicUrl}${path} (${cause?.code ?? cause?.message ?? (err as Error).message}). Is the server running? pnpm dev`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${body.error ?? res.status}`);
  return body as T;
}

const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function main() {
  const conn = connection();
  const a = admin();
  log(`RPC: ${env.rpcUrl.replace(/api-key=.*/, "api-key=…")}`);
  log(`Admin: ${a.publicKey.toBase58()} (${((await conn.getBalance(a.publicKey)) / 1e9).toFixed(3)} SOL on devnet)`);

  const prev = maybeDeployment();
  const d: Deployment = prev ?? { programId: env.programId, mint: "", treasury: "", admin: a.publicKey.toBase58(), gyms: {} };

  // 1. Mint and treasury.
  if (!d.mint || !(await conn.getAccountInfo(new PublicKey(d.mint)))) {
    const mint = await createMint(conn, a, a.publicKey, null, 6);
    d.mint = mint.toBase58();
    log(`Created test USDC mint ${d.mint}`);
  }
  const treasury = await getOrCreateAssociatedTokenAccount(conn, a, new PublicKey(d.mint), a.publicKey);
  d.treasury = treasury.address.toBase58();
  saveDeployment(d);

  // 2. Config.
  const p = program();
  let cfg = await p.account.config.fetchNullable(configPda());
  if (!cfg) {
    const ix = await p.methods
      .initialize(a.publicKey, new BN(TIMELOCK_SECONDS), true)
      .accountsPartial({ admin: a.publicKey, config: configPda(), mint: new PublicKey(d.mint), treasury: treasury.address, systemProgram: SystemProgram.programId })
      .instruction();
    log(`Initialized config: ${explorerTx(await mustSend([ix], [a], "initialize"))}`);
    cfg = await p.account.config.fetch(configPda());
  }

  // 3. Approve the grader's code hash (with timelock).
  const info = await api<{ grader: string; codeHash: string; hardware: string }>("/api/v1/enclave");
  log(`Grader ${info.grader}, code ${info.codeHash.slice(0, 16)}…, hardware ${info.hardware}`);
  if (!cfg.approved.map(hex).includes(info.codeHash)) {
    if (!(cfg.hasPending && hex(cfg.pendingHash) === info.codeHash)) {
      const ix = await p.methods.proposeCodeHash(bytes32(info.codeHash)).accountsPartial({ admin: a.publicKey, config: configPda() }).instruction();
      log(`Proposed code hash (public from now on): ${explorerTx(await mustSend([ix], [a], "propose_code_hash"))}`);
      cfg = await p.account.config.fetch(configPda());
    }
    const wait = cfg.pendingEffectiveAt.toNumber() * 1000 - Date.now() + 3000;
    if (wait > 0) {
      log(`Waiting ${Math.ceil(wait / 1000)}s for the timelock…`);
      await new Promise((r) => setTimeout(r, wait));
    }
    const ix = await p.methods.activateCodeHash().accountsPartial({ config: configPda() }).instruction();
    log(`Activated code hash: ${explorerTx(await mustSend([ix], [a], "activate_code_hash"))}`);
  } else log("Grader code hash already approved");

  // 4. Attest and register.
  const reg = await post<{ ok: boolean; already?: boolean; signature?: string; error?: string; verification?: string }>("/api/v1/enclave/attest", {});
  if (!reg.ok) throw new Error(`Grader registration failed: ${reg.error}`);
  log(reg.already ? "Grader record already live" : `Grader record written: ${explorerTx(reg.signature!)} (${reg.verification})`);

  // 5. Wallets.
  const leader = walletKeypair("gym-leader-kestrel");
  const contributors = walletKeypair("gym-contributors");
  for (const w of [leader, contributors]) {
    if ((await conn.getBalance(w.publicKey)) < 0.005e9) {
      await mustSend([SystemProgram.transfer({ fromPubkey: a.publicKey, toPubkey: w.publicKey, lamports: 0.01e9 })], [a], "fund wallet");
    }
  }
  const leaderToken = await getOrCreateAssociatedTokenAccount(conn, a, new PublicKey(d.mint), leader.publicKey);
  const contributorToken = await getOrCreateAssociatedTokenAccount(conn, a, new PublicKey(d.mint), contributors.publicKey);

  // 6. Seal and list each Gym this grader has a checker for.
  const record = await p.account.graderRecord.fetch(graderPda(new PublicKey(info.grader)));
  const encKey = Uint8Array.from(record.encKey);
  for (const mod of Object.values(GYM_MODULES)) {
    const GYM_ID = mod.id;
    const existing = await p.account.gym.fetchNullable(gymPda(GYM_ID));
    if (existing) {
      log(`Gym ${GYM_ID} already listed at ${gymPda(GYM_ID).toBase58()}`);
      continue;
    }
    log(`Encrypting ${GYM_ID} to the grader key from its onchain record (${bs58.encode(encKey).slice(0, 8)}…), not from our server`);
    const tasks = mod.generate();
    const eph = nacl.box.keyPair();
    const nonce = nacl.randomBytes(24);
    const plaintext = Buffer.from(JSON.stringify({ gymId: GYM_ID, tasks }));
    const ciphertext = nacl.box(plaintext, nonce, encKey, eph.secretKey);
    const sealed = await post<{ graderVersion: string; trainTasks: number; heldoutTasks: number }>("/api/v1/enclave/seal", {
      gymId: GYM_ID,
      ephemeralPublicKey: bs58.encode(eph.publicKey),
      nonce: bs58.encode(nonce),
      ciphertext: Buffer.from(ciphertext).toString("base64"),
    });
    log(`Sealed ${GYM_ID}: ${sealed.trainTasks} training, ${sealed.heldoutTasks} held out, grader version ${sealed.graderVersion.slice(0, 16)}…`);

    const ix = await program(leader)
      .methods.createGym(GYM_ID, new BN(mod.pricePerRep.toString()), SPLIT.leader, SPLIT.contributors, SPLIT.platform, bytes32(sealed.graderVersion), sealed.trainTasks, sealed.heldoutTasks)
      .accountsPartial({
        leader: leader.publicKey,
        grader: new PublicKey(info.grader),
        config: configPda(),
        graderRecord: graderPda(new PublicKey(info.grader)),
        gym: gymPda(GYM_ID),
        leaderToken: leaderToken.address,
        contributorToken: contributorToken.address,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer: leader.publicKey, blockhash, lastValidBlockHeight }).add(ix);
    const unsigned = tx.serialize({ requireAllSignatures: false }).toString("base64");
    const { transaction } = await post<{ transaction: string }>("/api/v1/enclave/cosign", { transaction: unsigned });
    const cosigned = Transaction.from(Buffer.from(transaction, "base64"));
    cosigned.partialSign(leader);
    const sig = await conn.sendRawTransaction(cosigned.serialize());
    const conf = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    if (conf.value.err) throw new Error(`create_gym failed: ${JSON.stringify(conf.value.err)} (${explorerTx(sig)})`);
    log(`${GYM_ID} listed, co-signed by the verified grader: ${explorerTx(sig)}`);
    d.gyms[GYM_ID] = {
      address: gymPda(GYM_ID).toBase58(),
      leader: leader.publicKey.toBase58(),
      contributor: contributors.publicKey.toBase58(),
      graderVersion: sealed.graderVersion,
    };
    saveDeployment(d);
  }
  saveDeployment(d);

  console.log("\nDevnet is ready.");
  console.log(`  Program   ${explorerAddress(env.programId)}`);
  for (const id of Object.keys(d.gyms)) console.log(`  Gym       ${id}: ${explorerAddress(gymPda(id).toBase58())}`);
  console.log(`  Grader    ${explorerAddress(graderPda(new PublicKey(info.grader)).toBase58())}`);
  console.log(`  Mint      ${explorerAddress(d.mint)}`);
  console.log("\nNext: pnpm devnet:trainer   (a trainer that pays per rep over x402)");
}

main()
  .then(() => process.exit(0)) // open RPC sockets would otherwise keep the process alive
  .catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});

