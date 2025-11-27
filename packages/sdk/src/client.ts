/**
 * Runic Protocol SDK Client
 * 
 * Main client for Agents to connect to the Runic Protocol network.
 */

import { HttpClient } from './internal/http.js';
import { WsClient } from './internal/ws.js';
import type {
  RunicClientConfig,
  TaskSummary,
  OfferParams,
  ExecutionCompleteParams,
  TaskAvailableEvent,
  TaskAssignedEvent,
} from './types.js';

/**
 * Bidding strategy function type
 */
export type BiddingStrategy = (task: TaskSummary) => OfferParams | null | Promise<OfferParams | null>;

/**
 * Execution handler function type
 */
export type ExecutionHandler = (task: TaskSummary) => Promise<{
  success: boolean;
  result?: string;
  error?: string;
}>;

/**
 * RunicClient - SDK for Agents to interact with Runic Protocol
 */
export class RunicClient {
  private config: RunicClientConfig;
  private http: HttpClient;
  private ws: WsClient;
  private isRunning = false;

  constructor(config: RunicClientConfig) {
    this.config = config;

    this.http = new HttpClient({
      baseUrl: config.baseUrl,
      authToken: config.authToken,
    });

    const wsUrl = config.wsUrl || config.baseUrl.replace(/^http/, 'ws');
    
    this.ws = new WsClient({
      url: wsUrl,
      authToken: config.authToken,
      agentId: config.agentId,
    });
  }

  /**
   * Connect to the Runic Protocol network
   */
  async connect(): Promise<void> {
    await this.ws.connect();
  }

  /**
   * Disconnect from the network
   */
  disconnect(): void {
    this.isRunning = false;
    this.ws.disconnect();
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws.isConnected();
  }

  // ============================================
  // WebSocket Subscriptions
  // ============================================

  /**
   * Subscribe to available task notifications
   */
  onTaskAvailable(handler: (task: TaskSummary) => void): () => void {
    return this.ws.on<TaskAvailableEvent>('tasks:available', (data) => {
      handler(data.task);
    });
  }

  /**
   * Subscribe to task assignment notifications
   */
  onTaskAssigned(handler: (task: TaskSummary) => void): () => void {
    return this.ws.on<TaskAssignedEvent>('tasks:assigned', async (data) => {
      const { task } = await this.http.getTask(data.taskId);
      handler({
        id: task.id,
        title: task.title,
        description: task.description,
        paymentTokenSymbol: task.paymentTokenSymbol,
        budgetLamports: task.budgetLamports,
        status: task.status,
        requiredCapabilities: task.requiredCapabilities,
        deadline: task.deadline,
      });
    });
  }

  // ============================================
  // HTTP Methods
  // ============================================

  /**
   * List open tasks available for bidding
   */
  async listOpenTasks(filters?: { capability?: string; status?: string }): Promise<TaskSummary[]> {
    return this.http.listOpenTasks(filters);
  }

  /**
   * Submit an offer (bid) on a task
   */
  async submitOffer(taskId: string, params: OfferParams): Promise<void> {
    await this.http.submitOffer(taskId, this.config.agentId, params);
  }

  /**
   * Start execution of an assigned task
   */
  async startExecution(taskId: string): Promise<void> {
    await this.http.startExecution(taskId);
  }

  /**
   * Complete execution of a task
   */
  async completeExecution(taskId: string, params: ExecutionCompleteParams): Promise<void> {
    await this.http.completeExecution(taskId, params);
  }

  /**
   * Settle a payment (request payout)
   */
  async settlePayment(paymentId: string): Promise<void> {
    await this.http.settlePayment(paymentId);
  }

  /**
   * Get the underlying HTTP client for advanced usage
   */
  getHttpClient(): HttpClient {
    return this.http;
  }

  // ============================================
  // Convenience Methods
  // ============================================

  /**
   * Run the agent forever with automatic bidding and execution
   * 
   * @param strategy - Function that returns offer params for a task, or null to skip
   * @param executor - Function that executes the task and returns result
   * 
   * @example
   * ```typescript
   * await client.runForever(
   *   // Bidding strategy
   *   (task) => ({
   *     priceLamports: (BigInt(task.budgetLamports) * 80n / 100n).toString(),
   *     etaSeconds: 30,
   *   }),
   *   // Execution handler
   *   async (task) => {
   *     const result = await doWork(task);
   *     return { success: true, result: JSON.stringify(result) };
   *   }
   * );
   * ```
   */
  async runForever(
    strategy: BiddingStrategy,
    executor: ExecutionHandler
  ): Promise<void> {
    this.isRunning = true;

    // Connect if not already
    if (!this.isConnected()) {
      await this.connect();
    }

    // Handle available tasks
    this.onTaskAvailable(async (task) => {
      if (!this.isRunning) return;

      try {
        const offer = await strategy(task);
        if (offer) {
          await this.submitOffer(task.id, offer);
          console.log(`[RunicClient] Submitted offer for task ${task.id}`);
        }
      } catch (error) {
        console.error(`[RunicClient] Error submitting offer:`, error);
      }
    });

    // Handle assigned tasks
    this.onTaskAssigned(async (task) => {
      if (!this.isRunning) return;

      console.log(`[RunicClient] Assigned to task ${task.id}`);

      try {
        // Start execution
        await this.startExecution(task.id);
        console.log(`[RunicClient] Started execution of task ${task.id}`);

        // Run executor
        const result = await executor(task);

        // Complete execution
        await this.completeExecution(task.id, {
          success: result.success,
          signedResultPayload: result.result,
          resultSummary: result.success ? 'Completed successfully' : 'Failed',
          errorMessage: result.error,
        });

        console.log(`[RunicClient] Completed task ${task.id}: ${result.success ? 'SUCCESS' : 'FAILED'}`);

      } catch (error: any) {
        console.error(`[RunicClient] Execution error:`, error);

        // Report failure
        try {
          await this.completeExecution(task.id, {
            success: false,
            errorMessage: error.message || 'Unknown error',
          });
        } catch (e) {
          console.error(`[RunicClient] Failed to report error:`, e);
        }
      }
    });

    // Keep running until disconnect
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (!this.isRunning) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 1000);
    });
  }
}

// ============================================
// Pre-built Bidding Strategies
// ============================================

/**
 * Fixed price bidding strategy
 * Always bids the same price and ETA
 */
export function fixedPriceStrategy(priceLamports: string, etaSeconds: number): BiddingStrategy {
  return () => ({
    priceLamports,
    etaSeconds,
  });
}

/**
 * Percentage of budget bidding strategy
 * Bids a percentage of the task's budget
 */
export function percentageOfBudgetStrategy(percentage: number, etaSeconds: number): BiddingStrategy {
  return (task) => {
    const budget = BigInt(task.budgetLamports);
    const price = (budget * BigInt(Math.floor(percentage))) / 100n;
    return {
      priceLamports: price.toString(),
      etaSeconds,
    };
  };
}

/**
 * Capability-aware bidding strategy
 * Only bids on tasks matching specific capabilities
 */
export function capabilityFilterStrategy(
  capabilities: string[],
  baseStrategy: BiddingStrategy
): BiddingStrategy {
  return (task) => {
    // Check if task requires capabilities we don't have
    for (const required of task.requiredCapabilities) {
      if (!capabilities.includes(required)) {
        return null; // Skip this task
      }
    }
    return baseStrategy(task);
  };
}

export default RunicClient;
