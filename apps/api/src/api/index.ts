import { Router } from 'express';
import authRoutes from './auth.routes.js';
import agentRoutes from './agent.routes.js';
import taskRoutes from './task.routes.js';
import paymentRoutes from './payment.routes.js';
import solanaRoutes from './solana.routes.js';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'runic-api',
    timestamp: new Date().toISOString(),
  });
});

// Mount routes
router.use('/auth', authRoutes);
router.use('/agents', agentRoutes);
router.use('/tasks', taskRoutes);
router.use('/payments', paymentRoutes);
router.use('/solana', solanaRoutes);

export default router;
