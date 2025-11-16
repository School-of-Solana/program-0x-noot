const fs = require("fs");
const crypto = require("crypto");
const web3 = require("@solana/web3.js");

// === PROGRAM + ACCOUNTS ===
const PROGRAM_ID = new web3.PublicKey(
  "C6SPbDMn2awX4T6qf9Bk2R3bbiwCZMAM1or6EKMMkiMS"
);

const GAME_CONFIG_PDA = new web3.PublicKey(
  "J8cBa9Yt56eWruiJQYoFCn3bvqwVwoyQ9rx32QnpzCiY"
);

const REWARD_MINT = new web3.PublicKey(
  "9yq7Vrqy91Pv6t8j1v8dWt8GsCvcT2KJYe7boNoE4Qq4"
);

const REWARD_VAULT = new web3.PublicKey(
  "9mNjLh3D3zCaaBjqtJmMhxezPqh4V54q2omzsj8phAtA"
);

// === GAME PARAMS ===

const ENTRY_FEE_LAMPORTS = 1_000_000_000;

const BASE_RATE = 10;

const INTERVAL_SECONDS = 60;

const MILESTONE_SCORE = 1000;

const REWARD_PER_MILESTONE = 1_000_000_000_000n; 


function u64ToBuffer(value) {
  const v = BigInt(value);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(v);
  return buf;
}


function i64ToBuffer(value) {
  const v = BigInt(value);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(v);
  return buf;
}

function getInitializeGameData() {

  const discriminator = crypto
    .createHash("sha256")
    .update("global:initialize_game")
    .digest()
    .slice(0, 8);


  const entryFeeBuf = u64ToBuffer(ENTRY_FEE_LAMPORTS);
  const baseRateBuf = u64ToBuffer(BASE_RATE);
  const intervalBuf = i64ToBuffer(INTERVAL_SECONDS);
  const milestoneBuf = u64ToBuffer(MILESTONE_SCORE);
  const rewardBuf = u64ToBuffer(REWARD_PER_MILESTONE);

  return Buffer.concat([
    discriminator,
    entryFeeBuf,
    baseRateBuf,
    intervalBuf,
    milestoneBuf,
    rewardBuf,
  ]);
}

async function main() {
  
  const walletPath = "/home/noot/.config/solana/id.json";
  const secretKey = Uint8Array.from(
    JSON.parse(fs.readFileSync(walletPath, "utf8"))
  );
  const adminKeypair = web3.Keypair.fromSecretKey(secretKey);

  const connection = new web3.Connection(
    "https://api.devnet.solana.com",
    "confirmed"
  );

  console.log("Admin:", adminKeypair.publicKey.toBase58());
  console.log("Program ID:", PROGRAM_ID.toBase58());
  console.log("GameConfig PDA:", GAME_CONFIG_PDA.toBase58());
  console.log("Reward mint:", REWARD_MINT.toBase58());
  console.log("Reward vault:", REWARD_VAULT.toBase58());

  const ixData = getInitializeGameData();

  const ix = new web3.TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      // #[account(mut)] admin: Signer
      {
        pubkey: adminKeypair.publicKey,
        isSigner: true,
        isWritable: true,
      },
      // #[account(init, payer = admin, seeds = [b"game-config"], bump)]
      {
        pubkey: GAME_CONFIG_PDA,
        isSigner: false,
        isWritable: true,
      },
      // reward_mint: Mint (read-only)
      {
        pubkey: REWARD_MINT,
        isSigner: false,
        isWritable: false,
      },
      // reward_vault: TokenAccount (writable)
      {
        pubkey: REWARD_VAULT,
        isSigner: false,
        isWritable: true,
      },
      // system_program
      {
        pubkey: web3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
      // token_program
      {
        pubkey: new web3.PublicKey(
          "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        ),
        isSigner: false,
        isWritable: false,
      },
    ],
    data: ixData,
  });

  const tx = new web3.Transaction().add(ix);

  const sig = await web3.sendAndConfirmTransaction(connection, tx, [
    adminKeypair,
  ]);

  console.log("initialize_game tx signature:", sig);
}

main().catch((err) => {
  console.error("Error running initialize_game:", err);
  process.exit(1);
});
// output:
//Admin: HTrFXjx834sbfGMw6y1FD75xk29iJsGyfEgMPP3d34E8
//Program ID: C6SPbDMn2awX4T6qf9Bk2R3bbiwCZMAM1or6EKMMkiMS
//GameConfig PDA: J8cBa9Yt56eWruiJQYoFCn3bvqwVwoyQ9rx32QnpzCiY
//Reward mint: 9yq7Vrqy91Pv6t8j1v8dWt8GsCvcT2KJYe7boNoE4Qq4
//Reward vault: 9mNjLh3D3zCaaBjqtJmMhxezPqh4V54q2omzsj8phAtA
//initialize_game tx signature: zTnePRbvqHZYMTLnp48A8EsdwNBU9QD6NuAeKc1ZGtgf3k8o8BoDB1Yhre5Wm4WMoQ5qBwwpGxZ4f7YNUGzKHu4