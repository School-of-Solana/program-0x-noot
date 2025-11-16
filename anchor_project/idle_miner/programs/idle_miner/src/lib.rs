use anchor_lang::prelude::*;

pub mod states;
pub mod errors;
pub mod instructions;

use instructions::*;
//token_mint = 9yq7Vrqy91Pv6t8j1v8dWt8GsCvcT2KJYe7boNoE4Qq4
//GameConfig PDA: J8cBa9Yt56eWruiJQYoFCn3bvqwVwoyQ9rx32QnpzCiY
//reward vault account: 9mNjLh3D3zCaaBjqtJmMhxezPqh4V54q2omzsj8phAtA
declare_id!("C6SPbDMn2awX4T6qf9Bk2R3bbiwCZMAM1or6EKMMkiMS"); 

#[program]
pub mod idle_miner {
    use super::*;

    pub fn initialize_game(
        ctx: Context<InitializeGame>,
        entry_fee_lamports: u64,
        base_rate: u64,
        interval_seconds: i64,
        milestone_score: u64,
        reward_per_milestone: u64,
    ) -> Result<()> {
        instructions::initialize_game::handle(
            ctx,
            entry_fee_lamports,
            base_rate,
            interval_seconds,
            milestone_score,
            reward_per_milestone,
        )
    }

    pub fn create_player(ctx: Context<CreatePlayer>) -> Result<()> {
        instructions::create_player::handle(ctx)
    }

    pub fn claim_reward(ctx: Context<ClaimReward>) -> Result<()> {
        instructions::claim_reward::handle(ctx)
    }

    pub fn upgrade_miner(ctx: Context<UpgradeMiner>) -> Result<()> {
        instructions::upgrade_miner::handle(ctx)
    }
}
