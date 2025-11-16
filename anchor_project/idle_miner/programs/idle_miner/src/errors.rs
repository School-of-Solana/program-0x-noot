use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Insufficient score for this action")]
    InsufficientScore,
    #[msg("Math overflow")]
    MathOverflow,
}
