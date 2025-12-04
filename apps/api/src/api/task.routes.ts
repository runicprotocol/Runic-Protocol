import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthenticatedRequest } from '../auth/index.js';
import { 
  taskService, 
  offerService, 
  auctionEngine,
  executionService,
  agentService,
} from '../services/index.js';
import { RunicError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { emitEvent } from '../websocket/events.js';

const router = Router();

/**
 * Create Task Schema
 */
const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  paymentTokenSymbol: z.string().default('SOL'),
  budgetLamports: z.string().transform(val => BigInt(val)),
  deadline: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
  requiredCapabilities: z.array(z.string()).default([]),
});

/**
 * Create Offer Schema
 */
const createOfferSchema = z.object({
  agentId: z.string(),
  priceLamports: z.string().transform(val => BigInt(val)),
  etaSeconds: z.number().int().positive(),
});

/**
 * Complete Execution Schema
 */
const completeExecutionSchema = z.object({
  success: z.boolean(),
  signedResultPayload: z.string().optional(),
  resultSummary: z.string().optional(),
  proofHash: z.string().optional(),
  errorMessage: z.string().optional(),
});

/**
 * POST /api/tasks
 * 
 * Create a new Task and start auction.
 */
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = createTaskSchema.parse(req.body);
    
    // Create the Task
    const task = await taskService.createTask(req.user!.userId, data);

    // Start the auction
    await auctionEngine.startAuction(task);

    // Emit WebSocket event
    emitEvent('tasks:created', {
      task,
      auctionEndsAt: new Date(Date.now() + 15000), // 15s window
    });

    res.status(201).json({ 
      data: {
        task,
        message: 'Task created successfully. Auction has started.',
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Validation error', details: error.errors },
      });
    } else if (error instanceof RunicError) {
      res.status(error.statusCode).json({
        error: { code: error.code, message: error.message },
      });
    } else {
      logger.error('Create task error', error as Error);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
  }
});

/**
 * GET /api/tasks
 * 
 * List Tasks with optional filters.
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, search } = req.query;

    const tasks = await taskService.listTasks({
      status: status as any,
      search: search as string | undefined,
    });

    res.json({ data: { tasks } });
  } catch (error) {
    logger.error('List tasks error', error as Error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

/**
 * GET /api/tasks/:id
 * 
 * Get a Task by ID with full details.
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const task = await taskService.getTaskById(req.params.id);
    
    // Get auction time remaining if active
    const auctionTimeRemaining = auctionEngine.getTimeRemaining(task.id);
    
    // Get offer summary
    const offers = await offerService.listOffersForTask(task.id);
    const bestOffer = await offerService.getBestOfferForTask(task.id);
    
    res.json({ 
      data: {
        task,
        auctionTimeRemaining,
        offersSummary: {
          count: offers.length,
          bestOffer: bestOffer ? {
            id: bestOffer.id,
            agentId: bestOffer.agentId,
            priceLamports: bestOffer.priceLamports.toString(),
            etaSeconds: bestOffer.etaSeconds,
            score: bestOffer.score,
          } : null,
        },
      }
    });
  } catch (error) {
    if (error instanceof RunicError) {
      res.status(error.statusCode).json({
        error: { code: error.code, message: error.message },
      });
    } else {
      logger.error('Get task error', error as Error);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
  }
});

/**
 * POST /api/tasks/:id/cancel
 * 
 * Cancel a Task (creator only).
 */
router.post('/:id/cancel', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const task = await taskService.cancelTask(req.params.id, req.user!.userId);
    
    // Cancel auction if active
    if (auctionEngine.isAuctionActive(task.id)) {
      await auctionEngine.cancelAuction(task.id);
    }

    emitEvent('tasks:updated', { task, status: 'CANCELLED' });

    res.json({ data: { task, message: 'Task cancelled successfully' } });
  } catch (error) {
    if (error instanceof RunicError) {
      res.status(error.statusCode).json({
        error: { code: error.code, message: error.message },
      });
    } else {
      logger.error('Cancel task error', error as Error);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
  }
});

