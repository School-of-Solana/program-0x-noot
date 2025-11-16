use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};

use crate::states::GameConfig;

pub fn handle(
    ctx: Context<InitializeGame>,
    entry_fee_lamports: u64,
    base_rate: u64,
    interval_seconds: i64,
    milestone_score: u64,
    reward_per_milestone: u64,
) -> Result<()> {
    let game_config = &mut ctx.accounts.game_config;

    game_config.admin = ctx.accounts.admin.key();
    game_config.entry_fee_lamports = entry_fee_lamports;
    game_config.base_rate = base_rate;
    game_config.interval_seconds = interval_seconds;
    game_config.milestone_score = milestone_score;
    game_config.reward_per_milestone = reward_per_milestone;
    game_config.reward_mint = ctx.accounts.reward_mint.key();
    game_config.reward_vault = ctx.accounts.reward_vault.key();

    game_config.bump = ctx.bumps.game_config;

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeGame<'info> {

    #[account(mut)]
    pub admin: Signer<'info>,

  
    #[account(
        init,
        payer = admin,
        space = 8 + GameConfig::LEN,
        seeds = [b"game-config"],
        bump,
    )]
    pub game_config: Account<'info, GameConfig>,


    #[account(mut)]
    pub reward_mint: Account<'info, Mint>,


    #[account(
        mut,
        constraint = reward_vault.mint == reward_mint.key(),
    )]
    pub reward_vault: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}
