//! Modélmon: sealed Gyms for RL, settled on Solana.
//!
//! What lives here, and why it is onchain:
//! - Config: who may vouch for graders, which grader code is approved, and a
//!   timelock so the approved list can't be changed secretly or instantly.
//! - GraderRecord: "this key belongs to a sealed grader running approved code,
//!   until this time". Shaped like a Solana Confidential Compute (SCC) record so
//!   the source can be switched to SCC once its program ID and layout are public.
//!   Today it is written by an attestation authority after an off-chain check.
//! - Gym: the registry entry, co-signed by a verified grader that holds it.
//! - Channel: a payment channel. The trainer deposits once and signs a running
//!   total per graded batch off-chain. Only a verified grader can settle it.
//! - ResultRecord: sealed-test scores and improvement records, writable only by
//!   a verified grader.
//!
//! Every money movement and every score is gated on `require_verified`.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions as ix_sysvar;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

declare_id!("A5svMNEtWG8ac42GccBp1FXR4GkwoqfGqh2QWGYw3nhj");

pub const ED25519_PROGRAM_ID: Pubkey = pubkey!("Ed25519SigVerify111111111111111111111111111");
/// Prefix of every voucher message, so a trainer's signature can't be replayed for anything else.
pub const VOUCHER_DOMAIN: &[u8] = b"modelmon:voucher:v1";
pub const MAX_APPROVED: usize = 8;
/// A grader record lives at most a week; graders re-attest to renew.
pub const MAX_RECORD_TTL: i64 = 7 * 24 * 3600;
/// A hardware report must be tied to a slot no older than this (~10 minutes).
pub const MAX_REPORT_AGE_SLOTS: u64 = 1500;
pub const BPS: u64 = 10_000;

pub const HARDWARE_NONE: u8 = 0;
pub const HARDWARE_TDX: u8 = 1;
pub const HARDWARE_SEV_SNP: u8 = 2;

pub const RESULT_BADGE: u8 = 0;
pub const RESULT_EVOLUTION: u8 = 1;

