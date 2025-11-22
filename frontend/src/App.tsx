import React, { useCallback, useMemo, useState } from "react";
import "./App.css";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { Buffer } from "buffer";
import {
  IDLE_MINER_PROGRAM_ID,
  GAME_CONFIG_PDA,
  REWARD_MINT,
  REWARD_VAULT,
} from "./config";
import { useIdleMinerProgram } from "./useIdleMinerProgram";


const CREATE_PLAYER_DISCRIMINATOR = Buffer.from([
  19, 178, 189, 216, 159, 134, 0, 192,
]);

const CLAIM_REWARD_DISCRIMINATOR = Buffer.from([
  149, 95, 181, 242, 94, 90, 158, 162,
]);

const UPGRADE_MINER_DISCRIMINATOR = Buffer.from([
  93, 174, 185, 203, 165, 148, 94, 13,
]);


function derivePlayerPda(authority: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("player"), authority.toBuffer()],
    IDLE_MINER_PROGRAM_ID
  );
  return pda;
}

// --- Short number formatter (1.2K, 3.4M, etc.) ---
function formatNumberShort(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);

  if (abs >= 1_000_000_000) {
    return (value / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
  }
  if (abs >= 1_000_000) {
    return (value / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (abs >= 1_000) {
    return (value / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  }
  return value.toString();
}

// --- Player account TypeScript shape ---
type PlayerInfo = {
  score: number;
  miningRate: number;
  miners: number;
  lastUpdateTs: number;
};

// --- GameConfig account shape (UI subset) ---
type GameConfigInfo = {
  entryFeeLamports: number;
  baseRate: number;
  intervalSeconds: number;
  milestoneScore: number;
  rewardPerMilestone: number;
};

// --- Manual decoder for Player account data ---
function decodePlayerAccount(data: Buffer): PlayerInfo {
  const buf = Buffer.from(data);

  // 8 (disc) + 32 (authority) + 8 + 8 + 8 + 4 + 1 = 69 bytes minimum
  const MIN_LEN = 8 + 32 + 8 + 8 + 8 + 4 + 1;
  if (buf.length < MIN_LEN) {
    throw new Error(`Player account data too short: ${buf.length} bytes`);
  }

  let offset = 8; // skip discriminator

  // authority (Pubkey)
  offset += 32;

  // score: u64
  const score = Number((buf as any).readBigUInt64LE(offset));
  offset += 8;

  // mining_rate: u64
  const miningRate = Number((buf as any).readBigUInt64LE(offset));
  offset += 8;

  // last_update_ts: i64
  const lastUpdateTs = Number((buf as any).readBigInt64LE(offset));
  offset += 8;

  // miners: u32
  const miners = buf.readUInt32LE(offset);
  offset += 4;

  // bump: u8 (ignored)
  return { score, miningRate, miners, lastUpdateTs };
}

// --- Manual decoder for GameConfig account data ---
function decodeGameConfigAccount(data: Buffer): GameConfigInfo {
  const buf = Buffer.from(data);

  // 8 (disc) + 32 (admin) + 5*8 + 2*32 + 1 = 145 bytes minimum
  const MIN_LEN = 8 + 32 + 5 * 8 + 2 * 32 + 1;
  if (buf.length < MIN_LEN) {
    throw new Error(`GameConfig account data too short: ${buf.length} bytes`);
  }

  let offset = 8; // skip discriminator

  // admin pubkey
  offset += 32;

  const entryFeeLamports = Number((buf as any).readBigUInt64LE(offset));
  offset += 8;

  const baseRate = Number((buf as any).readBigUInt64LE(offset));
  offset += 8;

  const intervalSeconds = Number((buf as any).readBigInt64LE(offset));
  offset += 8;

  const milestoneScore = Number((buf as any).readBigUInt64LE(offset));
  offset += 8;

  const rewardPerMilestone = Number((buf as any).readBigUInt64LE(offset));
  offset += 8;

  // reward_mint pubkey
  offset += 32;
  // reward_vault pubkey
  offset += 32;
  // bump: u8 (ignored)

  return {
    entryFeeLamports,
    baseRate,
    intervalSeconds,
    milestoneScore,
    rewardPerMilestone,
  };
}

// Allow bigger multi-claim / multi-upgrade batches
const MAX_BATCH = 50;

// --- Simple animated SVG miner avatar ---
const MinerSvg: React.FC = () => (
  <svg
    className="miner-svg"
    viewBox="0 0 64 64"
    aria-hidden="true"
    role="img"
  >
    {/* Helmet */}
    <g className="miner-svg-helmet">
      <rect x="16" y="14" width="32" height="12" rx="6" />
      <circle cx="32" cy="20" r="6" />
    </g>

    {/* Face */}
    <g className="miner-svg-face">
      <rect x="20" y="24" width="24" height="18" rx="8" />
      <circle cx="26" cy="30" r="2" />
      <circle cx="38" cy="30" r="2" />
      <rect x="28" y="34" width="8" height="2" rx="1" />
    </g>

    {/* Body */}
    <g className="miner-svg-body">
      <rect x="22" y="40" width="20" height="14" rx="6" />
      <rect x="22" y="54" width="6" height="6" rx="2" />
      <rect x="36" y="54" width="6" height="6" rx="2" />
    </g>

    {/* Pickaxe */}
    <g className="miner-svg-pickaxe">
      <rect x="44" y="12" width="4" height="26" rx="2" />
      <rect x="40" y="10" width="12" height="4" rx="2" />
    </g>
  </svg>
);

const App: React.FC = () => {
  const { connection, wallet } = useIdleMinerProgram();
  const [status, setStatus] = useState<string>("");
  const [playerInfo, setPlayerInfo] = useState<PlayerInfo | null>(null);
  const [gameConfig, setGameConfig] = useState<GameConfigInfo | null>(null);
  const [loadingPlayer, setLoadingPlayer] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [creatingAta, setCreatingAta] = useState(false);

  const [claimCount, setClaimCount] = useState<number>(1);
  const [upgradeCount, setUpgradeCount] = useState<number>(1);

  const [showUpgradeFx, setShowUpgradeFx] = useState(false);
  const [showRewardFx, setShowRewardFx] = useState(false);

  const walletPubkey = wallet.publicKey;
  const playerPda = useMemo(
    () => (walletPubkey ? derivePlayerPda(walletPubkey) : null),
    [walletPubkey]
  );

  // --- Fetch GameConfig from chain and decode it ---
  const refreshGameConfig = useCallback(async () => {
    if (!connection) return;
    try {
      setLoadingConfig(true);
      const accInfo = await connection.getAccountInfo(GAME_CONFIG_PDA);
      if (!accInfo) {
        setGameConfig(null);
        setStatus(
          "Game config not found on-chain. Did you run the initialize_game script on devnet?"
        );
        return;
      }
      const decoded = decodeGameConfigAccount(Buffer.from(accInfo.data));
      setGameConfig(decoded);
    } catch (err: any) {
      console.error("refreshGameConfig error", err);
      setStatus(
        `Failed to fetch GameConfig: ${err?.message ?? JSON.stringify(err)}`
      );
    } finally {
      setLoadingConfig(false);
    }
  }, [connection]);

  // --- Fetch player account from chain and decode it ---
  const refreshPlayer = useCallback(async () => {
    if (!connection || !wallet || !wallet.publicKey) {
      setStatus("Connect your wallet first.");
      return;
    }

    try {
      setLoadingPlayer(true);
      const player = derivePlayerPda(wallet.publicKey);
      const accInfo = await connection.getAccountInfo(player);

      if (!accInfo) {
        setPlayerInfo(null);
        setStatus(
          "No miner found on-chain. Click 'Create miner' to start mining."
        );
        return;
      }

      const decoded = decodePlayerAccount(Buffer.from(accInfo.data));
      setPlayerInfo(decoded);
      setStatus("Loaded player account from chain ✅");
    } catch (err: any) {
      console.error("refreshPlayer error", err);
      setStatus(
        `Failed to fetch player account: ${err?.message ?? JSON.stringify(
          err
        )}`
      );
    } finally {
      setLoadingPlayer(false);
    }
  }, [connection, wallet]);

  // Refresh both config and player
  const refreshAll = useCallback(async () => {
    await refreshGameConfig();
    await refreshPlayer();
  }, [refreshGameConfig, refreshPlayer]);

  // --- Ensure reward ATA exists for the connected wallet ---
  const ensureRewardAta = useCallback(async (): Promise<PublicKey> => {
    if (!connection || !wallet || !wallet.publicKey) {
      throw new Error("Wallet not connected");
    }

    const owner = wallet.publicKey;
    const ata = getAssociatedTokenAddressSync(REWARD_MINT, owner);

    // Check if ATA already exists
    const info = await connection.getAccountInfo(ata);
    if (info) {
      return ata;
    }

    // Create ATA via a transaction
    setCreatingAta(true);
    try {
      setStatus("Creating reward token account (ATA) for your wallet...");

      const ix = createAssociatedTokenAccountInstruction(
        owner, // payer
        ata, // ATA account
        owner, // owner of ATA
        REWARD_MINT // reward mint
      );

      const tx = new Transaction().add(ix);
      const sig = await wallet.sendTransaction(tx, connection);
      setStatus(`Create ATA tx sent: ${sig}`);
      await connection.confirmTransaction(sig, "confirmed");
      setStatus(`Reward token account created ✅\nSignature: ${sig}`);

      return ata;
    } catch (err: any) {
      console.error("ensureRewardAta error", err);
      if (err?.message?.includes("User rejected")) {
        throw new Error("User rejected ATA creation in wallet.");
      }
      throw err;
    } finally {
      setCreatingAta(false);
    }
  }, [connection, wallet]);

  // --- create_player instruction ---
  const handleCreatePlayer = useCallback(async () => {
    if (!connection || !wallet || !wallet.publicKey) {
      setStatus("Connect your wallet first.");
      return;
    }

    try {
      setStatus("Sending create_player transaction...");

      const player = derivePlayerPda(wallet.publicKey);

      const ix = new TransactionInstruction({
        programId: IDLE_MINER_PROGRAM_ID,
        keys: [
          {
            pubkey: wallet.publicKey,
            isSigner: true,
            isWritable: true,
          },
          {
            pubkey: GAME_CONFIG_PDA,
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey: player,
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
        ],
        data: CREATE_PLAYER_DISCRIMINATOR,
      });

      const tx = new Transaction().add(ix);
      const sig = await wallet.sendTransaction(tx, connection);
      setStatus(`Create player tx sent: ${sig}`);
      await connection.confirmTransaction(sig, "confirmed");
      setStatus(`Create player confirmed ✅\nSignature: ${sig}`);

      // Load the new player account into UI
      await refreshPlayer();
    } catch (err: any) {
      console.error("create_player error", err);
      if (err?.message?.includes("User rejected")) {
        setStatus("Create player cancelled in wallet ❌");
      } else {
        setStatus(
          `Create player failed: ${err?.message ?? JSON.stringify(err)}`
        );
      }
    }
  }, [connection, wallet, refreshPlayer]);

  // --- claim_reward instruction (with batching) ---
  const handleClaimReward = useCallback(async () => {
    if (!connection || !wallet || !wallet.publicKey) {
      setStatus("Connect your wallet first.");
      return;
    }

    if (!playerInfo) {
      setStatus("You need a miner before claiming rewards.");
      return;
    }

    try {
      const times = Math.min(Math.max(claimCount, 1), MAX_BATCH);

      setStatus(
        `Ensuring reward token account exists, then claiming reward x${times}...`
      );
      const playerTokenAccount = await ensureRewardAta();

      const player = derivePlayerPda(wallet.publicKey);

      const baseIxArgs = {
        programId: IDLE_MINER_PROGRAM_ID,
        keys: [
          {
            pubkey: wallet.publicKey,
            isSigner: true,
            isWritable: true,
          },
          {
            pubkey: GAME_CONFIG_PDA,
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey: player,
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey: REWARD_VAULT,
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey: playerTokenAccount,
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey: TOKEN_PROGRAM_ID,
            isSigner: false,
            isWritable: false,
          },
        ],
        data: CLAIM_REWARD_DISCRIMINATOR,
      };

      const tx = new Transaction();
      for (let i = 0; i < times; i++) {
        tx.add(new TransactionInstruction(baseIxArgs));
      }

      const sig = await wallet.sendTransaction(tx, connection);
      setStatus(`Claim reward x${times} tx sent: ${sig}`);
      await connection.confirmTransaction(sig, "confirmed");
      setStatus(`Claim reward x${times} confirmed ✅\nSignature: ${sig}`);

      // Fireworks effect anchored to the avatar
      setShowRewardFx(true);
      setTimeout(() => setShowRewardFx(false), 1200);

      // Refresh player to see updated score (should go down after claim)
      await refreshPlayer();
    } catch (err: any) {
      console.error("claim_reward error", err);
      if (err?.message?.includes("User rejected")) {
        setStatus("Claim reward cancelled in wallet ❌");
      } else if (
        err?.message?.includes("0x1771") ||
        err?.message?.includes("6001")
      ) {
        setStatus(
          "Claim reward failed: Insufficient score on-chain. Try fewer claims or wait longer."
        );
      } else if (err?.message?.includes("User rejected ATA creation")) {
        setStatus("Claim reward aborted: ATA creation rejected in wallet ❌");
      } else {
        setStatus(
          `Claim reward failed: ${err?.message ?? JSON.stringify(err)}`
        );
      }
    }
  }, [
    connection,
    wallet,
    ensureRewardAta,
    refreshPlayer,
    playerInfo,
    claimCount,
  ]);

  // --- upgrade_miner instruction (with batching) ---
  const handleUpgradeMiner = useCallback(async () => {
    if (!connection || !wallet || !wallet.publicKey) {
      setStatus("Connect your wallet first.");
      return;
    }

    if (!playerInfo) {
      setStatus("You need a miner before upgrading.");
      return;
    }

    try {
      const times = Math.min(Math.max(upgradeCount, 1), MAX_BATCH);

      setStatus(`Sending upgrade_miner x${times} transaction...`);

      const player = derivePlayerPda(wallet.publicKey);

      const baseIxArgs = {
        programId: IDLE_MINER_PROGRAM_ID,
        keys: [
          {
            pubkey: wallet.publicKey,
            isSigner: true,
            isWritable: false,
          },
          {
            pubkey: GAME_CONFIG_PDA,
            isSigner: false,
            isWritable: false,
          },
          {
            pubkey: player,
            isSigner: false,
            isWritable: true,
          },
        ],
        data: UPGRADE_MINER_DISCRIMINATOR,
      };

      const tx = new Transaction();
      for (let i = 0; i < times; i++) {
        tx.add(new TransactionInstruction(baseIxArgs));
      }

      const sig = await wallet.sendTransaction(tx, connection);
      setStatus(`Upgrade miner x${times} tx sent: ${sig}`);
      await connection.confirmTransaction(sig, "confirmed");
      setStatus(`Upgrade miner x${times} confirmed ✅\nSignature: ${sig}`);

      // Sparkle effect anchored to the avatar
      setShowUpgradeFx(true);
      setTimeout(() => setShowUpgradeFx(false), 1200);

      // Refresh player to see new mining rate/score
      await refreshPlayer();
    } catch (err: any) {
      console.error("upgrade_miner error", err);
      if (err?.message?.includes("User rejected")) {
        setStatus("Upgrade miner cancelled in wallet ❌");
      } else if (
        err?.message?.includes("0x1771") ||
        err?.message?.includes("6001")
      ) {
        setStatus(
          "Upgrade miner failed: Insufficient score on-chain. Try fewer upgrades or wait longer."
        );
      } else {
        setStatus(
          `Upgrade miner failed: ${err?.message ?? JSON.stringify(err)}`
        );
      }
    }
  }, [connection, wallet, refreshPlayer, playerInfo, upgradeCount]);

  // --- Derived UI values ---
  const level = playerInfo ? Math.max(playerInfo.miners, 1) : 0;
  const milestoneScore = gameConfig?.milestoneScore ?? null;
  const progressToNext =
    playerInfo && milestoneScore
      ? Math.min(playerInfo.score / milestoneScore, 1)
      : 0;
  const missingForNext =
    playerInfo && milestoneScore
      ? Math.max(milestoneScore - playerInfo.score, 0)
      : null;

  const entryFeeSol =
    gameConfig && gameConfig.entryFeeLamports
      ? gameConfig.entryFeeLamports / LAMPORTS_PER_SOL
      : null;

  const handleClaimCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = parseInt(e.target.value, 10);
    if (Number.isNaN(v)) v = 1;
    if (v < 1) v = 1;
    if (v > MAX_BATCH) v = MAX_BATCH;
    setClaimCount(v);
  };

  const handleUpgradeCountChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    let v = parseInt(e.target.value, 10);
    if (Number.isNaN(v)) v = 1;
    if (v < 1) v = 1;
    if (v > MAX_BATCH) v = MAX_BATCH;
    setUpgradeCount(v);
  };

  return (
    <div className="app-root">
      <div className="app">
        <header className="game-header">
          <div>
            <h1 className="game-title">⛏️ Idle Miner</h1>
            <p className="game-subtitle">
              Mine points over time, upgrade your rig, and claim token rewards.
            </p>
          </div>
          <WalletMultiButton />
        </header>

        {!wallet.connected ? (
          <p className="info center">
            Connect your wallet to spawn your first miner.
          </p>
        ) : (
          <main className="game-main">
            {/* Left side: Miner card / status */}
            <section className="miner-section">
              <div className="miner-card">
                {playerInfo ? (
                  <>
                    <div className="miner-avatar-wrapper">
                      <div className="miner-avatar">
                        <div className="miner-avatar-inner">
                          <MinerSvg />
                        </div>

                        {showUpgradeFx && (
                          <div className="fx fx-upgrade">
                            <div className="sparkles">
                              <span>✨</span>
                              <span>✨</span>
                              <span>✨</span>
                            </div>
                          </div>
                        )}
                        {showRewardFx && (
                          <div className="fx fx-reward">
                            <div className="burst">🎆</div>
                          </div>
                        )}
                      </div>

                      <div className="miner-level">
                        <span>Level</span>
                        <strong>{level}</strong>
                      </div>
                    </div>

                    <div className="miner-stats">
                      <div className="stat-row">
                        <span className="stat-label">Score</span>
                        <span className="stat-value">
                          {formatNumberShort(playerInfo.score)}
                        </span>
                      </div>
                      <div className="stat-row">
                        <span className="stat-label">Mining rate</span>
                        <span className="stat-value">
                          {formatNumberShort(playerInfo.miningRate)} pts /
                          interval
                        </span>
                      </div>
                      {gameConfig && (
                        <div className="stat-row">
                          <span className="stat-label">Milestone score</span>
                          <span className="stat-value">
                            {formatNumberShort(gameConfig.milestoneScore)}
                          </span>
                        </div>
                      )}
                    </div>

                    {milestoneScore && (
                      <div className="progress-wrapper">
                        <div className="progress-label">
                          Progress to next reward
                        </div>
                        <div className="progress-bar">
                          <div
                            className="progress-fill"
                            style={{ width: `${progressToNext * 100}%` }}
                          />
                        </div>
                        <div className="progress-meta">
                          {missingForNext !== null &&
                            `${formatNumberShort(
                              missingForNext
                            )} pts until next claim`}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="miner-empty">
                    <div className="miner-avatar ghost">
                      <span className="miner-emoji">💤</span>
                    </div>
                    <p>No miner yet.</p>
                    <p className="hint">
                      Click <strong>Create miner</strong> to start mining.
                    </p>
                  </div>
                )}
              </div>

              <div className="wallet-info">
                <div>
                  <span className="label">Wallet</span>
                  <code className="value">
                    {wallet.publicKey?.toBase58().slice(0, 4)}...
                    {wallet.publicKey?.toBase58().slice(-4)}
                  </code>
                </div>
                <div>
                  <span className="label">Player PDA</span>
                  <code className="value">
                    {playerPda
                      ? playerPda.toBase58().slice(0, 6) +
                        "..." +
                        playerPda.toBase58().slice(-4)
                      : "—"}
                  </code>
                </div>
              </div>
            </section>

            {/* Right side: actions + config */}
            <section className="actions-section">
              <div className="card">
                <h2>Actions</h2>
                <div className="actions-grid">
                  {!playerInfo && (
                    <button
                      className="btn primary"
                      onClick={handleCreatePlayer}
                      disabled={!wallet.connected}
                    >
                      Create miner
                    </button>
                  )}

                  <button
                    className="btn success"
                    onClick={handleClaimReward}
                    disabled={!wallet.connected || !playerInfo || creatingAta}
                  >
                    Claim reward x{claimCount}
                  </button>

                  <button
                    className="btn warning"
                    onClick={handleUpgradeMiner}
                    disabled={!wallet.connected || !playerInfo}
                  >
                    Upgrade miner x{upgradeCount}
                  </button>

                  <button
                    className="btn ghost full"
                    onClick={refreshAll}
                    disabled={loadingPlayer || loadingConfig}
                  >
                    {loadingPlayer || loadingConfig
                      ? "Refreshing..."
                      : "Refresh from chain"}
                  </button>
                </div>

                <div className="count-row">
                  <label>
                    Claim times
                    <input
                      type="number"
                      min={1}
                      max={MAX_BATCH}
                      value={claimCount}
                      onChange={handleClaimCountChange}
                    />
                  </label>
                  <label>
                    Upgrade times
                    <input
                      type="number"
                      min={1}
                      max={MAX_BATCH}
                      value={upgradeCount}
                      onChange={handleUpgradeCountChange}
                    />
                  </label>
                </div>
              </div>

              <div className="card config-card">
                <h2>Game config</h2>
                {gameConfig ? (
                  <ul className="config-list">
                    <li>
                      <span>Entry fee</span>
                      <code>
                        {/*hard-code "1 SOL"*/}
                        {entryFeeSol !== null ? `${entryFeeSol} SOL` : "—"}
                      </code>
                    </li>
                    <li>
                      <span>Base mining rate</span>
                      <code>
                        {formatNumberShort(gameConfig.baseRate)} pts / interval
                      </code>
                    </li>
                    <li>
                      <span>Interval</span>
                      <code>{gameConfig.intervalSeconds} seconds</code>
                    </li>
                    <li>
                      <span>Milestone score</span>
                      <code>
                        {formatNumberShort(gameConfig.milestoneScore)}
                      </code>
                    </li>
                  </ul>
                ) : (
                  <p className="hint">
                    Click <strong>Refresh from chain</strong> to load the
                    current config.
                  </p>
                )}
              </div>
            </section>
          </main>
        )}

        {status && (
          <section className="status-panel">
            <h3>Activity</h3>
            <pre>{status}</pre>
          </section>
        )}
      </div>
    </div>
  );
};

export default App;
