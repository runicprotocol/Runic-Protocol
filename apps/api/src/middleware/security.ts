import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';

/**
 * Security middleware setup
 */
export function setupSecurityMiddleware() {
  return [
    // Helmet for security headers
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      crossOriginEmbedderPolicy: false, // Allow Socket.IO
    }),
    
    // Rate limiting
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      message: {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests from this IP, please try again later.',
        },
      },
      standardHeaders: true,
      legacyHeaders: false,
    }),
  ];
}

/**
 * Request ID middleware for tracing
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const requestId = randomUUID();
  req.id = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