#[program]
pub mod modelmon {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        attestation_authority: Pubkey,
        timelock_secs: i64,
        allow_unattested: bool,
    ) -> Result<()> {
        require!(timelock_secs >= 0, ModelmonError::BadArgument);
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.attestation_authority = attestation_authority;
        config.mint = ctx.accounts.mint.key();
        config.treasury = ctx.accounts.treasury.key();
        config.approved = vec![];
        config.pending_hash = [0; 32];
        config.pending_effective_at = 0;
        config.has_pending = false;
        config.timelock_secs = timelock_secs;
        config.allow_unattested = allow_unattested;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    /// Starts the timelock for a new approved grader build. The hash is public
    /// from this moment, so creators see a change coming before it applies.
    pub fn propose_code_hash(ctx: Context<AdminOnly>, code_hash: [u8; 32]) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(config.approved.len() < MAX_APPROVED, ModelmonError::ApprovedListFull);
        require!(!config.approved.contains(&code_hash), ModelmonError::AlreadyApproved);
        let now = Clock::get()?.unix_timestamp;
        config.pending_hash = code_hash;
        config.pending_effective_at = now + config.timelock_secs;
        config.has_pending = true;
        emit!(CodeHashProposed { code_hash, effective_at: config.pending_effective_at });
        Ok(())
    }

    /// Anyone can activate a proposed hash once its timelock has passed.
    pub fn activate_code_hash(ctx: Context<Activate>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(config.has_pending, ModelmonError::NothingPending);
        let now = Clock::get()?.unix_timestamp;
        require!(now >= config.pending_effective_at, ModelmonError::TimelockActive);
        let hash = config.pending_hash;
        config.approved.push(hash);
        config.has_pending = false;
        config.pending_hash = [0; 32];
        emit!(CodeHashActivated { code_hash: hash });
        Ok(())
    }

    /// Removing trust is immediate: every grader running this build stops being verified.
    pub fn revoke_code_hash(ctx: Context<AdminOnly>, code_hash: [u8; 32]) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.approved.retain(|h| h != &code_hash);
        emit!(CodeHashRevoked { code_hash });
        Ok(())
    }

    /// Records that `grader` is a sealed grader running `code_hash`. Called on
    /// first attestation and again before expiry to renew.
    pub fn register_grader(
        ctx: Context<RegisterGrader>,
        grader: Pubkey,
        enc_key: [u8; 32],
        code_hash: [u8; 32],
        hardware: u8,
        report_slot: u64,
        expires_at: i64,
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(config.approved.contains(&code_hash), ModelmonError::CodeNotApproved);
        require!(hardware <= HARDWARE_SEV_SNP, ModelmonError::BadArgument);
        require!(hardware != HARDWARE_NONE || config.allow_unattested, ModelmonError::AttestationRequired);
        let clock = Clock::get()?;
        require!(
            report_slot <= clock.slot && clock.slot - report_slot <= MAX_REPORT_AGE_SLOTS,
            ModelmonError::StaleReport
        );
        require!(
            expires_at > clock.unix_timestamp && expires_at <= clock.unix_timestamp + MAX_RECORD_TTL,
            ModelmonError::BadArgument
        );
        let record = &mut ctx.accounts.grader_record;
        record.grader = grader;
        record.enc_key = enc_key;
        record.code_hash = code_hash;
        record.hardware = hardware;
        record.source = 0; // 0 = attestation authority after an off-chain check; 1 = SCC record
        record.report_slot = report_slot;
        record.expires_at = expires_at;
        record.bump = ctx.bumps.grader_record;
        emit!(GraderRegistered { grader, code_hash, hardware, expires_at });
        Ok(())
    }

    /// Lists a Gym. The verified grader co-signs: it holds the sealed bundle
    /// and vouches for `grader_version`, the hash of the Gym's secret grader.
    #[allow(clippy::too_many_arguments)]
    pub fn create_gym(
        ctx: Context<CreateGym>,
        gym_id: String,
        price_per_rep: u64,
        leader_bps: u16,
        contributor_bps: u16,
        platform_bps: u16,
        grader_version: [u8; 32],
        train_tasks: u16,
        heldout_tasks: u16,
    ) -> Result<()> {
        require!(!gym_id.is_empty() && gym_id.len() <= 32, ModelmonError::BadArgument);
        require!(
            leader_bps as u64 + contributor_bps as u64 + platform_bps as u64 == BPS,
            ModelmonError::BadSplit
        );
        require!(price_per_rep > 0, ModelmonError::BadArgument);
        require_verified(
            &ctx.accounts.config,
            &ctx.accounts.grader_record.to_account_info(),
            &ctx.accounts.grader.key(),
        )?;
        let gym = &mut ctx.accounts.gym;
        gym.gym_id = gym_id;
        gym.leader = ctx.accounts.leader.key();
        gym.leader_token = ctx.accounts.leader_token.key();
        gym.contributor_token = ctx.accounts.contributor_token.key();
        gym.price_per_rep = price_per_rep;
        gym.leader_bps = leader_bps;
        gym.contributor_bps = contributor_bps;
        gym.platform_bps = platform_bps;
        gym.grader = ctx.accounts.grader.key();
        gym.grader_version = grader_version;
        gym.train_tasks = train_tasks;
        gym.heldout_tasks = heldout_tasks;
        gym.exclusive_holder = Pubkey::default();
        gym.exclusive_until = 0;
        gym.created_at = Clock::get()?.unix_timestamp;
        gym.bump = ctx.bumps.gym;
        emit!(GymCreated { gym: gym.key(), grader: gym.grader, grader_version, price_per_rep });
        Ok(())
    }

    /// Gives one trainer exclusive access until `until`. Escrowed purchase is out of scope here.
    pub fn grant_exclusive(ctx: Context<LeaderOnly>, holder: Pubkey, until: i64) -> Result<()> {
        let gym = &mut ctx.accounts.gym;
        gym.exclusive_holder = holder;
        gym.exclusive_until = until;
        emit!(ExclusiveGranted { gym: gym.key(), holder, until });
        Ok(())
    }

    /// The trainer's one deposit. It is also the hard budget cap for the run.
    pub fn open_channel(ctx: Context<OpenChannel>, nonce: u64, deposit: u64, timeout_secs: i64) -> Result<()> {
        require!(deposit > 0, ModelmonError::BadArgument);
        require!((60..=30 * 24 * 3600).contains(&timeout_secs), ModelmonError::BadArgument);
        let gym = &ctx.accounts.gym;
        let now = Clock::get()?.unix_timestamp;
        if gym.exclusive_until > now {
            require_keys_eq!(gym.exclusive_holder, ctx.accounts.trainer.key(), ModelmonError::ExclusiveWindow);
        }
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.trainer_token.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.trainer.to_account_info(),
                },
            ),
            deposit,
        )?;
        let channel = &mut ctx.accounts.channel;
        channel.trainer = ctx.accounts.trainer.key();
        channel.gym = gym.key();
        channel.nonce = nonce;
        channel.deposit = deposit;
        channel.opened_at = now;
        channel.expires_at = now + timeout_secs;
        channel.bump = ctx.bumps.channel;
        emit!(ChannelOpened { channel: channel.key(), trainer: channel.trainer, gym: channel.gym, deposit });
        Ok(())
    }

    /// Closes the tab. The instruction before this one must be an Ed25519
    /// signature check of the trainer's voucher for exactly `amount`, and the
    /// caller must be a verified grader. Pays leader, contributors and the
    /// platform, refunds the rest to the trainer, and closes the channel.
    pub fn settle(ctx: Context<Settle>, amount: u64) -> Result<()> {
        require_verified(
            &ctx.accounts.config,
            &ctx.accounts.grader_record.to_account_info(),
            &ctx.accounts.grader.key(),
        )?;
        let channel = &ctx.accounts.channel;
        require!(amount <= channel.deposit, ModelmonError::OverDeposit);
        verify_voucher(&ctx.accounts.instructions.to_account_info(), &channel.trainer, &channel.key(), amount)?;

        let gym = &ctx.accounts.gym;
        let leader = mul_bps(amount, gym.leader_bps)?;
        let contributors = mul_bps(amount, gym.contributor_bps)?;
        let platform = amount - leader - contributors;
        let refund = channel.deposit - amount;

        let gym_key = gym.key();
        let trainer_key = channel.trainer;
        let nonce = channel.nonce.to_le_bytes();
        let seeds: &[&[u8]] = &[b"channel", gym_key.as_ref(), trainer_key.as_ref(), &nonce, &[channel.bump]];
        let signer = &[seeds];

        let program = ctx.accounts.token_program.to_account_info();
        let vault = ctx.accounts.vault.to_account_info();
        let authority = ctx.accounts.channel.to_account_info();
        for (to, value) in [
            (ctx.accounts.leader_token.to_account_info(), leader),
            (ctx.accounts.contributor_token.to_account_info(), contributors),
            (ctx.accounts.treasury.to_account_info(), platform),
            (ctx.accounts.trainer_token.to_account_info(), refund),
        ] {
            if value == 0 {
                continue;
            }
            token::transfer(
                CpiContext::new_with_signer(
                    program.clone(),
                    Transfer { from: vault.clone(), to, authority: authority.clone() },
                    signer,
                ),
                value,
            )?;
        }

        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.trainer.to_account_info(),
                authority: ctx.accounts.channel.to_account_info(),
            },
            signer,
        ))?;

        emit!(Settled {
            channel: ctx.accounts.channel.key(),
            gym: gym_key,
            grader: ctx.accounts.grader.key(),
            amount,
            leader,
            contributors,
            platform,
            refund,
        });
        Ok(())
    }

    /// If no grader settles before the channel expires, the trainer takes everything back.
    pub fn reclaim(ctx: Context<Reclaim>) -> Result<()> {
        let channel = &ctx.accounts.channel;
        let now = Clock::get()?.unix_timestamp;
        require!(now >= channel.expires_at, ModelmonError::ChannelStillOpen);
        let gym_key = channel.gym;
        let trainer_key = channel.trainer;
        let nonce = channel.nonce.to_le_bytes();
        let seeds: &[&[u8]] = &[b"channel", gym_key.as_ref(), trainer_key.as_ref(), &nonce, &[channel.bump]];
        let signer = &[seeds];
        let balance = ctx.accounts.vault.amount;
        if balance > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.trainer_token.to_account_info(),
                        authority: ctx.accounts.channel.to_account_info(),
                    },
                    signer,
                ),
                balance,
            )?;
        }
        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.trainer.to_account_info(),
                authority: ctx.accounts.channel.to_account_info(),
            },
            signer,
        ))?;
        emit!(Reclaimed { channel: ctx.accounts.channel.key(), amount: balance });
        Ok(())
    }

    /// A sealed-test score (badge) or a before/after improvement record.
    #[allow(clippy::too_many_arguments)]
    pub fn record_result(
        ctx: Context<RecordResult>,
        run_id: [u8; 16],
        kind: u8,
        model_before: [u8; 32],
        model_after: [u8; 32],
        before_bps: u16,
        after_bps: u16,
        ci_bps: u16,
        heldout_n: u16,
        reps: u64,
        cost: u64,
    ) -> Result<()> {
        require!(kind <= RESULT_EVOLUTION, ModelmonError::BadArgument);
        require!(before_bps as u64 <= BPS && after_bps as u64 <= BPS, ModelmonError::BadArgument);
        require_verified(
            &ctx.accounts.config,
            &ctx.accounts.grader_record.to_account_info(),
            &ctx.accounts.grader.key(),
        )?;
        let r = &mut ctx.accounts.result;
        r.gym = ctx.accounts.gym.key();
        r.grader = ctx.accounts.grader.key();
        r.grader_version = ctx.accounts.gym.grader_version;
        r.run_id = run_id;
        r.kind = kind;
        r.model_before = model_before;
        r.model_after = model_after;
        r.before_bps = before_bps;
        r.after_bps = after_bps;
        r.ci_bps = ci_bps;
        r.heldout_n = heldout_n;
        r.reps = reps;
        r.cost = cost;
        r.recorded_at = Clock::get()?.unix_timestamp;
        r.bump = ctx.bumps.result;
        emit!(ResultRecorded { result: r.key(), gym: r.gym, kind, before_bps, after_bps });
        Ok(())
    }
}

