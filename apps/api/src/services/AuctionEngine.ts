import { Task, Offer } from '@prisma/client';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';
import prisma from '../utils/prisma.js';
import { taskService } from './TaskService.js';
import { offerService } from './OfferService.js';
import { EventEmitter } from 'events';

interface AuctionState {
  taskId: string;
  task: Task;
  startedAt: Date;
  timer: NodeJS.Timeout;
}

export interface AuctionResult {
  taskId: string;
  winningOffer: Offer | null;
  totalOffers: number;
  auctionDurationMs: number;
}

/**
 * AuctionEngine - Manages real-time Task auctions
 * 
 * When a Task is created, an auction is started with a configurable window.
 * Agents submit offers during this window. When the timer expires,
 * the best offer wins and the Task is assigned.
 * 
 * Events emitted:
 * - 'auction:started' - when a new auction begins
 * - 'auction:offer' - when a new offer is received
 * - 'auction:completed' - when auction ends with a winner
 * - 'auction:no-offers' - when auction ends with no offers
 */
export class AuctionEngine extends EventEmitter {
  private activeAuctions: Map<string, AuctionState> = new Map();

  constructor() {
    super();
    logger.info(`AuctionEngine initialized with ${config.auction.windowMs}ms window`);
  }

  /**
   * Start an auction for a Task
   */
  async startAuction(task: Task): Promise<void> {
    // Check if auction already exists
    if (this.activeAuctions.has(task.id)) {
      logger.warn(`Auction already active for Task ${task.id}`);
      return;
    }

    // Update Task status to IN_AUCTION
    await taskService.updateTaskStatus(task.id, 'IN_AUCTION');

    // Create auction timer
    const timer = setTimeout(
      () => this.closeAuction(task.id),
      config.auction.windowMs
    );

    // Store auction state
    const auctionState: AuctionState = {
      taskId: task.id,
      task,
      startedAt: new Date(),
      timer,
    };

    this.activeAuctions.set(task.id, auctionState);

    logger.info('Auction started', {
      taskId: task.id,
      title: task.title,
      windowMs: config.auction.windowMs,
    });

    this.emit('auction:started', {
      taskId: task.id,
      task,
      endsAt: new Date(Date.now() + config.auction.windowMs),
    });
  }

  /**
   * Handle a new offer during an active auction
   */
  handleNewOffer(offer: Offer): void {
    const auction = this.activeAuctions.get(offer.taskId);
    
    if (!auction) {
      logger.warn(`No active auction for Task ${offer.taskId}`);
      return;
    }

    logger.info('Auction offer received', {
      taskId: offer.taskId,
      offerId: offer.id,
      score: offer.score,
    });

    this.emit('auction:offer', {
      taskId: offer.taskId,
      offer,
      auctionEndsAt: new Date(auction.startedAt.getTime() + config.auction.windowMs),
    });
  }

  /**
   * Close an auction and determine the winner
   */
  private async closeAuction(taskId: string): Promise<void> {
    const auction = this.activeAuctions.get(taskId);
    
    if (!auction) {
      logger.warn(`No auction found to close for Task ${taskId}`);
      return;
    }

    try {
      const auctionDurationMs = Date.now() - auction.startedAt.getTime();

      // Get all pending offers sorted by score
      const offers = await offerService.getPendingOffersForTask(taskId);

      if (offers.length === 0) {
        // No offers received - reset to OPEN
        await taskService.updateTaskStatus(taskId, 'OPEN');
        
        logger.info('Auction completed with no offers', { taskId });
        
        this.emit('auction:no-offers', {
          taskId,
          auctionDurationMs,
        });

        this.activeAuctions.delete(taskId);
        return;
      }

      // Pick the winner (highest score)
      const winningOffer = offers[0];

      // Accept the winning offer
      await offerService.updateOfferStatus(winningOffer.id, 'ACCEPTED');

      // Reject all other offers
      await offerService.rejectOffersExcept(taskId, winningOffer.id);

      // Assign the Task to the winning Agent
      await taskService.assignTask(taskId, winningOffer.agentId);

      // Create an Execution record
      await prisma.execution.create({
        data: {
          taskId,
          agentId: winningOffer.agentId,
          status: 'PENDING',
        },
      });

      const result: AuctionResult = {
        taskId,
        winningOffer,
        totalOffers: offers.length,
        auctionDurationMs,
      };

      logger.info('Auction completed', {
        taskId,
        winnerId: winningOffer.agentId,
        winningScore: winningOffer.score,
        totalOffers: offers.length,
      });

      this.emit('auction:completed', result);

    } catch (error) {
      logger.error(`Error closing auction for Task ${taskId}`, error as Error);
      // Try to reset Task status
      await taskService.updateTaskStatus(taskId, 'OPEN');
    } finally {
      // Clean up
      this.activeAuctions.delete(taskId);
    }
  }

  /**
   * Check if an auction is active for a Task
   */
  isAuctionActive(taskId: string): boolean {
    return this.activeAuctions.has(taskId);
  }

  /**
   * Get auction state for a Task
   */
  getAuctionState(taskId: string): AuctionState | undefined {
    return this.activeAuctions.get(taskId);
  }

  /**
   * Get all active auctions
   */
  getActiveAuctions(): Map<string, AuctionState> {
    return new Map(this.activeAuctions);
  }

  /**
   * Cancel an auction (admin/emergency use)
   */
  async cancelAuction(taskId: string): Promise<void> {
    const auction = this.activeAuctions.get(taskId);
    
    if (!auction) {
      logger.warn(`No auction to cancel for Task ${taskId}`);
      return;
    }

    clearTimeout(auction.timer);
    this.activeAuctions.delete(taskId);

    // Reset Task status
    await taskService.updateTaskStatus(taskId, 'OPEN');

    logger.info('Auction cancelled', { taskId });

    this.emit('auction:cancelled', { taskId });
  }

  /**
   * Get time remaining in an auction
   */
  getTimeRemaining(taskId: string): number | null {
    const auction = this.activeAuctions.get(taskId);
    if (!auction) return null;

    const elapsed = Date.now() - auction.startedAt.getTime();
    const remaining = config.auction.windowMs - elapsed;
    return Math.max(0, remaining);
  }
}

// Singleton instance
export const auctionEngine = new AuctionEngine();
export default auctionEngine;
