import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config/index.js';
import { initializeWebSocket, emitEvent, emitToAgent } from './websocket/index.js';
import { auctionEngine } from './services/index.js';
import apiRoutes from './api/index.js';
import logger from './utils/logger.js';
import { RunicError } from './utils/errors.js';

// Create Express app
const app = express();

// Create HTTP server
const httpServer = createServer(app);

// Create Socket.IO server
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*', // Configure appropriately for production
    methods: ['GET', 'POST'],
  },
});

// Initialize WebSocket
initializeWebSocket(io);

// Middleware
app.use(cors({
  origin: '*', // Configure appropriately for production
  credentials: true,
}));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.debug(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
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
  logger.error('Unhandled error', err);

  if (err instanceof RunicError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
  } else {
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
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
