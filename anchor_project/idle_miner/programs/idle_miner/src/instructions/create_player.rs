use anchor_lang::prelude::*;

use crate::states::{GameConfig, Player};

pub fn handle(ctx: Context<CreatePlayer>) -> Result<()> {
    let game_config = &ctx.accounts.game_config;
    let player = &mut ctx.accounts.player;
    let authority = &ctx.accounts.authority;

    
    let fee = game_config.entry_fee_lamports;

    let ix = anchor_lang::solana_program::system_instruction::transfer(
        &authority.key(),
        &game_config.key(),
        fee,
    );

    anchor_lang::solana_program::program::invoke(
        &ix,
        &[
            authority.to_account_info(),
            ctx.accounts.game_config.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    let clock = Clock::get()?;

    player.authority = authority.key();
    player.score = 0;
    player.mining_rate = game_config.base_rate;
    player.last_update_ts = clock.unix_timestamp;
    player.miners = 1;
    player.bump = ctx.bumps.player;

    Ok(())
}

#[derive(Accounts)]
pub struct CreatePlayer<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"game-config"],
        bump = game_config.bump,
    )]
    pub game_config: Account<'info, GameConfig>,

    #[account(
        init,
        payer = authority,
        space = 8 + Player::LEN,
        seeds = [b"player", authority.key().as_ref()],
        bump,
    )]
    pub player: Account<'info, Player>,

    pub system_program: Program<'info, System>,
}
