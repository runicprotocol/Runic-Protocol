import { Offer, OfferStatus } from '@prisma/client';
import prisma from '../utils/prisma.js';
import { NotFoundError, ValidationError, AuctionError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { agentService } from './AgentService.js';

export interface CreateOfferInput {
  priceLamports: bigint;
  etaSeconds: number;
}

/**
 * OfferService - Manages Offers (bids) from Agents
 * 
 * Agents submit offers during the auction window to compete
 * for Task assignments. Offers are scored based on price, ETA,
 * and Agent reputation.
 */
export class OfferService {
  /**
   * Create a new Offer
   * 
   * Validates:
   * - Task status is OPEN or IN_AUCTION
   * - Agent is active
   * - Agent has required capabilities
   * 
   * Computes a score for auction ranking
   */
  async createOffer(
    agentId: string,
    taskId: string,
    input: CreateOfferInput
  ): Promise<Offer> {
    // Get the Task
    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new NotFoundError('Task', taskId);
    }

    // Validate Task status
    if (task.status !== 'OPEN' && task.status !== 'IN_AUCTION') {
      throw new AuctionError(`Cannot submit offer: Task status is ${task.status}`);
    }

    // Get the Agent
    const agent = await agentService.getAgentById(agentId);

    // Validate Agent is active
    if (!agent.isActive) {
      throw new ValidationError('Agent is not active');
    }

    // Validate Agent has required capabilities
    if (!agentService.hasRequiredCapabilities(agent, task.requiredCapabilities)) {
      throw new ValidationError(
        `Agent lacks required capabilities: ${task.requiredCapabilities.join(', ')}`
      );
    }

    // Check for existing pending offer from same Agent
    const existingOffer = await prisma.offer.findFirst({
      where: {
        taskId,
        agentId,
        status: 'PENDING',
      },
    });

    if (existingOffer) {
      throw new ValidationError('Agent already has a pending offer for this Task');
    }

    // Compute score
    const score = this.computeOfferScore(
      input.priceLamports,
      input.etaSeconds,
      agent.reputationScore
    );

    // Create the offer
    const offer = await prisma.offer.create({
      data: {
        taskId,
        agentId,
        priceLamports: input.priceLamports,
        etaSeconds: input.etaSeconds,
        score,
        status: 'PENDING',
      },
    });

    logger.info('Offer created', {
      offerId: offer.id,
      taskId,
      agentId,
      priceLamports: input.priceLamports.toString(),
      etaSeconds: input.etaSeconds,
      score,
    });

    return offer;
  }

  /**
   * Compute offer score for auction ranking
   * 
   * Score formula:
   * - Lower price is better
   * - Lower ETA is better  
   * - Higher reputation is better
   * 
   * score = 100 - (1 * log(price)) - (0.5 * log(eta + 1)) + (1 * reputation)
   */
  computeOfferScore(
    priceLamports: bigint,
    etaSeconds: number,
    reputationScore: number
  ): number {
    const normalizedPrice = Math.log(Number(priceLamports) + 1);
    const normalizedEta = Math.log(etaSeconds + 1);

    const score = 100 
      - (1 * normalizedPrice) 
      - (0.5 * normalizedEta) 
      + (1 * reputationScore);

    return Math.round(score * 1000) / 1000; // Round to 3 decimal places
  }

  /**
   * List all offers for a Task
   */
  async listOffersForTask(taskId: string): Promise<Offer[]> {
    return prisma.offer.findMany({
      where: { taskId },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            reputationScore: true,
            capabilities: true,
          },
        },
      },
      orderBy: { score: 'desc' },
    });
  }

  /**
   * Get offer by ID
   */
  async getOfferById(id: string): Promise<Offer> {
    const offer = await prisma.offer.findUnique({
      where: { id },
      include: {
        agent: true,
        task: true,
      },
    });

    if (!offer) {
      throw new NotFoundError('Offer', id);
    }

    return offer;
  }

  /**
   * Update Offer status
   */
  async updateOfferStatus(offerId: string, status: OfferStatus): Promise<Offer> {
    const offer = await prisma.offer.update({
      where: { id: offerId },
      data: { status },
    });

    logger.info('Offer status updated', {
      offerId,
      status,
    });

    return offer;
  }

  /**
   * Get pending offers for a Task, sorted by score (highest first)
   */
  async getPendingOffersForTask(taskId: string): Promise<Offer[]> {
    return prisma.offer.findMany({
      where: {
        taskId,
        status: 'PENDING',
      },
      include: {
        agent: true,
      },
      orderBy: { score: 'desc' },
    });
  }

  /**
   * Reject all pending offers for a Task except the winner
   */
  async rejectOffersExcept(taskId: string, winnerOfferId: string): Promise<void> {
    await prisma.offer.updateMany({
      where: {
        taskId,
        status: 'PENDING',
        id: { not: winnerOfferId },
      },
      data: { status: 'REJECTED' },
    });
  }

  /**
   * Get best current offer for a Task
   */
  async getBestOfferForTask(taskId: string): Promise<Offer | null> {
    return prisma.offer.findFirst({
      where: {
        taskId,
        status: 'PENDING',
      },
      include: {
        agent: {
          select: { id: true, name: true, reputationScore: true },
        },
      },
      orderBy: { score: 'desc' },
    });
  }
}

export const offerService = new OfferService();
export default offerService;

