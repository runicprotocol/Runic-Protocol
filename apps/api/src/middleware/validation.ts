import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import logger from '../utils/logger.js';

/**
 * Validate environment variables on startup
 */
export function validateEnvironment() {
  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
  ];

  const missing: string[] = [];

  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }

  // Warn about production settings
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.ALLOWED_ORIGINS) {
      logger.warn('ALLOWED_ORIGINS not set in production - CORS will be disabled');
    }
    if (process.env.JWT_SECRET === 'runic-dev-secret-change-me') {
      logger.warn('Using default JWT_SECRET in production - this is insecure!');
    }
  }
}

/**
 * Request size limit middleware
 */
export function requestSizeLimit() {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = req.headers['content-length'];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (contentLength && parseInt(contentLength) > maxSize) {
      res.status(413).json({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request payload too large',
        },
      });
      return;
    }

    next();
  };
}

