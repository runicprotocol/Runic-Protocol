import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../auth/index.js';
import { getSolanaConfig, lamportsToSol } from '../solana/index.js';
import { RealSolanaClient, DummySolanaClient, createSolanaClient } from '../solana/client.js';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

const router = Router();

/**
 * GET /api/solana/status
 * 
 * Get Solana configuration and treasury status.
 */
router.get('/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const solanaConfig = getSolanaConfig();
    
    let treasuryInfo = null;
    
    if (solanaConfig.useRealTransactions) {
      try {
        const client = new RealSolanaClient();
        const balance = await client.getTreasuryBalance();
        treasuryInfo = {
          address: client.getTreasuryAddress(),
          balanceSol: balance.sol,
          balanceLamports: balance.lamports.toString(),
        };
      } catch (error) {
        logger.error('Failed to get treasury info', error as Error);
      }
    }

    res.json({
      data: {
        network: solanaConfig.network,
        rpcUrl: solanaConfig.rpcUrl,
        realTransactions: solanaConfig.useRealTransactions,
        treasury: treasuryInfo,
        supportedTokens: ['SOL', 'USDC', 'USDT', 'BONK'],
      }
    });
  } catch (error) {
    logger.error('Get Solana status error', error as Error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

/**
 * GET /api/solana/balance/:address
 * 
 * Get SOL balance for an address.
 */
router.get('/balance/:address', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const client = createSolanaClient();
    const lamports = await client.getBalance(req.params.address);
    
    res.json({
      data: {
        address: req.params.address,
        balanceSol: lamportsToSol(lamports),
        balanceLamports: lamports.toString(),
      }
    });
  } catch (error) {
    logger.error('Get balance error', error as Error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get balance' } });
  }
});

export default router;