/**
 * POST /api/tasks/:id/offers
 * 
 * Submit an Offer (bid) on a Task.
 */
router.post('/:id/offers', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = createOfferSchema.parse(req.body);
    
    // Verify agent ownership
    const agent = await agentService.getAgentById(data.agentId);
    if (agent.ownerUserId !== req.user!.userId) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not own this Agent' },
      });
      return;
    }
    
    const offer = await offerService.createOffer(
      data.agentId,
      req.params.id,
      {
        priceLamports: data.priceLamports,
        etaSeconds: data.etaSeconds,
      }
    );

    // Notify auction engine
    auctionEngine.handleNewOffer(offer);

    // Emit WebSocket event
    emitEvent('offers:created', { offer, taskId: req.params.id });

    res.status(201).json({ data: { offer } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Validation error', details: error.errors },
      });
    } else if (error instanceof RunicError) {
      res.status(error.statusCode).json({
        error: { code: error.code, message: error.message },
      });
    } else {
      logger.error('Create offer error', error as Error);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
  }
});

/**
 * GET /api/tasks/:id/offers
 * 
 * List offers for a Task.
 */
router.get('/:id/offers', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const offers = await offerService.listOffersForTask(req.params.id);
    res.json({ data: { offers } });
  } catch (error) {
    logger.error('List offers error', error as Error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

/**
 * POST /api/tasks/:id/execution/start
 * 
 * Start executing a Task (assigned Agent only).
 */
router.post('/:id/execution/start', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Get the task to find assigned agent
    const task = await taskService.getTaskById(req.params.id);
    
    if (!task.assignedAgentId) {
      res.status(400).json({ error: { code: 'NOT_ASSIGNED', message: 'Task is not assigned to any Agent' } });
      return;
    }

    // Verify agent ownership
    const agent = await agentService.getAgentById(task.assignedAgentId);
    if (agent.ownerUserId !== req.user!.userId) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You are not the assigned Agent' },
      });
      return;
    }

    const execution = await executionService.startExecution(req.params.id, task.assignedAgentId);

    emitEvent('tasks:updated', { 
      taskId: req.params.id, 
      status: 'RUNNING',
      agentId: task.assignedAgentId,
    });

    res.json({ data: { execution, message: 'Execution started' } });
  } catch (error) {
    if (error instanceof RunicError) {
      res.status(error.statusCode).json({
        error: { code: error.code, message: error.message },
      });
    } else {
      logger.error('Start execution error', error as Error);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
  }
});

/**
 * POST /api/tasks/:id/execution/complete
 * 
 * Complete Task execution (assigned Agent only).
 */
router.post('/:id/execution/complete', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = completeExecutionSchema.parse(req.body);
    
    // Get the task to find assigned agent
    const task = await taskService.getTaskById(req.params.id);
    
    if (!task.assignedAgentId) {
      res.status(400).json({ error: { code: 'NOT_ASSIGNED', message: 'Task is not assigned to any Agent' } });
      return;
    }

    // Verify agent ownership
    const agent = await agentService.getAgentById(task.assignedAgentId);
    if (agent.ownerUserId !== req.user!.userId) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You are not the assigned Agent' },
      });
      return;
    }
    
    const execution = await executionService.completeExecution(
      req.params.id,
      task.assignedAgentId,
      {
        success: data.success,
        signedResultPayload: data.signedResultPayload,
        resultSummary: data.resultSummary,
        proofHash: data.proofHash,
        errorMessage: data.errorMessage,
      }
    );

    emitEvent('executions:completed', { 
      taskId: req.params.id, 
      agentId: task.assignedAgentId,
      execution,
      success: data.success,
    });

    res.json({ 
      data: {
        execution, 
        message: data.success ? 'Execution completed successfully' : 'Execution failed',
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Validation error', details: error.errors },
      });
    } else if (error instanceof RunicError) {
      res.status(error.statusCode).json({
        error: { code: error.code, message: error.message },
      });
    } else {
      logger.error('Complete execution error', error as Error);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
  }
});

export default router;






