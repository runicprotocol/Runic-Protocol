import { Execution, ExecutionStatus } from '@prisma/client';
import prisma from '../utils/prisma.js';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';
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
 * Execution is the process of an Agent performing the work
 * defined in a Task. The execution goes through:
 * PENDING -> RUNNING -> SUCCESS/FAILURE
 */
export class ExecutionService {
  /**
   * Start executing a Task
   * 
   * Validates that the Agent is assigned to this Task
   */
  async startExecution(taskId: string, agentId: string): Promise<Execution> {
    // Get the Task
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

    // Validate Task status
    if (task.status !== 'ASSIGNED') {
      throw new ConflictError(`Cannot start execution: Task status is ${task.status}`);
    }

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
   * 
   * On success:
   * - Mark Execution as SUCCESS
   * - Mark Task as COMPLETED
   * - Create pending Payment
   * - Apply positive reputation
   * 
   * On failure:
   * - Mark Execution as FAILURE
   * - Mark Task as FAILED
   * - Apply negative reputation
   */
  async completeExecution(
    taskId: string,
    agentId: string,
    input: CompleteExecutionInput
  ): Promise<Execution> {
    // Get the Task
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
        0.1, // Positive delta
        'Successfully completed Task execution'
      );

      logger.info('Execution completed successfully', {
        executionId: execution.id,
        taskId,
        agentId,
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
        -0.2, // Negative delta
        `Task execution failed: ${input.errorMessage || 'Unknown error'}`
      );

      logger.info('Execution failed', {
        executionId: execution.id,
        taskId,
        agentId,
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
