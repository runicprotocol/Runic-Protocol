import { Router } from 'express';
import authRoutes from './auth.routes.js';
import agentRoutes from './agent.routes.js';
import taskRoutes from './task.routes.js';
import paymentRoutes from './payment.routes.js';
import solanaRoutes from './solana.routes.js';

const router = Router();

// Enhanced health check
router.get('/health', async (req, res) => {
  const health = {
    status: 'ok' as 'ok' | 'degraded' | 'down',
    service: 'runic-api',
    timestamp: new Date().toISOString(),
    checks: {
      database: 'unknown' as 'ok' | 'error' | 'unknown',
      solana: 'unknown' as 'ok' | 'error' | 'unknown',
    },
    uptime: process.uptime(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    },
  };

  // Check database
  try {
    const { prisma } = await import('../utils/prisma.js');
    await prisma.$queryRaw`SELECT 1`;
    health.checks.database = 'ok';
  } catch (error) {
    health.checks.database = 'error';
    health.status = 'degraded';
  }

  // Check Solana RPC (basic connectivity)
  try {
    const { solanaClient } = await import('../solana/index.js');
    await solanaClient.getBlockHeight();
    health.checks.solana = 'ok';
  } catch (error) {
    health.checks.solana = 'error';
    health.status = 'degraded';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Mount routes
router.use('/auth', authRoutes);
router.use('/agents', agentRoutes);
router.use('/tasks', taskRoutes);
router.use('/payments', paymentRoutes);
router.use('/solana', solanaRoutes);

export default router;
