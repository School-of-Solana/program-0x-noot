import { useConnection, useWallet } from "@solana/wallet-adapter-react";

export function useIdleMinerProgram() {
  const { connection } = useConnection();
  const wallet = useWallet();

  return {
    connection,
    wallet,
  };
}
