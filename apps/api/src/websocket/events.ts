import { Server as SocketIOServer, Socket } from 'socket.io';
import logger from '../utils/logger.js';
import { verifyToken } from '../auth/jwt.js';
import prisma from '../utils/prisma.js';

// Global socket.io server instance
let io: SocketIOServer | null = null;

// Namespaces
export const NAMESPACES = {
  AGENTS: '/agents',       // For Agent connections
  DASHBOARD: '/dashboard', // For frontend dashboard
} as const;

// Event types
export type EventType =
  | 'tasks:created'
  | 'tasks:updated'
  | 'tasks:available'
  | 'tasks:assigned'
  | 'offers:created'
  | 'auctions:completed'
  | 'executions:completed'
  | 'payments:updated';

/**
 * Initialize WebSocket server
 */
export function initializeWebSocket(server: SocketIOServer): void {
  io = server;

  // ============================================
  // AGENTS Namespace - For Agent connections
  // ============================================
  const agentsNs = io.of(NAMESPACES.AGENTS);
  
  // Authentication middleware for agents
  agentsNs.use(async (socket, next) => {
    const token = socket.handshake.query.token as string;
    const agentId = socket.handshake.query.agentId as string;

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    try {
      const payload = verifyToken(token);
      (socket as any).userId = payload.userId;
      
      // If agentId provided, verify ownership
      if (agentId) {
        const agent = await prisma.agent.findUnique({
          where: { id: agentId },
          select: { ownerUserId: true, capabilities: true },
        });

        if (!agent) {
          return next(new Error('Agent not found'));
        }

        if (agent.ownerUserId !== payload.userId) {
          return next(new Error('Agent does not belong to this user'));
        }

        (socket as any).agentId = agentId;
        (socket as any).capabilities = agent.capabilities;
      }

      next();
    } catch (error) {
      next(new Error('Invalid authentication token'));
    }
  });

  agentsNs.on('connection', (socket: Socket) => {
    const agentId = (socket as any).agentId;
    const capabilities = (socket as any).capabilities || [];
    
    logger.info('Agent connected', { socketId: socket.id, agentId });

    // Join agent-specific room
    if (agentId) {
      socket.join(`agent:${agentId}`);
    }

    // Join capability rooms
    capabilities.forEach((cap: string) => {
      socket.join(`capability:${cap}`);
    });

    // Subscribe to available tasks
    socket.on('subscribe:tasks', () => {
      socket.join('available-tasks');
      logger.debug(`Socket ${socket.id} subscribed to available tasks`);
    });

    socket.on('disconnect', () => {
      logger.info('Agent disconnected', { socketId: socket.id, agentId });
    });
  });

  // ============================================
  // DASHBOARD Namespace - For frontend monitoring
  // ============================================
  const dashboardNs = io.of(NAMESPACES.DASHBOARD);
  
  dashboardNs.on('connection', (socket: Socket) => {
    logger.info(`Dashboard client connected: ${socket.id}`);

    socket.on('disconnect', () => {
      logger.info(`Dashboard client disconnected: ${socket.id}`);
    });

    // Allow subscribing to specific task updates
    socket.on('subscribe:task', (taskId: string) => {
      socket.join(`task:${taskId}`);
      logger.debug(`Socket ${socket.id} subscribed to task ${taskId}`);
    });

    socket.on('unsubscribe:task', (taskId: string) => {
      socket.leave(`task:${taskId}`);
    });
  });

  logger.info('WebSocket server initialized');
}

/**
 * Emit an event to appropriate channels
 */
export function emitEvent(event: EventType, data: any): void {
  if (!io) {
    logger.warn('WebSocket not initialized, event not emitted', { event });
    return;
  }

  // Emit to dashboard
  io.of(NAMESPACES.DASHBOARD).emit(event, data);

  // Emit to specific task room if taskId is present
  if (data.taskId) {
    io.of(NAMESPACES.DASHBOARD).to(`task:${data.taskId}`).emit(event, data);
  }

  // Handle agent-specific events
  switch (event) {
    case 'tasks:created':
    case 'tasks:available':
      // Emit to all agents subscribed to available tasks
      io.of(NAMESPACES.AGENTS).to('available-tasks').emit('tasks:available', data);
      
      // Emit to agents with matching capabilities
      if (data.task?.requiredCapabilities) {
        data.task.requiredCapabilities.forEach((cap: string) => {
          io!.of(NAMESPACES.AGENTS).to(`capability:${cap}`).emit('tasks:available', data);
        });
      }
      break;

    case 'tasks:assigned':
    case 'auctions:completed':
      // Emit to the specific agent that won
      if (data.agentId) {
        io.of(NAMESPACES.AGENTS).to(`agent:${data.agentId}`).emit('tasks:assigned', data);
      }
      break;

    case 'tasks:updated':
      // Emit to assigned agent if present
      if (data.agentId) {
        io.of(NAMESPACES.AGENTS).to(`agent:${data.agentId}`).emit('tasks:updated', data);
      }
      break;
  }

  logger.debug(`Event emitted: ${event}`, { hasData: !!data });
}

/**
 * Send event to a specific Agent
 */
export function emitToAgent(agentId: string, event: string, data: any): void {
  if (!io) return;
  io.of(NAMESPACES.AGENTS).to(`agent:${agentId}`).emit(event, data);
}

/**
 * Send event to Agents with specific capabilities
 */
export function emitToCapabilities(capabilities: string[], event: string, data: any): void {
  if (!io) return;
  
  const agentsNs = io.of(NAMESPACES.AGENTS);
  capabilities.forEach(cap => {
    agentsNs.to(`capability:${cap}`).emit(event, data);
  });
}

/**
 * Broadcast task available event
 */
export function broadcastTaskAvailable(task: any): void {
  if (!io) return;

  const data = { task };
  io.of(NAMESPACES.AGENTS).to('available-tasks').emit('tasks:available', data);
  io.of(NAMESPACES.DASHBOARD).emit('tasks:created', data);
}

/**
 * Get socket.io server instance
 */
export function getIO(): SocketIOServer | null {
  return io;
}
