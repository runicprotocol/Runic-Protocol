/**
 * Task State Machine
 * 
 * Enforces valid state transitions for Tasks.
 * Prevents invalid operations like going from COMPLETED back to RUNNING.
 */

import { TaskStatus } from '@prisma/client';
import { ConflictError } from './errors.js';

/**
 * Valid state transitions for Tasks
 */
const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  OPEN: ['IN_AUCTION', 'CANCELLED'],
  IN_AUCTION: ['ASSIGNED', 'OPEN', 'CANCELLED'], // OPEN = no offers received
  ASSIGNED: ['RUNNING', 'CANCELLED'],
  RUNNING: ['COMPLETED', 'FAILED'],
  COMPLETED: [], // Terminal state
  FAILED: [], // Terminal state
  CANCELLED: [], // Terminal state
};

/**
 * Human-readable status descriptions
 */
const STATUS_DESCRIPTIONS: Record<TaskStatus, string> = {
  OPEN: 'waiting for auction',
  IN_AUCTION: 'accepting offers',
  ASSIGNED: 'assigned to an agent',
  RUNNING: 'being executed',
  COMPLETED: 'successfully completed',
  FAILED: 'execution failed',
  CANCELLED: 'cancelled by user',
};

/**
 * Check if a status transition is valid
 */
export function isValidTransition(from: TaskStatus, to: TaskStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Validate and assert a status transition
 * Throws ConflictError if invalid
 */
export function assertValidTransition(from: TaskStatus, to: TaskStatus): void {
  if (!isValidTransition(from, to)) {
    throw new ConflictError(
      `Invalid status transition: cannot go from ${from} (${STATUS_DESCRIPTIONS[from]}) ` +
      `to ${to} (${STATUS_DESCRIPTIONS[to]}). ` +
      `Valid next states: ${VALID_TRANSITIONS[from].join(', ') || 'none (terminal state)'}`
    );
  }
}

/**
 * Check if a task can accept offers
 */
export function canAcceptOffers(status: TaskStatus): boolean {
  return status === 'OPEN' || status === 'IN_AUCTION';
}

/**
 * Check if a task can be cancelled
 */
export function canBeCancelled(status: TaskStatus): boolean {
  return ['OPEN', 'IN_AUCTION', 'ASSIGNED'].includes(status);
}

/**
 * Check if a task can start execution
 */
export function canStartExecution(status: TaskStatus): boolean {
  return status === 'ASSIGNED';
}

/**
 * Check if a task can be completed
 */
export function canComplete(status: TaskStatus): boolean {
  return status === 'RUNNING';
}

/**
 * Check if a task is in a terminal state
 */
export function isTerminal(status: TaskStatus): boolean {
  return ['COMPLETED', 'FAILED', 'CANCELLED'].includes(status);
}

/**
 * TaskStatusGuard - Centralized status validation
 */
export class TaskStatusGuard {
  constructor(private currentStatus: TaskStatus) {}

  /**
   * Assert transition is valid, return new guard with updated status
   */
  transitionTo(newStatus: TaskStatus): TaskStatusGuard {
    assertValidTransition(this.currentStatus, newStatus);
    return new TaskStatusGuard(newStatus);
  }

  /**
   * Check if can transition to status
   */
  canTransitionTo(status: TaskStatus): boolean {
    return isValidTransition(this.currentStatus, status);
  }

  /**
   * Assert can accept offers
   */
  assertCanAcceptOffers(): void {
    if (!canAcceptOffers(this.currentStatus)) {
      throw new ConflictError(
        `Cannot accept offers: Task is ${this.currentStatus} (${STATUS_DESCRIPTIONS[this.currentStatus]}). ` +
        `Offers are only accepted when status is OPEN or IN_AUCTION.`
      );
    }
  }

  /**
   * Assert can be cancelled
   */
  assertCanBeCancelled(): void {
    if (!canBeCancelled(this.currentStatus)) {
      throw new ConflictError(
        `Cannot cancel: Task is ${this.currentStatus} (${STATUS_DESCRIPTIONS[this.currentStatus]}). ` +
        `Only OPEN, IN_AUCTION, or ASSIGNED tasks can be cancelled.`
      );
    }
  }

  /**
   * Assert can start execution
   */
  assertCanStartExecution(): void {
    if (!canStartExecution(this.currentStatus)) {
      throw new ConflictError(
        `Cannot start execution: Task is ${this.currentStatus} (${STATUS_DESCRIPTIONS[this.currentStatus]}). ` +
        `Execution can only start when status is ASSIGNED.`
      );
    }
  }

  /**
   * Assert can complete
   */
  assertCanComplete(): void {
    if (!canComplete(this.currentStatus)) {
      throw new ConflictError(
        `Cannot complete: Task is ${this.currentStatus} (${STATUS_DESCRIPTIONS[this.currentStatus]}). ` +
        `Completion is only valid when status is RUNNING.`
      );
    }
  }
}

/**
 * Create a status guard for a task
 */
export function guardStatus(status: TaskStatus): TaskStatusGuard {
  return new TaskStatusGuard(status);
}






