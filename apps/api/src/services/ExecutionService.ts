import { Execution, ExecutionStatus } from '@prisma/client';
import prisma from '../utils/prisma.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { guardStatus } from '../utils/state-machine.js';
import logger from '../utils/logger.js';
import { paymentService } from './PaymentService.js';
import { reputationService } from './ReputationService.js';
import { agentService } from './AgentService.js';

export interface CompleteExecutionInput {
  success: boolean;
  signedResultPayload?: string;
  resultSummary?: string;
  proofHash?: string;
  errorMessage?: string;
}

/**
 * ExecutionService - Manages Task execution lifecycle
 * 
 * Uses state machine to enforce valid transitions.
 */
export class ExecutionService {
  /**
   * Start executing a Task
   */
  async startExecution(taskId: string, agentId: string): Promise<Execution> {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new NotFoundError('Task', taskId);
    }

    // Validate Agent is assigned
    if (task.assignedAgentId !== agentId) {
      throw new ValidationError(
        `Agent ${agentId} is not assigned to this Task. ` +
        `Assigned agent: ${task.assignedAgentId || 'none'}`
      );
    }

    // Validate Task status using state machine
    const guard = guardStatus(task.status);
    guard.assertCanStartExecution();

    // Find or create Execution record
    let execution = await prisma.execution.findFirst({
      where: {
        taskId,
        agentId,
        status: 'PENDING',
      },
    });

    if (!execution) {
      execution = await prisma.execution.create({
        data: {
          taskId,
          agentId,
          status: 'PENDING',
        },
      });
    }

    // Update to RUNNING
    execution = await prisma.execution.update({
      where: { id: execution.id },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    // Update Task status
    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'RUNNING' },
    });

    logger.info('Execution started', {
      executionId: execution.id,
      taskId,
      agentId,
    });

    return execution;
  }

  /**
   * Complete execution of a Task
   */
  async completeExecution(
    taskId: string,
    agentId: string,
    input: CompleteExecutionInput
  ): Promise<Execution> {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new NotFoundError('Task', taskId);
    }

    // Validate Agent is assigned
    if (task.assignedAgentId !== agentId) {
      throw new ValidationError('Agent is not assigned to this Task');
    }

    // Validate Task can be completed
    const guard = guardStatus(task.status);
    guard.assertCanComplete();

    // Find the running Execution
    const execution = await prisma.execution.findFirst({
      where: {
        taskId,
        agentId,
        status: 'RUNNING',
      },
    });

    if (!execution) {
      throw new NotFoundError('Running Execution');
    }

    const completedAt = new Date();
    const executionStatus: ExecutionStatus = input.success ? 'SUCCESS' : 'FAILURE';

    // Update Execution
    const updatedExecution = await prisma.execution.update({
      where: { id: execution.id },
      data: {
        status: executionStatus,
        completedAt,
        signedResultPayload: input.signedResultPayload,
        resultSummary: input.resultSummary,
        proofHash: input.proofHash,
        errorMessage: input.errorMessage,
      },
    });

    // Calculate execution duration
    const durationSeconds = (completedAt.getTime() - execution.startedAt.getTime()) / 1000;

    if (input.success) {
      // Mark Task as COMPLETED
      await prisma.task.update({
        where: { id: taskId },
        data: { status: 'COMPLETED' },
      });

      // Create pending Payment
      await paymentService.createPendingPayment(
        taskId,
        agentId,
        task.budgetLamports,
        task.paymentTokenSymbol
      );

      // Apply positive reputation
      await reputationService.applyEvent(
        agentId,
        taskId,
        0.1,
        `Successfully completed Task in ${durationSeconds.toFixed(1)}s`
      );

      logger.info('Execution completed successfully', {
        executionId: execution.id,
        taskId,
        agentId,
        durationSeconds,
        resultSummary: input.resultSummary,
      });

    } else {
      // Mark Task as FAILED
      await prisma.task.update({
        where: { id: taskId },
        data: { status: 'FAILED' },
      });

      // Apply negative reputation
      await reputationService.applyEvent(
        agentId,
        taskId,
        -0.2,
        `Task execution failed: ${input.errorMessage || 'Unknown error'}`
      );

      logger.info('Execution failed', {
        executionId: execution.id,
        taskId,
        agentId,
        durationSeconds,
        errorMessage: input.errorMessage,
      });
    }

    // Recompute Agent stats
    await agentService.recomputeStats(agentId);

    return updatedExecution;
  }

  /**
   * Get Execution by ID
   */
  async getExecutionById(id: string): Promise<Execution> {
    const execution = await prisma.execution.findUnique({
      where: { id },
      include: {
        task: true,
        agent: true,
      },
    });

    if (!execution) {
      throw new NotFoundError('Execution', id);
    }

    return execution;
  }

  /**
   * List Executions for a Task
   */
  async listExecutionsForTask(taskId: string): Promise<Execution[]> {
    return prisma.execution.findMany({
      where: { taskId },
      include: {
        agent: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * List Executions for an Agent
   */
  async listExecutionsForAgent(agentId: string): Promise<Execution[]> {
    return prisma.execution.findMany({
      where: { agentId },
      include: {
        task: {
          select: { id: true, title: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get the latest Execution for a Task
   */
  async getLatestExecutionForTask(taskId: string): Promise<Execution | null> {
    return prisma.execution.findFirst({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
      include: {
        agent: {
          select: { id: true, name: true },
        },
      },
    });
  }
}

export const executionService = new ExecutionService();
export default executionService;
