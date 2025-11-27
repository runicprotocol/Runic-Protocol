import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../auth/index.js';
import { paymentService } from '../services/index.js';
import { RunicError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { emitEvent } from '../websocket/events.js';

const router = Router();

/**
 * GET /api/payments
 * 
 * List payments with optional filters.
 */
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { agentId, taskId, status } = req.query;

    const payments = await paymentService.listPayments({
      agentId: agentId as string | undefined,
      taskId: taskId as string | undefined,
      status: status as any,
      userId: req.user!.userId,
    });

    res.json({ data: { payments } });
  } catch (error) {
    logger.error('List payments error', error as Error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

/**
 * GET /api/payments/:id
 * 
 * Get a payment by ID.
 */
router.get('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const payment = await paymentService.getPaymentById(req.params.id);
    res.json({ data: { payment } });
  } catch (error) {
    if (error instanceof RunicError) {
      res.status(error.statusCode).json({
        error: { code: error.code, message: error.message },
      });
    } else {
      logger.error('Get payment error', error as Error);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
  }
});

/**
 * POST /api/payments/:id/settle
 * 
 * Settle a pending payment (simulated for now).
 */
router.post('/:id/settle', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const payment = await paymentService.settlePayment(req.params.id);

    emitEvent('payments:updated', {
      payment,
      taskId: payment.taskId,
      agentId: payment.agentId,
      status: 'COMPLETED',
    });

    res.json({ 
      data: {
        payment, 
        message: 'Payment settled successfully',
      }
    });
  } catch (error) {
    if (error instanceof RunicError) {
      res.status(error.statusCode).json({
        error: { code: error.code, message: error.message },
      });
    } else {
      logger.error('Settle payment error', error as Error);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
  }
});

/**
 * POST /api/payments/:id/refund
 * 
 * Refund a completed payment.
 */
router.post('/:id/refund', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const payment = await paymentService.refundPayment(req.params.id);

    emitEvent('payments:updated', {
      payment,
      taskId: payment.taskId,
      agentId: payment.agentId,
      status: 'REFUNDED',
    });

    res.json({ 
      data: {
        payment, 
        message: 'Payment refunded',
      }
    });
  } catch (error) {
    if (error instanceof RunicError) {
      res.status(error.statusCode).json({
        error: { code: error.code, message: error.message },
      });
    } else {
      logger.error('Refund payment error', error as Error);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
  }
});

/**
 * GET /api/payments/agent/:agentId/stats
 * 
 * Get payment statistics for an Agent.
 */
router.get('/agent/:agentId/stats', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = await paymentService.getAgentPaymentStats(req.params.agentId);

    res.json({
      data: {
        stats: {
          ...stats,
          totalEarned: stats.totalEarned.toString(),
        },
      }
    });
  } catch (error) {
    logger.error('Get payment stats error', error as Error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

export default router;
