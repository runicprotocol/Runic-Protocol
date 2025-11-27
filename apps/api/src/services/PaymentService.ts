import { Payment, PaymentStatus } from '@prisma/client';
import prisma from '../utils/prisma.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { createSolanaClient, getExplorerUrl } from '../solana/index.js';
import type { SolanaClient } from '../solana/index.js';

/**
 * PaymentService - Manages payments for completed Tasks
 * 
 * Uses SolanaClient for real or simulated transactions based on config.
 */
export class PaymentService {
  private solanaClient: SolanaClient;

  constructor() {
    this.solanaClient = createSolanaClient();
  }

  /**
   * Create a pending payment for a completed Task
   */
  async createPendingPayment(
    taskId: string,
    agentId: string,
    amountLamports: bigint,
    tokenSymbol: string
  ): Promise<Payment> {
    const payment = await prisma.payment.create({
      data: {
        taskId,
        agentId,
        amountLamports,
        tokenSymbol,
        status: 'PENDING',
        chain: 'solana',
      },
    });

    logger.info('Payment created (pending)', {
      paymentId: payment.id,
      taskId,
      agentId,
      amountLamports: amountLamports.toString(),
      tokenSymbol,
    });

    return payment;
  }

  /**
   * Settle a pending payment
   * 
   * Sends real or simulated transaction based on configuration
   */
  async settlePayment(paymentId: string): Promise<Payment> {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        agent: true,
      },
    });

    if (!payment) {
      throw new NotFoundError('Payment', paymentId);
    }

    if (payment.status !== 'PENDING') {
      throw new ConflictError(`Cannot settle payment: status is ${payment.status}`);
    }

    try {
      // Send payment via Solana client (real or simulated)
      const { txHash } = await this.solanaClient.sendPayment({
        toPubkey: payment.agent.walletAddress,
        amountLamports: payment.amountLamports,
        tokenMint: payment.tokenSymbol === 'SOL' ? undefined : payment.tokenSymbol,
      });

      // Update payment status
      const updatedPayment = await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: 'COMPLETED',
          txHash,
        },
      });

      logger.info('Payment settled', {
        paymentId,
        txHash,
        explorerUrl: getExplorerUrl(txHash),
        amountLamports: payment.amountLamports.toString(),
      });

      return updatedPayment;

    } catch (error) {
      // Mark payment as failed
      const failedPayment = await prisma.payment.update({
        where: { id: paymentId },
        data: { status: 'FAILED' },
      });

      logger.error('Payment settlement failed', error as Error);

      throw error;
    }
  }

  /**
   * Get payment by ID
   */
  async getPaymentById(id: string): Promise<Payment> {
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        task: {
          select: { id: true, title: true },
        },
        agent: {
          select: { id: true, name: true, walletAddress: true },
        },
      },
    });

    if (!payment) {
      throw new NotFoundError('Payment', id);
    }

    return payment;
  }

  /**
   * List payments with optional filters
   */
  async listPayments(filters: {
    agentId?: string;
    taskId?: string;
    status?: PaymentStatus;
    userId?: string;
  } = {}): Promise<Payment[]> {
    const where: any = {};

    if (filters.agentId) {
      where.agentId = filters.agentId;
    }

    if (filters.taskId) {
      where.taskId = filters.taskId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.userId) {
      // Get payments for Tasks created by this user
      where.task = {
        createdByUserId: filters.userId,
      };
    }

    return prisma.payment.findMany({
      where,
      include: {
        task: {
          select: { id: true, title: true },
        },
        agent: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Refund a payment (mark as refunded - actual refund would need implementation)
   */
  async refundPayment(paymentId: string): Promise<Payment> {
    const payment = await this.getPaymentById(paymentId);

    if (payment.status !== 'COMPLETED') {
      throw new ConflictError(`Cannot refund payment: status is ${payment.status}`);
    }

    // Note: In production, you'd implement actual refund transaction here
    const updatedPayment = await prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'REFUNDED' },
    });

    logger.info('Payment refunded', { paymentId });

    return updatedPayment;
  }

  /**
   * Get payment statistics for an Agent
   */
  async getAgentPaymentStats(agentId: string): Promise<{
    totalEarned: bigint;
    pendingPayments: number;
    completedPayments: number;
  }> {
    const payments = await prisma.payment.findMany({
      where: { agentId },
    });

    const completed = payments.filter(p => p.status === 'COMPLETED');
    const pending = payments.filter(p => p.status === 'PENDING');

    const totalEarned = completed.reduce(
      (sum, p) => sum + p.amountLamports,
      BigInt(0)
    );

    return {
      totalEarned,
      pendingPayments: pending.length,
      completedPayments: completed.length,
    };
  }

  /**
   * Get agent wallet balance
   */
  async getAgentBalance(agentId: string): Promise<bigint> {
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { walletAddress: true },
    });

    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    return this.solanaClient.getBalance(agent.walletAddress);
  }
}

export const paymentService = new PaymentService();
export default paymentService;
