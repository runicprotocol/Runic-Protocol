import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma.js';
import { generateToken } from '../auth/jwt.js';
import logger from '../utils/logger.js';

const router = Router();

/**
 * Dev Login Schema
 */
const devLoginSchema = z.object({
  email: z.string().email().optional(),
});

/**
 * POST /api/auth/dev-login
 * 
 * Simple dev authentication endpoint.
 * Creates a user if not existing and returns a JWT token.
 */
router.post('/dev-login', async (req: Request, res: Response) => {
  try {
    const { email } = devLoginSchema.parse(req.body);

    let user;

    if (email) {
      // Find or create user by email
      user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        user = await prisma.user.create({
          data: { email },
        });
        logger.info(`New user created: ${email}`);
      }
    } else {
      // Create anonymous user
      user = await prisma.user.create({
        data: {},
      });
      logger.info(`Anonymous user created: ${user.id}`);
    }

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      email: user.email || undefined,
    });

    res.json({
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.createdAt,
        },
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Validation error', details: error.errors },
      });
    } else {
      logger.error('Dev login error', error as Error);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      });
    }
  }
});

/**
 * GET /api/auth/me
 * 
 * Get current user info (requires auth)
 */
router.get('/me', async (req: Request, res: Response) => {
  try {
    // This route expects auth middleware to have run
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      return;
    }

    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : authHeader;

    const { verifyToken } = await import('../auth/jwt.js');
    const payload = verifyToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        agents: {
          select: {
            id: true,
            name: true,
            isActive: true,
            reputationScore: true,
            capabilities: true,
          },
        },
        _count: {
          select: {
            tasksCreated: true,
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
      return;
    }

    res.json({
      data: {
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.createdAt,
          agents: user.agents,
          tasksCreatedCount: user._count.tasksCreated,
        },
      }
    });
  } catch (error) {
    logger.error('Get me error', error as Error);
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
  }
});

export default router;
