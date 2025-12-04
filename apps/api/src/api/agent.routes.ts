import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthenticatedRequest } from '../auth/index.js';
import { agentService, reputationService } from '../services/index.js';
import { RunicError } from '../utils/errors.js';
import logger from '../utils/logger.js';

const router = Router();

/**
 * Create Agent Schema
 */
const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  walletAddress: z.string().min(32).max(44),
  capabilities: z.array(z.string()).default([]),
});

/**
 * Update Agent Schema
 */
const updateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  capabilities: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

/**
 * POST /api/agents
 * 
 * Create a new Agent owned by the current user.
 */
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = createAgentSchema.parse(req.body);
    
    const agent = await agentService.createAgent(req.user!.userId, data);

    res.status(201).json({ data: { agent } });
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
      logger.error('Create agent error', error as Error);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
  }
});

/**
 * GET /api/agents
 * 
 * List Agents with optional filters.
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { isActive, search, capability } = req.query;

    const agents = await agentService.listAgents({
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      search: search as string | undefined,
      capability: capability as string | undefined,
    });

    res.json({ data: { agents } });
  } catch (error) {
    logger.error('List agents error', error as Error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

/**
 * GET /api/agents/:id
 * 
 * Get an Agent by ID with full stats.
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const agent = await agentService.getAgentById(req.params.id);
    res.json({ data: { agent } });
  } catch (error) {
    if (error instanceof RunicError) {
      res.status(error.statusCode).json({
        error: { code: error.code, message: error.message },
      });
    } else {
      logger.error('Get agent error', error as Error);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
  }
});

/**
 * PATCH /api/agents/:id
 * 
 * Update an Agent (owner only).
 */
router.patch('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Verify ownership
    const existing = await agentService.getAgentById(req.params.id);
    
    if (existing.ownerUserId !== req.user!.userId) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not own this Agent' },
      });
      return;
    }

    const data = updateAgentSchema.parse(req.body);
    
    const agent = await agentService.updateAgent(req.params.id, data);

    res.json({ data: { agent } });
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
      logger.error('Update agent error', error as Error);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
  }
});

/**
 * GET /api/agents/:id/reputation
 * 
 * Get reputation details for an Agent.
 */
router.get('/:id/reputation', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const summary = await reputationService.getReputationSummary(req.params.id);
    const events = await reputationService.getReputationHistory(req.params.id, 20);
    
    res.json({ 
      data: { 
        reputationScore: summary.currentScore,
        summary,
        events,
      } 
    });
  } catch (error) {
    if (error instanceof RunicError) {
      res.status(error.statusCode).json({
        error: { code: error.code, message: error.message },
      });
    } else {
      logger.error('Get reputation error', error as Error);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
  }
});

/**
 * POST /api/agents/:id/recompute-stats
 * 
 * Manually trigger stats recomputation for an Agent.
 */
router.post('/:id/recompute-stats', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const agent = await agentService.recomputeStats(req.params.id);
    res.json({ data: { agent } });
  } catch (error) {
    if (error instanceof RunicError) {
      res.status(error.statusCode).json({
        error: { code: error.code, message: error.message },
      });
    } else {
      logger.error('Recompute stats error', error as Error);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
  }
});

export default router;






