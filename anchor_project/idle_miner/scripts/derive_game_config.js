const { PublicKey } = require("@solana/web3.js");

function main() {
  const programId = new PublicKey(
    "C6SPbDMn2awX4T6qf9Bk2R3bbiwCZMAM1or6EKMMkiMS" // your deployed program id
  );

  const [gameConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("game-config")],
    programId
  );

  console.log("GameConfig PDA:", gameConfigPda.toBase58());
}

main();