/* ---------- Checks ---------- */

/// The one gate: the signer must have a live grader record for approved code.
/// The record is read manually so a missing record fails with a clear error
/// instead of a generic "account not initialized".
fn require_verified(config: &Config, record_info: &AccountInfo, signer: &Pubkey) -> Result<()> {
    if record_info.owner != &crate::ID || record_info.data_is_empty() {
        return err!(ModelmonError::GraderNotVerified);
    }
    let data = record_info.try_borrow_data()?;
    let record = GraderRecord::try_deserialize(&mut &data[..]).map_err(|_| error!(ModelmonError::GraderNotVerified))?;
    require_keys_eq!(record.grader, *signer, ModelmonError::GraderNotVerified);
    require!(config.approved.contains(&record.code_hash), ModelmonError::GraderNotVerified);
    require!(record.expires_at > Clock::get()?.unix_timestamp, ModelmonError::GraderRecordExpired);
    Ok(())
}

/// Checks that the previous instruction is the Ed25519 precompile verifying the
/// trainer's signature over VOUCHER_DOMAIN || channel || amount (u64 LE).
/// The precompile itself fails the whole transaction if the signature is bad.
fn verify_voucher(ixs: &AccountInfo, trainer: &Pubkey, channel: &Pubkey, amount: u64) -> Result<()> {
    let current = ix_sysvar::load_current_index_checked(ixs)?;
    require!(current > 0, ModelmonError::VoucherMissing);
    let ix = ix_sysvar::load_instruction_at_checked((current - 1) as usize, ixs)?;
    require_keys_eq!(ix.program_id, ED25519_PROGRAM_ID, ModelmonError::VoucherMissing);
    let d = &ix.data;
    require!(d.len() >= 16 && d[0] == 1, ModelmonError::VoucherInvalid);
    let rd = |o: usize| u16::from_le_bytes([d[o], d[o + 1]]);
    let (pk_off, pk_ix) = (rd(6) as usize, rd(8));
    let (msg_off, msg_len, msg_ix) = (rd(10) as usize, rd(12) as usize, rd(14));
    let sig_ix = rd(4);
    // All three parts must live in the precompile instruction itself.
    require!(sig_ix == u16::MAX && pk_ix == u16::MAX && msg_ix == u16::MAX, ModelmonError::VoucherInvalid);
    let pk = d.get(pk_off..pk_off + 32).ok_or(ModelmonError::VoucherInvalid)?;
    require!(pk == trainer.as_ref(), ModelmonError::VoucherWrongSigner);
    let mut expected = Vec::with_capacity(VOUCHER_DOMAIN.len() + 40);
    expected.extend_from_slice(VOUCHER_DOMAIN);
    expected.extend_from_slice(channel.as_ref());
    expected.extend_from_slice(&amount.to_le_bytes());
    let msg = d.get(msg_off..msg_off + msg_len).ok_or(ModelmonError::VoucherInvalid)?;
    require!(msg == expected.as_slice(), ModelmonError::VoucherWrongMessage);
    Ok(())
}

