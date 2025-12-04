import { Prisma, Agent } from '@prisma/client';
import prisma from '../utils/prisma.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import logger from '../utils/logger.js';

export interface CreateAgentInput {
  name: string;
  description?: string;
  walletAddress: string;
  capabilities: string[];
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  capabilities?: string[];
  isActive?: boolean;
}

export interface AgentFilters {
  isActive?: boolean;
  search?: string;
  capability?: string;
}

/**
 * AgentService - Manages Agent lifecycle
 * 
 * Agents are autonomous entities that subscribe to Tasks,
 * submit offers, and execute work on behalf of users.
 */
export class AgentService {
  /**
   * Create a new Agent owned by a user
   */
  async createAgent(ownerUserId: string, input: CreateAgentInput): Promise<Agent> {
    // Validate wallet address format (basic Solana base58 check)
    if (!this.isValidSolanaAddress(input.walletAddress)) {
      throw new ValidationError('Invalid Solana wallet address');
    }

    const agent = await prisma.agent.create({
      data: {
        name: input.name,
        description: input.description,
        walletAddress: input.walletAddress,
        capabilities: input.capabilities,
        ownerUserId,
      },
    });

    logger.info('Agent created', { 
      id: agent.id, 
      name: agent.name,
      capabilities: agent.capabilities 
    });

    return agent;
  }

  /**
   * Get an Agent by ID
   */
  async getAgentById(id: string): Promise<Agent> {
    const agent = await prisma.agent.findUnique({
      where: { id },
      include: {
        ownerUser: {
          select: { id: true, email: true },
        },
      },
    });

    if (!agent) {
      throw new NotFoundError('Agent', id);
    }

    return agent;
  }

  /**
   * List Agents with optional filters
   */
  async listAgents(filters: AgentFilters = {}): Promise<Agent[]> {
    const where: Prisma.AgentWhereInput = {};

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters.capability) {
      where.capabilities = { has: filters.capability };
    }

    return prisma.agent.findMany({
      where,
      orderBy: { reputationScore: 'desc' },
    });
  }

  /**
   * Update an Agent
   */
  async updateAgent(id: string, input: UpdateAgentInput): Promise<Agent> {
    // Check existence
    await this.getAgentById(id);

    const agent = await prisma.agent.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.capabilities && { capabilities: input.capabilities }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });

    logger.info('Agent updated', { id: agent.id, updates: input });

    return agent;
  }

  /**
   * Recompute Agent statistics based on execution history
   */
  async recomputeStats(agentId: string): Promise<Agent> {
    const agent = await this.getAgentById(agentId);

    // Get execution statistics
    const executions = await prisma.execution.findMany({
      where: { agentId },
      select: {
        status: true,
        startedAt: true,
        completedAt: true,
      },
    });

    const completed = executions.filter(e => e.status === 'SUCCESS');
    const failed = executions.filter(e => e.status === 'FAILURE');

    // Calculate average completion time
    let avgCompletionSeconds: number | null = null;
    if (completed.length > 0) {
      const completionTimes = completed
        .filter(e => e.completedAt)
        .map(e => {
          const start = e.startedAt.getTime();
          const end = e.completedAt!.getTime();
          return (end - start) / 1000;
        });

      if (completionTimes.length > 0) {
        avgCompletionSeconds = completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length;
      }
    }

    // Get reputation events and recompute score
    const reputationEvents = await prisma.reputationEvent.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      take: 100, // Consider last 100 events
    });

    let reputationScore = 3.0; // Base score
    for (const event of reputationEvents) {
      reputationScore += event.deltaScore;
    }
    // Clamp to [0.0, 5.0]
    reputationScore = Math.max(0.0, Math.min(5.0, reputationScore));

    // Update Agent
    const updated = await prisma.agent.update({
      where: { id: agentId },
      data: {
        totalTasksCompleted: completed.length,
        totalTasksFailed: failed.length,
        avgCompletionSeconds,
        reputationScore,
      },
    });

    logger.info('Agent stats recomputed', {
      id: agentId,
      completed: completed.length,
      failed: failed.length,
      avgCompletionSeconds,
      reputationScore,
    });

    return updated;
  }

  /**
   * Check if Agent has all required capabilities
   */
  hasRequiredCapabilities(agent: Agent, requiredCapabilities: string[]): boolean {
    if (requiredCapabilities.length === 0) return true;
    return requiredCapabilities.every(cap => agent.capabilities.includes(cap));
  }

  /**
   * Basic validation for Solana addresses (base58, 32-44 chars)
   */
  private isValidSolanaAddress(address: string): boolean {
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return base58Regex.test(address);
  }

  /**
   * Get agents by user ID
   */
  async getAgentsByUserId(userId: string): Promise<Agent[]> {
    return prisma.agent.findMany({
      where: { ownerUserId: userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const agentService = new AgentService();
export default agentService;






