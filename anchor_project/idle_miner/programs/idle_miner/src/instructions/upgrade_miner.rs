use anchor_lang::prelude::*;

use crate::states::{GameConfig, Player};
use crate::errors::ErrorCode;

pub fn handle(ctx: Context<UpgradeMiner>) -> Result<()> {
    let game_config = &ctx.accounts.game_config;
    let player = &mut ctx.accounts.player;

    require_keys_eq!(player.authority, ctx.accounts.authority.key(), ErrorCode::Unauthorized);

    player.update_score(game_config)?;

    require!(
        player.score >= game_config.milestone_score,
        ErrorCode::InsufficientScore
    );

    player.score = player
        .score
        .checked_sub(game_config.milestone_score)
        .ok_or(ErrorCode::MathOverflow)?;

    player.mining_rate = player
        .mining_rate
        .checked_mul(2)
        .ok_or(ErrorCode::MathOverflow)?;

    player.miners = player
        .miners
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;

    Ok(())
}

#[derive(Accounts)]
pub struct UpgradeMiner<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"game-config"],
        bump = game_config.bump,
    )]
    pub game_config: Account<'info, GameConfig>,

    #[account(
        mut,
        seeds = [b"player", authority.key().as_ref()],
        bump = player.bump,
        constraint = player.authority == authority.key(),
    )]
    pub player: Account<'info, Player>,
}