fn mul_bps(amount: u64, bps: u16) -> Result<u64> {
    let v = (amount as u128) * (bps as u128) / (BPS as u128);
    u64::try_from(v).map_err(|_| error!(ModelmonError::BadArgument))
}

/* ---------- Accounts ---------- */

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub attestation_authority: Pubkey,
    pub mint: Pubkey,
    pub treasury: Pubkey,
    #[max_len(8)]
    pub approved: Vec<[u8; 32]>,
    pub pending_hash: [u8; 32],
    pub pending_effective_at: i64,
    pub has_pending: bool,
    pub timelock_secs: i64,
    /// Devnet only: accept graders with no hardware report (hardware = 0).
    pub allow_unattested: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct GraderRecord {
    pub grader: Pubkey,
    /// X25519 key creators encrypt Gym bundles to.
    pub enc_key: [u8; 32],
    pub code_hash: [u8; 32],
    pub hardware: u8,
    pub source: u8,
    pub report_slot: u64,
    pub expires_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Gym {
    #[max_len(32)]
    pub gym_id: String,
    pub leader: Pubkey,
    pub leader_token: Pubkey,
    pub contributor_token: Pubkey,
    pub price_per_rep: u64,
    pub leader_bps: u16,
    pub contributor_bps: u16,
    pub platform_bps: u16,
    pub grader: Pubkey,
    pub grader_version: [u8; 32],
    pub train_tasks: u16,
    pub heldout_tasks: u16,
    pub exclusive_holder: Pubkey,
    pub exclusive_until: i64,
    pub created_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Channel {
    pub trainer: Pubkey,
    pub gym: Pubkey,
    pub nonce: u64,
    pub deposit: u64,
    pub opened_at: i64,
    pub expires_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ResultRecord {
    pub gym: Pubkey,
    pub grader: Pubkey,
    pub grader_version: [u8; 32],
    pub run_id: [u8; 16],
    pub kind: u8,
    pub model_before: [u8; 32],
    pub model_after: [u8; 32],
    pub before_bps: u16,
    pub after_bps: u16,
    pub ci_bps: u16,
    pub heldout_n: u16,
    pub reps: u64,
    pub cost: u64,
    pub recorded_at: i64,
    pub bump: u8,
}

/* ---------- Contexts ---------- */

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    pub mint: Account<'info, Mint>,
    #[account(token::mint = mint)]
    pub treasury: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = admin)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct Activate<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
#[instruction(grader: Pubkey)]
pub struct RegisterGrader<'info> {
    #[account(mut)]
    pub attestation_authority: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = attestation_authority)]
    pub config: Account<'info, Config>,
    #[account(
        init_if_needed,
        payer = attestation_authority,
        space = 8 + GraderRecord::INIT_SPACE,
        seeds = [b"grader", grader.as_ref()],
        bump
    )]
    pub grader_record: Account<'info, GraderRecord>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(gym_id: String)]
