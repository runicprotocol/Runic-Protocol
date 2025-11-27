import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // WebSocket
  wsPort: parseInt(process.env.WS_PORT || '3002', 10),
  
  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'runic-dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  
  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/runic_protocol',
  
  // Solana (simulated for now)
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    network: process.env.SOLANA_NETWORK || 'devnet',
  },
  
  // Auction settings
  auction: {
    windowMs: parseInt(process.env.AUCTION_WINDOW_MS || '15000', 10), // 15 seconds for dev
  },
  
  // Scoring weights for Rune Offers
  scoring: {
    alpha: 1.0,   // Price weight (lower is better)
    beta: 0.5,    // ETA weight (lower is better)
    gamma: 1.0,   // Reputation weight (higher is better)
    base: 10.0,   // Base score
  },
} as const;

export type Config = typeof config;

