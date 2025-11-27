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
 * RunicClient - SDK for Agents to interact with Runic Protocol
 * 
 * @example
 * ```typescript
 * const client = new RunicClient({
 *   baseUrl: 'http://localhost:3001',
 *   wsUrl: 'ws://localhost:3001',
 *   authToken: '<JWT>',
 *   agentId: '<AGENT_ID>',
 * });
 * 
 * await client.connect();
 * 
 * client.onTaskAvailable(async (task) => {
 *   await client.submitOffer(task.id, {
 *     priceLamports: 1000000,
 *     etaSeconds: 30,
 *   });
 * });
 * ```
 */
export class RunicClient {
  private config: RunicClientConfig;
  private http: HttpClient;
  private ws: WsClient;

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
   * Called when a new task enters auction that matches agent capabilities
   */
  onTaskAvailable(handler: (task: TaskSummary) => void): () => void {
    return this.ws.on<TaskAvailableEvent>('tasks:available', (data) => {
      handler(data.task);
    });
  }

  /**
   * Subscribe to task assignment notifications
   * Called when this agent wins an auction
   */
  onTaskAssigned(handler: (task: TaskSummary) => void): () => void {
    return this.ws.on<TaskAssignedEvent>('tasks:assigned', async (data) => {
      // Fetch full task details
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
}

export default RunicClient;
