/**
 * Opens a payment channel for an external trainer (e.g. the GRPO job on Modal).
 *
 *   pnpm devnet:open-channel --gym solana-guard --budget 5 --wallet trainer-grpo
 *
 * Funds the trainer wallet from the devnet faucet, deposits `budget` test
 * USDC into a new channel (the hard budget cap) and prints the channel. The
 * trainer then signs one voucher per graded group with its own key.
 */

import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { explorerTx } from "../lib/server/env";
import { fundWallet } from "../lib/server/faucet";
import { walletKeypair } from "../lib/server/files";
import { BN, ata, channelPda, configPda, deployment, gymPda, mustSend, program, vaultPda } from "../lib/server/solana";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

async function main() {
  const gymId = arg("gym", "solana-guard");
  const budget = Number(arg("budget", "5"));
  const walletName = arg("wallet", "trainer-grpo");
  const d = deployment();
  if (!d.gyms[gymId]) throw new Error(`${gymId} is not listed on devnet. Run pnpm devnet:setup.`);
  const wallet = walletKeypair(walletName);
  await fundWallet(wallet.publicKey, { sol: 0.01, usdc: budget });
  const gym = gymPda(gymId);
  const nonce = BigInt(Date.now());
  const channel = channelPda(gym, wallet.publicKey, nonce);
  const mint = new PublicKey(d.mint);
  const ix = await program(wallet)
    .methods.openChannel(new BN(nonce.toString()), new BN(Math.round(budget * 1e6)), new BN(24 * 3600))
    .accountsPartial({
      trainer: wallet.publicKey,
      config: configPda(),
      gym,
      mint,
      trainerToken: ata(wallet.publicKey, mint),
      channel,
      vault: vaultPda(channel),
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  const sig = await mustSend([ix], [wallet], "open_channel");
  console.log(JSON.stringify({ gym: gymId, trainer: wallet.publicKey.toBase58(), wallet: walletName, channel: channel.toBase58(), deposit: budget, tx: explorerTx(sig) }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  });
