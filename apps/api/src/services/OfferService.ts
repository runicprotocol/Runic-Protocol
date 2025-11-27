import { Offer, OfferStatus } from '@prisma/client';
import prisma from '../utils/prisma.js';
import { NotFoundError, ValidationError, AuctionError } from '../utils/errors.js';
import { guardStatus } from '../utils/state-machine.js';
import logger from '../utils/logger.js';
import { agentService } from './AgentService.js';

export interface CreateOfferInput {
  priceLamports: bigint;
  etaSeconds: number;
}

/**
 * OfferService - Manages Offers (bids) from Agents
 * 
 * Includes state machine validation to ensure offers
 * are only accepted when Task is in valid state.
 */
export class OfferService {
  /**
   * Create a new Offer with full validation
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

    // Validate Task status using state machine
    const guard = guardStatus(task.status);
    guard.assertCanAcceptOffers();

    // Get the Agent
    const agent = await agentService.getAgentById(agentId);

    // Validate Agent is active
    if (!agent.isActive) {
      throw new ValidationError('Agent is not active and cannot submit offers');
    }

    // Validate Agent has required capabilities
    if (!agentService.hasRequiredCapabilities(agent, task.requiredCapabilities)) {
      throw new ValidationError(
        `Agent lacks required capabilities. Needed: [${task.requiredCapabilities.join(', ')}]. ` +
        `Agent has: [${agent.capabilities.join(', ')}]`
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
      throw new AuctionError('Agent already has a pending offer for this Task. Cancel it first to submit a new one.');
    }

    // Validate price doesn't exceed budget
    if (input.priceLamports > task.budgetLamports) {
      throw new ValidationError(
        `Offer price (${input.priceLamports}) exceeds task budget (${task.budgetLamports})`
      );
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
   * score = 100 - (α × log(price)) - (β × log(eta + 1)) + (γ × reputation)
   */
  computeOfferScore(
    priceLamports: bigint,
    etaSeconds: number,
    reputationScore: number
  ): number {
    const alpha = 1.0;  // Price weight
    const beta = 0.5;   // ETA weight
    const gamma = 1.0;  // Reputation weight
    const base = 100.0;

    const normalizedPrice = Math.log(Number(priceLamports) + 1);
    const normalizedEta = Math.log(etaSeconds + 1);

    const score = base 
      - (alpha * normalizedPrice) 
      - (beta * normalizedEta) 
      + (gamma * reputationScore);

    return Math.round(score * 1000) / 1000;
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

  /**
   * Cancel an offer (if still pending)
   */
  async cancelOffer(offerId: string, agentId: string): Promise<Offer> {
    const offer = await this.getOfferById(offerId);

    if (offer.agentId !== agentId) {
      throw new ValidationError('Only the offer owner can cancel it');
    }

    if (offer.status !== 'PENDING') {
      throw new AuctionError(`Cannot cancel offer: status is ${offer.status}`);
    }

    return this.updateOfferStatus(offerId, 'CANCELLED');
  }
}

export const offerService = new OfferService();
export default offerService;