pub struct CreateGym<'info> {
    #[account(mut)]
    pub leader: Signer<'info>,
    pub grader: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    /// CHECK: read and validated in `require_verified`.
    #[account(seeds = [b"grader", grader.key().as_ref()], bump)]
    pub grader_record: UncheckedAccount<'info>,
    #[account(init, payer = leader, space = 8 + Gym::INIT_SPACE, seeds = [b"gym", gym_id.as_bytes()], bump)]
    pub gym: Box<Account<'info, Gym>>,
    #[account(token::mint = config.mint)]
    pub leader_token: Box<Account<'info, TokenAccount>>,
    #[account(token::mint = config.mint)]
    pub contributor_token: Box<Account<'info, TokenAccount>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LeaderOnly<'info> {
    pub leader: Signer<'info>,
    #[account(mut, has_one = leader)]
    pub gym: Account<'info, Gym>,
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct OpenChannel<'info> {
    #[account(mut)]
    pub trainer: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    pub gym: Box<Account<'info, Gym>>,
    #[account(address = config.mint)]
    pub mint: Box<Account<'info, Mint>>,
    #[account(mut, token::mint = mint, token::authority = trainer)]
    pub trainer_token: Box<Account<'info, TokenAccount>>,
    #[account(
        init,
        payer = trainer,
        space = 8 + Channel::INIT_SPACE,
        seeds = [b"channel", gym.key().as_ref(), trainer.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub channel: Box<Account<'info, Channel>>,
    #[account(
        init,
        payer = trainer,
        seeds = [b"vault", channel.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = channel
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(mut)]
    pub grader: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    /// CHECK: read and validated in `require_verified`.
    #[account(seeds = [b"grader", grader.key().as_ref()], bump)]
    pub grader_record: UncheckedAccount<'info>,
    #[account(address = channel.gym)]
    pub gym: Box<Account<'info, Gym>>,
    #[account(mut, close = trainer)]
    pub channel: Box<Account<'info, Channel>>,
    /// CHECK: receives the channel's and vault's rent; must be the channel's trainer.
    #[account(mut, address = channel.trainer)]
    pub trainer: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"vault", channel.key().as_ref()], bump)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = gym.leader_token)]
    pub leader_token: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = gym.contributor_token)]
    pub contributor_token: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = config.treasury)]
    pub treasury: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = config.mint, token::authority = channel.trainer)]
    pub trainer_token: Box<Account<'info, TokenAccount>>,
    /// CHECK: the instructions sysvar, checked by address.
    #[account(address = ix_sysvar::ID)]
    pub instructions: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Reclaim<'info> {
    #[account(mut, address = channel.trainer)]
    pub trainer: Signer<'info>,
    #[account(mut, close = trainer)]
    pub channel: Box<Account<'info, Channel>>,
    #[account(mut, seeds = [b"vault", channel.key().as_ref()], bump)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::authority = trainer)]
    pub trainer_token: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(run_id: [u8; 16])]
