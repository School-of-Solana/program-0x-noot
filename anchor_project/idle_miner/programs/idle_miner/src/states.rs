use anchor_lang::prelude::*;

use crate::errors::ErrorCode;

#[account]
pub struct GameConfig {
    pub admin: Pubkey,
    pub entry_fee_lamports: u64,   
    pub base_rate: u64,            
    pub interval_seconds: i64,     
    pub milestone_score: u64,      
    pub reward_per_milestone: u64, 
    pub reward_mint: Pubkey,       
    pub reward_vault: Pubkey,      
    pub bump: u8,
}

impl GameConfig {
    pub const LEN: usize =
        32 + 
        8 +  
        8 +  
        8 +  
        8 +  
        8 +  
        32 + 
        32 + 
        1;   
}

#[account]
pub struct Player {
    pub authority: Pubkey,
    pub score: u64,
    pub mining_rate: u64,
    pub last_update_ts: i64,
    pub miners: u32,
    pub bump: u8,
}

impl Player {
    pub const LEN: usize =
        32 + 
        8 +  
        8 +  
        8 +  
        4 +  
        1;   

    pub fn update_score(&mut self, game_config: &GameConfig) -> Result<()> {
        let clock = Clock::get()?;
        let now = clock.unix_timestamp;

        if now <= self.last_update_ts {
            return Ok(());
        }

        let elapsed = now
            .checked_sub(self.last_update_ts)
            .ok_or(ErrorCode::MathOverflow)?;

        if game_config.interval_seconds <= 0 {
            return Ok(()); 
        }

        let intervals = elapsed / game_config.interval_seconds;

        if intervals <= 0 {
            return Ok(());
        }

        let intervals_u64 = u64::try_from(intervals).map_err(|_| ErrorCode::MathOverflow)?;

        let earned = intervals_u64
            .checked_mul(self.mining_rate)
            .ok_or(ErrorCode::MathOverflow)?;

        self.score = self.score.checked_add(earned).ok_or(ErrorCode::MathOverflow)?;

        let delta_ts = intervals
            .checked_mul(game_config.interval_seconds)
            .ok_or(ErrorCode::MathOverflow)?;

        self.last_update_ts = self
            .last_update_ts
            .checked_add(delta_ts)
            .ok_or(ErrorCode::MathOverflow)?;

        Ok(())
    }
}
