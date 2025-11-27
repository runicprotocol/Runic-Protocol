/**
 * Solana Integration Module
 * 
 * Handles real and simulated Solana transactions.
 */

export {
  RealSolanaClient,
  DummySolanaClient,
  createSolanaClient,
  TOKEN_MINTS,
} from './client.js';

export type { SolanaClient } from './client.js';

import { config } from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Validate a Solana public key (base58 format)
 */
export function isValidSolanaAddress(address: string): boolean {
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Regex.test(address);
}

/**
 * Format lamports to SOL for display
 */
export function lamportsToSol(lamports: bigint | string): number {
  const value = typeof lamports === 'string' ? BigInt(lamports) : lamports;
  return Number(value) / 1_000_000_000;
}

/**
 * Format SOL to lamports
 */
export function solToLamports(sol: number): bigint {
  return BigInt(Math.floor(sol * 1_000_000_000));
}

/**
 * Get explorer URL for a transaction
 */
export function getExplorerUrl(txHash: string): string {
  const cluster = config.solana.network === 'mainnet-beta' ? '' : `?cluster=${config.solana.network}`;
  return `https://explorer.solana.com/tx/${txHash}${cluster}`;
}

/**
 * Get the current Solana network configuration
 */
export function getSolanaConfig() {
  return {
    rpcUrl: config.solana.rpcUrl,
    network: config.solana.network,
    useRealTransactions: config.solana.useRealTransactions,
  };
}