pub struct RecordResult<'info> {
    #[account(mut)]
    pub grader: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    /// CHECK: read and validated in `require_verified`.
    #[account(seeds = [b"grader", grader.key().as_ref()], bump)]
    pub grader_record: UncheckedAccount<'info>,
    pub gym: Box<Account<'info, Gym>>,
    #[account(
        init,
        payer = grader,
        space = 8 + ResultRecord::INIT_SPACE,
        seeds = [b"result", gym.key().as_ref(), run_id.as_ref()],
        bump
    )]
    pub result: Box<Account<'info, ResultRecord>>,
    pub system_program: Program<'info, System>,
}

/* ---------- Events ---------- */

#[event]
pub struct CodeHashProposed {
    pub code_hash: [u8; 32],
    pub effective_at: i64,
}
#[event]
pub struct CodeHashActivated {
    pub code_hash: [u8; 32],
}
#[event]
pub struct CodeHashRevoked {
    pub code_hash: [u8; 32],
}
#[event]
pub struct GraderRegistered {
    pub grader: Pubkey,
    pub code_hash: [u8; 32],
    pub hardware: u8,
    pub expires_at: i64,
}
#[event]
pub struct GymCreated {
    pub gym: Pubkey,
    pub grader: Pubkey,
    pub grader_version: [u8; 32],
    pub price_per_rep: u64,
}
#[event]
pub struct ExclusiveGranted {
    pub gym: Pubkey,
    pub holder: Pubkey,
    pub until: i64,
}
#[event]
pub struct ChannelOpened {
    pub channel: Pubkey,
    pub trainer: Pubkey,
    pub gym: Pubkey,
    pub deposit: u64,
}
#[event]
pub struct Settled {
    pub channel: Pubkey,
    pub gym: Pubkey,
    pub grader: Pubkey,
    pub amount: u64,
    pub leader: u64,
    pub contributors: u64,
    pub platform: u64,
    pub refund: u64,
}
#[event]
pub struct Reclaimed {
    pub channel: Pubkey,
    pub amount: u64,
}
#[event]
pub struct ResultRecorded {
    pub result: Pubkey,
    pub gym: Pubkey,
    pub kind: u8,
    pub before_bps: u16,
    pub after_bps: u16,
}

