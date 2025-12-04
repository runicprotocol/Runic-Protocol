/**
 * Real Solana Client for Runic Protocol
 * 
 * Handles actual on-chain transactions for payments.
 */

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';
import bs58 from 'bs58';

/**
 * Interface for Solana payment client
 */
export interface SolanaClient {
  sendPayment(params: {
    toPubkey: string;
    amountLamports: bigint;
    tokenMint?: string; // If undefined, send native SOL
  }): Promise<{ txHash: string }>;
  
  getBalance(pubkey: string): Promise<bigint>;
}

/**
 * Token mint addresses on Solana
 */
export const TOKEN_MINTS: Record<string, string> = {
  // Mainnet
  'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'USDT': 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  'BONK': 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  // Devnet USDC (Circle's devnet USDC)
  'USDC_DEVNET': '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
};

/**
 * RealSolanaClient - Executes actual Solana transactions
 */
export class RealSolanaClient implements SolanaClient {
  private connection: Connection;
  private treasuryKeypair: Keypair;

  constructor() {
    // Initialize connection
    this.connection = new Connection(config.solana.rpcUrl, 'confirmed');

    // Load treasury keypair from environment
    const treasuryKey = config.solana.treasuryPrivateKey;
    if (!treasuryKey) {
      throw new Error('SOLANA_TREASURY_PRIVATE_KEY is required for real transactions');
    }

    try {
      // Support both base58 and JSON array formats
      if (treasuryKey.startsWith('[')) {
        const secretKey = new Uint8Array(JSON.parse(treasuryKey));
        this.treasuryKeypair = Keypair.fromSecretKey(secretKey);
      } else {
        const secretKey = bs58.decode(treasuryKey);
        this.treasuryKeypair = Keypair.fromSecretKey(secretKey);
      }
    } catch (error) {
      throw new Error('Invalid SOLANA_TREASURY_PRIVATE_KEY format');
    }

    logger.info('RealSolanaClient initialized', {
      rpcUrl: config.solana.rpcUrl,
      network: config.solana.network,
      treasury: this.treasuryKeypair.publicKey.toBase58().slice(0, 8) + '...',
    });
  }

  /**
   * Send a payment (SOL or SPL token)
   */
  async sendPayment(params: {
    toPubkey: string;
    amountLamports: bigint;
    tokenMint?: string;
  }): Promise<{ txHash: string }> {
    const { toPubkey, amountLamports, tokenMint } = params;
    const recipient = new PublicKey(toPubkey);

    try {
      let txHash: string;

      if (!tokenMint || tokenMint === 'SOL') {
        // Native SOL transfer
        txHash = await this.sendSolPayment(recipient, amountLamports);
      } else {
        // SPL token transfer
        const mintAddress = TOKEN_MINTS[tokenMint] || tokenMint;
        txHash = await this.sendTokenPayment(recipient, amountLamports, new PublicKey(mintAddress));
      }

      logger.info('Payment sent successfully', {
        txHash,
        to: toPubkey.slice(0, 8) + '...',
        amount: amountLamports.toString(),
        token: tokenMint || 'SOL',
      });

      return { txHash };

    } catch (error) {
      logger.error('Payment failed', error as Error);
      throw error;
    }
  }

  /**
   * Send native SOL
   */
  private async sendSolPayment(recipient: PublicKey, amountLamports: bigint): Promise<string> {
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: this.treasuryKeypair.publicKey,
        toPubkey: recipient,
        lamports: amountLamports,
      })
    );

    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [this.treasuryKeypair],
      { commitment: 'confirmed' }
    );

    return signature;
  }

  /**
   * Send SPL token
   */
  private async sendTokenPayment(
    recipient: PublicKey,
    amount: bigint,
    mintAddress: PublicKey
  ): Promise<string> {
    // Get associated token accounts
    const fromAta = await getAssociatedTokenAddress(
      mintAddress,
      this.treasuryKeypair.publicKey
    );
    
    const toAta = await getAssociatedTokenAddress(
      mintAddress,
      recipient
    );

    const transaction = new Transaction();

    // Check if recipient has ATA, create if not
    try {
      await getAccount(this.connection, toAta);
    } catch (error) {
      // ATA doesn't exist, create it
      transaction.add(
        createAssociatedTokenAccountInstruction(
          this.treasuryKeypair.publicKey, // payer
          toAta,                           // associated token account
          recipient,                       // owner
          mintAddress                      // mint
        )
      );
    }

    // Add transfer instruction
    transaction.add(
      createTransferInstruction(
        fromAta,
        toAta,
        this.treasuryKeypair.publicKey,
        amount
      )
    );

    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [this.treasuryKeypair],
      { commitment: 'confirmed' }
    );

    return signature;
  }

  /**
   * Get SOL balance for an address
   */
  async getBalance(pubkey: string): Promise<bigint> {
    const balance = await this.connection.getBalance(new PublicKey(pubkey));
    return BigInt(balance);
  }

  /**
   * Get treasury public key
   */
  getTreasuryAddress(): string {
    return this.treasuryKeypair.publicKey.toBase58();
  }

  /**
   * Check treasury balance
   */
  async getTreasuryBalance(): Promise<{ sol: number; lamports: bigint }> {
    const lamports = await this.getBalance(this.treasuryKeypair.publicKey.toBase58());
    return {
      sol: Number(lamports) / LAMPORTS_PER_SOL,
      lamports,
    };
  }
}

/**
 * DummySolanaClient - Simulated payments for development
 */
export class DummySolanaClient implements SolanaClient {
  async sendPayment(params: {
    toPubkey: string;
    amountLamports: bigint;
    tokenMint?: string;
  }): Promise<{ txHash: string }> {
    const txHash = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    logger.info('[SIMULATED] Payment sent', {
      txHash,
      to: params.toPubkey.slice(0, 8) + '...',
      amount: params.amountLamports.toString(),
      token: params.tokenMint || 'SOL',
    });

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    return { txHash };
  }

  async getBalance(pubkey: string): Promise<bigint> {
    // Return fake balance
    return BigInt(1000000000); // 1 SOL
  }
}

/**
 * Create the appropriate Solana client based on configuration
 */
export function createSolanaClient(): SolanaClient {
  if (config.solana.useRealTransactions) {
    return new RealSolanaClient();
  }
  
  logger.warn('Using SIMULATED Solana client - set SOLANA_REAL_TRANSACTIONS=true for real payments');
  return new DummySolanaClient();
}






