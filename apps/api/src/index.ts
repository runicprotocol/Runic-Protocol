import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config/index.js';
import { initializeWebSocket, emitEvent, emitToAgent } from './websocket/index.js';
import { auctionEngine } from './services/index.js';
import apiRoutes from './api/index.js';
import logger from './utils/logger.js';
import { RunicError } from './utils/errors.js';
import { setupSecurityMiddleware, requestIdMiddleware } from './middleware/security.js';
import { validateEnvironment, requestSizeLimit } from './middleware/validation.js';

// Validate environment on startup
try {
  validateEnvironment();
} catch (error) {
  logger.error('Environment validation failed', error as Error);
  process.exit(1);
}

// Create Express app
const app = express();

// Create HTTP server
const httpServer = createServer(app);

// Determine CORS origin
const corsOrigin = config.allowedOrigins.length === 1 && config.allowedOrigins[0] === '*'
  ? '*'
  : (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || config.allowedOrigins.includes('*') || config.allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    };

// Create Socket.IO server
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: config.allowedOrigins.includes('*') ? '*' : config.allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Initialize WebSocket
initializeWebSocket(io);

// Security middleware
setupSecurityMiddleware().forEach(middleware => app.use(middleware));

// Request ID tracking
app.use(requestIdMiddleware);

// Compression
app.use(compression());

// CORS
app.use(cors({
  origin: corsOrigin,
  credentials: true,
}));

// Body parsing with size limit
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request size validation
app.use(requestSizeLimit());

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const requestId = req.id || 'unknown';
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.debug(`[${requestId}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// API routes
app.use('/api', apiRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'Runic Protocol API',
    version: '0.1.0',
    description: 'A Solana-based M2M execution and payment protocol',
    docs: '/api',
    health: '/api/health',
    websocket: {
      agents: '/agents',
      dashboard: '/dashboard',
    },
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const requestId = req.id || 'unknown';
  logger.error(`[${requestId}] Unhandled error`, err);

  if (err instanceof RunicError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
      requestId,
    });
  } else {
    // Don't leak error details in production
    const message = config.nodeEnv === 'production'
      ? 'Internal server error'
      : err.message || 'Internal server error';
    
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message },
      requestId,
    });
  }
});

// Connect auction engine events to WebSocket
auctionEngine.on('auction:started', (data) => {
  emitEvent('tasks:available', data);
});

auctionEngine.on('auction:offer', (data) => {
  emitEvent('offers:created', data);
});

auctionEngine.on('auction:completed', (data) => {
  emitEvent('auctions:completed', data);
  
  // Notify the winning agent
  if (data.winningOffer) {
    emitToAgent(data.winningOffer.agentId, 'tasks:assigned', {
      taskId: data.taskId,
      offer: data.winningOffer,
    });
  }
});

auctionEngine.on('auction:no-offers', (data) => {
  emitEvent('tasks:updated', { ...data, status: 'OPEN' });
});

// Start server
const PORT = config.port;

httpServer.listen(PORT, () => {
  logger.info(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ⚡ RUNIC PROTOCOL API                                       ║
║                                                              ║
║   Server running on port ${PORT}                                ║
║   WebSocket enabled on same port                             ║
║   Environment: ${config.nodeEnv}                                    ║
║                                                              ║
║   Endpoints:                                                 ║
║   - REST API:    http://localhost:${PORT}/api                   ║
║   - WebSocket:   ws://localhost:${PORT}                         ║
║   - Agents NS:   ws://localhost:${PORT}/agents                  ║
║   - Dashboard:   ws://localhost:${PORT}/dashboard               ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down Runic Protocol API...');
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down...');
  httpServer.close(() => {
    process.exit(0);
  });
});

export { app, httpServer, io };