/* ---------- Errors ---------- */

#[error_code]
pub enum ModelmonError {
    #[msg("Grader not verified: no live record for this key running approved code")]
    GraderNotVerified,
    #[msg("Grader record has expired; the grader must re-attest")]
    GraderRecordExpired,
    #[msg("Grader code is not on the approved list")]
    CodeNotApproved,
    #[msg("A hardware attestation is required")]
    AttestationRequired,
    #[msg("Hardware report is tied to a slot that is too old")]
    StaleReport,
    #[msg("Approved list is full")]
    ApprovedListFull,
    #[msg("Code hash is already approved")]
    AlreadyApproved,
    #[msg("No code hash is pending")]
    NothingPending,
    #[msg("The timelock for this code hash has not passed yet")]
    TimelockActive,
    #[msg("Leader, contributor and platform shares must add up to 100%")]
    BadSplit,
    #[msg("This Gym is under an exclusive window for another trainer")]
    ExclusiveWindow,
    #[msg("Settlement amount exceeds the deposit")]
    OverDeposit,
    #[msg("Missing Ed25519 voucher check before settle")]
    VoucherMissing,
    #[msg("Malformed voucher check")]
    VoucherInvalid,
    #[msg("Voucher was not signed by the channel's trainer")]
    VoucherWrongSigner,
    #[msg("Voucher does not match this channel and amount")]
    VoucherWrongMessage,
    #[msg("Channel has not expired yet")]
    ChannelStillOpen,
    #[msg("Invalid argument")]
    BadArgument,
}
