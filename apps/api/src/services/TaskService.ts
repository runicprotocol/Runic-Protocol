import { Prisma, Task, TaskStatus } from '@prisma/client';
import prisma from '../utils/prisma.js';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';
import logger from '../utils/logger.js';

export interface CreateTaskInput {
  title: string;
  description: string;
  paymentTokenSymbol: string;
  budgetLamports: bigint;
  deadline?: Date;
  requiredCapabilities: string[];
}

export interface TaskFilters {
  status?: TaskStatus;
  search?: string;
  createdByUserId?: string;
}

/**
 * TaskService - Manages Task lifecycle
 * 
 * Tasks are work requests posted by users.
 * They go through: OPEN -> IN_AUCTION -> ASSIGNED -> RUNNING -> COMPLETED/FAILED
 */
export class TaskService {
  /**
   * Create a new Task
   * 
   * Creates a Task and returns it with OPEN status.
   * The caller (API route) should then start the auction.
   */
  async createTask(userId: string, input: CreateTaskInput): Promise<Task> {
    // Validate budget
    if (input.budgetLamports <= 0) {
      throw new ValidationError('Budget must be greater than 0');
    }

    // Validate deadline is in the future
    if (input.deadline && input.deadline <= new Date()) {
      throw new ValidationError('Deadline must be in the future');
    }

    const task = await prisma.task.create({
      data: {
        title: input.title,
        description: input.description,
        paymentTokenSymbol: input.paymentTokenSymbol,
        budgetLamports: input.budgetLamports,
        deadline: input.deadline,
        requiredCapabilities: input.requiredCapabilities,
        createdByUserId: userId,
        status: 'OPEN',
        chain: 'solana',
      },
    });

    logger.info('Task created', {
      id: task.id,
      title: task.title,
      budgetLamports: task.budgetLamports.toString(),
      requiredCapabilities: task.requiredCapabilities,
    });

    return task;
  }

  /**
   * List Tasks with optional filters
   */
  async listTasks(filters: TaskFilters = {}): Promise<Task[]> {
    const where: Prisma.TaskWhereInput = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters.createdByUserId) {
      where.createdByUserId = filters.createdByUserId;
    }

    return prisma.task.findMany({
      where,
      include: {
        createdByUser: {
          select: { id: true, email: true },
        },
        assignedAgent: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a Task by ID with full details
   */
  async getTaskById(id: string): Promise<Task & { 
    offers?: unknown[];
    executions?: unknown[];
  }> {
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        createdByUser: {
          select: { id: true, email: true },
        },
        assignedAgent: true,
        offers: {
          include: {
            agent: {
              select: { id: true, name: true, reputationScore: true },
            },
          },
          orderBy: { score: 'desc' },
        },
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!task) {
      throw new NotFoundError('Task', id);
    }

    return task;
  }

  /**
   * Update Task status
   */
  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<Task> {
    const task = await prisma.task.update({
      where: { id: taskId },
      data: { status },
    });

    logger.info('Task status updated', {
      id: taskId,
      status,
    });

    return task;
  }

  /**
   * Assign a Task to an Agent
   */
  async assignTask(taskId: string, agentId: string): Promise<Task> {
    const task = await this.getTaskById(taskId);

    // Validate current status allows assignment
    if (task.status !== 'OPEN' && task.status !== 'IN_AUCTION') {
      throw new ConflictError(`Cannot assign Task: status is ${task.status}`);
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        assignedAgentId: agentId,
        status: 'ASSIGNED',
      },
    });

    logger.info('Task assigned', {
      taskId,
      agentId,
    });

    return updated;
  }

  /**
   * Cancel a Task
   */
  async cancelTask(taskId: string, userId: string): Promise<Task> {
    const task = await this.getTaskById(taskId);

    // Only the creator can cancel
    if (task.createdByUserId !== userId) {
      throw new ValidationError('Only the Task creator can cancel it');
    }

    // Can only cancel if not yet running or completed
    const cancellableStatuses: TaskStatus[] = ['OPEN', 'IN_AUCTION', 'ASSIGNED'];
    if (!cancellableStatuses.includes(task.status)) {
      throw new ConflictError(`Cannot cancel Task: status is ${task.status}`);
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: { status: 'CANCELLED' },
    });

    logger.info('Task cancelled', { taskId });

    return updated;
  }

  /**
   * Get Tasks assigned to a specific Agent
   */
  async getTasksForAgent(agentId: string): Promise<Task[]> {
    return prisma.task.findMany({
      where: { assignedAgentId: agentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get open/in-auction Tasks that an Agent can bid on
   */
  async getAvailableTasks(): Promise<Task[]> {
    return prisma.task.findMany({
      where: {
        status: { in: ['OPEN', 'IN_AUCTION'] },
      },
      include: {
        createdByUser: {
          select: { id: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get open tasks matching agent capabilities
   */
  async getTasksMatchingCapabilities(capabilities: string[]): Promise<Task[]> {
    const allTasks = await this.getAvailableTasks();
    
    // Filter tasks where agent has all required capabilities
    return allTasks.filter(task => {
      if (task.requiredCapabilities.length === 0) return true;
      return task.requiredCapabilities.every(cap => capabilities.includes(cap));
    });
  }
}

export const taskService = new TaskService();
export default taskService;

