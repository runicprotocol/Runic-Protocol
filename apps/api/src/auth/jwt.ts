import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { UnauthorizedError } from '../utils/errors.js';
import prisma from '../utils/prisma.js';

export interface JWTPayload {
  userId: string;
  email?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email?: string;
  };
}

/**
 * Generate a JWT token for a user
 */
export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): JWTPayload {
  try {
    return jwt.verify(token, config.jwt.secret) as JWTPayload;
  } catch (error) {
    throw new UnauthorizedError('Invalid or expired token');
  }
}

/**
 * Extract token from Authorization header
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return null;
  }

  // Support "Bearer <token>" format
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Also support raw token
  return authHeader;
}

/**
 * Authentication middleware
 * Extracts and validates JWT from Authorization header
 */
export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const token = extractToken(req);

    if (!token) {
      throw new UnauthorizedError('No authentication token provided');
    }

    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      res.status(401).json({
        error: error.message,
        code: error.code,
      });
    } else {
      res.status(401).json({
        error: 'Authentication failed',
        code: 'AUTH_FAILED',
      });
    }
  }
}

/**
 * Optional auth middleware
 * Populates req.user if token is present, but doesn't require it
 */
export function optionalAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const token = extractToken(req);

    if (token) {
      const payload = verifyToken(token);
      req.user = payload;
    }

    next();
  } catch (error) {
    // Silently continue without auth
    next();
  }
}

/**
 * Middleware to verify the user owns a specific Runecaster
 */
export async function runecasterOwnerMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const runecasterId = req.params.runecasterId || req.body?.runecasterId;

    if (!runecasterId) {
      res.status(400).json({
        error: 'Runecaster ID required',
        code: 'MISSING_RUNECASTER_ID',
      });
      return;
    }

    const runecaster = await prisma.runecaster.findUnique({
      where: { id: runecasterId },
      select: { ownerUserId: true },
    });

    if (!runecaster) {
      res.status(404).json({
        error: 'Runecaster not found',
        code: 'NOT_FOUND',
      });
      return;
    }

    if (runecaster.ownerUserId !== req.user.userId) {
      res.status(403).json({
        error: 'You do not own this Runecaster',
        code: 'FORBIDDEN',
      });
      return;
    }

    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      res.status(401).json({
        error: error.message,
        code: error.code,
      });
    } else {
      next(error);
    }
  }
}






