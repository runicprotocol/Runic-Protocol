import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
// Also try loading from api directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // CORS - Allow multiple origins separated by commas
  allowedOrigins: process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : (process.env.NODE_ENV === 'production' ? [] : ['*']), // Empty array in production requires explicit config
  
  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'runic-dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  
  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/runic_protocol',
  
  // Solana Configuration
  solana: {
    // RPC endpoint
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    
    // Network: 'mainnet-beta', 'devnet', or 'testnet'
    network: process.env.SOLANA_NETWORK || 'devnet',
    
    // Treasury wallet private key (base58 or JSON array)
    treasuryPrivateKey: process.env.SOLANA_TREASURY_PRIVATE_KEY,
    
    // Enable real transactions (false = simulated)
    useRealTransactions: process.env.SOLANA_REAL_TRANSACTIONS === 'true',
  },
  
  // Auction settings
  auction: {
    windowMs: parseInt(process.env.AUCTION_WINDOW_MS || '15000', 10), // 15 seconds for dev
  },
  
  // Scoring weights for Offers
  scoring: {
    alpha: 1.0,   // Price weight (lower is better)
    beta: 0.5,    // ETA weight (lower is better)
    gamma: 1.0,   // Reputation weight (higher is better)
    base: 100.0,  // Base score
  },
  
  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10), // 100 requests per window
  },
} as const;

export type Config = typeof config;
