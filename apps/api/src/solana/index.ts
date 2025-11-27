/**
 * Solana Integration Module
 * 
 * This module contains utilities and interfaces for Solana integration.
 * Currently uses simulated payments, but can be extended for real transactions.
 */

import { config } from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Validate a Solana public key (base58 format)
 */
export function isValidSolanaAddress(address: string): boolean {
  // Solana addresses are base58 encoded and 32-44 characters
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
 * Get the current Solana network configuration
 */
export function getSolanaConfig() {
  return {
    rpcUrl: config.solana.rpcUrl,
    network: config.solana.network,
  };
}

/**
 * Log a simulated Solana transaction
 */
export function logSimulatedTransaction(params: {
  type: 'payment' | 'refund' | 'transfer';
  from: string;
  to: string;
  amount: bigint;
  tokenMint?: string;
  txHash: string;
}): void {
  logger.info(`🎭 [SIMULATED TX] ${params.type.toUpperCase()}`, {
    from: params.from.slice(0, 8) + '...',
    to: params.to.slice(0, 8) + '...',
    amount: `${lamportsToSol(params.amount)} SOL (${params.amount} lamports)`,
    token: params.tokenMint || 'SOL',
    txHash: params.txHash,
  });
}

/**
 * Interface for future real Solana integration
 */
export interface SolanaTransaction {
  signature: string;
  slot: number;
  blockTime?: number;
  err: null | object;
}

/**
 * Future: Connect to Solana RPC
 * This is a placeholder for real Solana integration
 */
export async function connectToSolana(): Promise<void> {
  logger.info(`Solana integration configured for ${config.solana.network}`);
  logger.info(`RPC URL: ${config.solana.rpcUrl}`);
  logger.warn('⚠️ Payments are currently SIMULATED - not connected to real Solana RPC');
}

