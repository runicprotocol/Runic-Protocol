import { ReputationEvent } from '@prisma/client';
import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

/**
 * ReputationService - Manages Agent reputation
 * 
 * Reputation score affects auction scoring and reflects
 * the Agent's track record of successful executions.
 * 
 * Score range: 0.0 to 5.0
 * Base score: 3.0
 */
export class ReputationService {
  private readonly BASE_SCORE = 3.0;
  private readonly MIN_SCORE = 0.0;
  private readonly MAX_SCORE = 5.0;

  /**
   * Apply a reputation event to an Agent
   */
  async applyEvent(
    agentId: string,
    taskId: string,
    deltaScore: number,
    reason: string
  ): Promise<ReputationEvent> {
    // Create the event
    const event = await prisma.reputationEvent.create({
      data: {
        agentId,
        taskId,
        deltaScore,
        reason,
      },
    });

    logger.info('Reputation event applied', {
      agentId,
      taskId,
      deltaScore,
      reason,
    });

    // Recompute the Agent's score
    await this.recomputeAgentScore(agentId);

    return event;
  }

  /**
   * Recompute an Agent's reputation score
   * 
   * Algorithm:
   * - Start from base score (3.0)
   * - Apply weighted sum of recent events (exponential decay)
   * - Clamp to [0.0, 5.0]
   */
  async recomputeAgentScore(agentId: string): Promise<number> {
    // Get recent reputation events (last 100)
    const events = await prisma.reputationEvent.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    if (events.length === 0) {
      // No events, set to base score
      await prisma.agent.update({
        where: { id: agentId },
        data: { reputationScore: this.BASE_SCORE },
      });
      return this.BASE_SCORE;
    }

    // Apply exponential decay to events
    // More recent events have higher weight
    let weightedSum = 0;
    let totalWeight = 0;
    const decayFactor = 0.95;

    for (let i = 0; i < events.length; i++) {
      const weight = Math.pow(decayFactor, i);
      weightedSum += events[i].deltaScore * weight;
      totalWeight += weight;
    }

    // Normalize by total weight
    const adjustedDelta = weightedSum / Math.max(totalWeight, 1);

    // Calculate final score
    let score = this.BASE_SCORE + adjustedDelta;

    // Clamp to valid range
    score = Math.max(this.MIN_SCORE, Math.min(this.MAX_SCORE, score));

    // Round to 2 decimal places
    score = Math.round(score * 100) / 100;

    // Update Agent
    await prisma.agent.update({
      where: { id: agentId },
      data: { reputationScore: score },
    });

    logger.debug(`Reputation score recomputed for Agent ${agentId}: ${score}`);

    return score;
  }

  /**
   * Get reputation history for an Agent
   */
  async getReputationHistory(
    agentId: string,
    limit: number = 50
  ): Promise<ReputationEvent[]> {
    return prisma.reputationEvent.findMany({
      where: { agentId },
      include: {
        task: {
          select: { id: true, title: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get reputation summary for an Agent
   */
  async getReputationSummary(agentId: string): Promise<{
    currentScore: number;
    totalEvents: number;
    positiveEvents: number;
    negativeEvents: number;
    averageDelta: number;
  }> {
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { reputationScore: true },
    });

    const events = await prisma.reputationEvent.findMany({
      where: { agentId },
    });

    const positiveEvents = events.filter(e => e.deltaScore > 0);
    const negativeEvents = events.filter(e => e.deltaScore < 0);

    const totalDelta = events.reduce((sum, e) => sum + e.deltaScore, 0);
    const averageDelta = events.length > 0 ? totalDelta / events.length : 0;

    return {
      currentScore: agent?.reputationScore || this.BASE_SCORE,
      totalEvents: events.length,
      positiveEvents: positiveEvents.length,
      negativeEvents: negativeEvents.length,
      averageDelta: Math.round(averageDelta * 1000) / 1000,
    };
  }

  /**
   * Apply bonus reputation for exceptional performance
   */
  async applyBonus(
    agentId: string,
    taskId: string,
    reason: string
  ): Promise<ReputationEvent> {
    return this.applyEvent(agentId, taskId, 0.25, `Bonus: ${reason}`);
  }

  /**
   * Apply penalty for poor performance
   */
  async applyPenalty(
    agentId: string,
    taskId: string,
    reason: string
  ): Promise<ReputationEvent> {
    return this.applyEvent(agentId, taskId, -0.3, `Penalty: ${reason}`);
  }
}

export const reputationService = new ReputationService();
export default reputationService;
