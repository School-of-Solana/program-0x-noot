use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::states::{GameConfig, Player};
use crate::errors::ErrorCode;

pub fn handle(ctx: Context<ClaimReward>) -> Result<()> {
    let game_config = &ctx.accounts.game_config;
    let player = &mut ctx.accounts.player;

    // Make sure the signer is the player authority
    require_keys_eq!(
        player.authority,
        ctx.accounts.authority.key(),
        ErrorCode::Unauthorized
    );

    // Update player's score based on time and mining rate
    player.update_score(game_config)?;

    // Check they have enough score to claim a milestone
    require!(
        player.score >= game_config.milestone_score,
        ErrorCode::InsufficientScore
    );

    // Burn one milestone's worth of score
    player.score = player
        .score
        .checked_sub(game_config.milestone_score)
        .ok_or(ErrorCode::MathOverflow)?;

    // Transfer reward tokens from vault to player's token account
    let seeds: &[&[u8]] = &[
        b"game-config",
        &[game_config.bump],
    ];
    let signer_seeds: &[&[&[u8]]] = &[seeds];

    let cpi_accounts = Transfer {
        from: ctx.accounts.reward_vault.to_account_info(),
        to: ctx.accounts.player_token_account.to_account_info(),
        authority: ctx.accounts.game_config.to_account_info(),
    };

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );

    token::transfer(cpi_ctx, game_config.reward_per_milestone)?;

    Ok(())
}

#[derive(Accounts)]
pub struct ClaimReward<'info> {
    /// Player authority (signer)
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Global game config (PDA)
    #[account(
        mut,
        seeds = [b"game-config"],
        bump = game_config.bump,
    )]
    pub game_config: Account<'info, GameConfig>,

    /// Player account (PDA)
    #[account(
        mut,
        seeds = [b"player", authority.key().as_ref()],
        bump = player.bump,
        constraint = player.authority == authority.key(),
    )]
    pub player: Account<'info, Player>,


    #[account(
        mut,
        constraint = reward_vault.mint == game_config.reward_mint,
    )]
    pub reward_vault: Account<'info, TokenAccount>,


    #[account(
        mut,
        constraint = player_token_account.mint == game_config.reward_mint,
        constraint = player_token_account.owner == authority.key(),
    )]
    pub player_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}
