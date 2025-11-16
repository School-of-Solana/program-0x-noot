const anchor = require("@coral-xyz/anchor");
const { PublicKey, SystemProgram } = anchor.web3;
const fs = require("fs");
const path = require("path");

// config
const PROGRAM_ID = new PublicKey("C6SPbDMn2awX4T6qf9Bk2R3bbiwCZMAM1or6EKMMkiMS");

// addies
const REWARD_MINT = new PublicKey("9yq7Vrqy91Pv6t8j1v8dWt8GsCvcT2KJYe7boNoE4Qq4");
const GAME_CONFIG_PDA = new PublicKey("J8cBa9Yt56eWruiJQYoFCn3bvqwVwoyQ9rx32QnpzCiY");
const REWARD_VAULT = new PublicKey("9mNjLh3D3zCaaBjqtJmMhxezPqh4V54q2omzsj8phAtA");

// To be tweaked
const ENTRY_FEE_LAMPORTS = new anchor.BN(1_000_000_000); // 1 SOL
const BASE_RATE = new anchor.BN(10);                      // 10 score per interval
const INTERVAL_SECONDS = new anchor.BN(60);               // 60s per interval
const MILESTONE_SCORE = new anchor.BN(1000);              // need 1000 score
const REWARD_PER_MILESTONE = new anchor.BN(1_000_000_000_000); // 1000 tokens

async function main() {
  
  const walletKeypairPath = "/home/noot/.config/solana/id.json";
  const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(walletKeypairPath, "utf8")));
  const walletKeypair = anchor.web3.Keypair.fromSecretKey(secretKey);

  const connection = new anchor.web3.Connection("https://api.devnet.solana.com", "confirmed");
  const wallet = new anchor.Wallet(walletKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);

  
  const idlPath = path.join(__dirname, "..", "target", "idl", "idle_miner.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));

  const program = new anchor.Program(idl, PROGRAM_ID, provider);

  console.log("Admin wallet:", wallet.publicKey.toBase58());
  console.log("Program ID:", program.programId.toBase58());
  console.log("GameConfig PDA:", GAME_CONFIG_PDA.toBase58());
  console.log("Reward mint:", REWARD_MINT.toBase58());
  console.log("Reward vault:", REWARD_VAULT.toBase58());

  
  const txSig = await program.methods
    .initializeGame(
      ENTRY_FEE_LAMPORTS,
      BASE_RATE,
      INTERVAL_SECONDS,
      MILESTONE_SCORE,
      REWARD_PER_MILESTONE
    )
    .accounts({
      admin: wallet.publicKey,
      gameConfig: GAME_CONFIG_PDA,
      rewardMint: REWARD_MINT,
      rewardVault: REWARD_VAULT,
      systemProgram: SystemProgram.programId,
      tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log("initialize_game tx:", txSig);

  
  const config = await program.account.gameConfig.fetch(GAME_CONFIG_PDA);
  console.log("GameConfig created:");
  console.log("  admin:", config.admin.toBase58());
  console.log("  entry_fee_lamports:", config.entryFeeLamports.toString());
  console.log("  base_rate:", config.baseRate.toString());
  console.log("  interval_seconds:", config.intervalSeconds.toString());
  console.log("  milestone_score:", config.milestoneScore.toString());
  console.log("  reward_per_milestone:", config.rewardPerMilestone.toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
