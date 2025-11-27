import { Payment, PaymentStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../utils/prisma.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';
import logger from '../utils/logger.js';

/**
 * Interface for Solana payment client
 * Abstracted to allow real and simulated implementations
 */
export interface SolanaClient {
  sendPayment(params: {
    fromPubkey: string;
    toPubkey: string;
    amountLamports: bigint;
    tokenMint?: string;
  }): Promise<{ txHash: string }>;
}

/**
 * DummySolanaClient - Simulated Solana payment client
 * 
 * Does NOT call real RPC yet.
 * Logs the intent and returns a fake txHash.
 */
export class DummySolanaClient implements SolanaClient {
  async sendPayment(params: {
    fromPubkey: string;
    toPubkey: string;
    amountLamports: bigint;
    tokenMint?: string;
  }): Promise<{ txHash: string }> {
    const txHash = `simulated-${uuidv4()}`;

    logger.info('[SIMULATED] Solana payment sent', {
      from: params.fromPubkey.slice(0, 8) + '...',
      to: params.toPubkey.slice(0, 8) + '...',
      amount: params.amountLamports.toString(),
      tokenMint: params.tokenMint || 'SOL (native)',
      txHash,
    });

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    return { txHash };
  }
}

/**
 * PaymentService - Manages payments for completed Tasks
 * 
 * Uses a SolanaClient interface that can be swapped between
 * simulated (dev) and real (production) implementations.
 */
export class PaymentService {
  private solanaClient: SolanaClient;

  // Treasury address (simulated)
  private treasuryAddress = 'RunicTreasury11111111111111111111111111111';

  constructor(solanaClient?: SolanaClient) {
    this.solanaClient = solanaClient || new DummySolanaClient();
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
   * Uses SolanaClient to send the payment (simulated or real)
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
      // Send payment via Solana client
      const { txHash } = await this.solanaClient.sendPayment({
        fromPubkey: this.treasuryAddress,
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

      return failedPayment;
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
   * Refund a payment
   */
  async refundPayment(paymentId: string): Promise<Payment> {
    const payment = await this.getPaymentById(paymentId);

    if (payment.status !== 'COMPLETED') {
      throw new ConflictError(`Cannot refund payment: status is ${payment.status}`);
    }

    // In a real implementation, this would initiate a refund transaction
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
}

export const paymentService = new PaymentService();
export default paymentService;
