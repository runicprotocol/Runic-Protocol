/**
 * @runic/sdk - Official SDK for Runic Protocol
 * 
 * A Solana-based M2M execution and payment protocol.
 * 
 * @example Basic Usage
 * ```typescript
 * import { RunicClient } from '@runic/sdk';
 * 
 * const client = new RunicClient({
 *   baseUrl: 'http://localhost:3001',
 *   wsUrl: 'ws://localhost:3001',
 *   authToken: '<DEV_JWT>',
 *   agentId: '<AGENT_ID>',
 * });
 * 
 * await client.connect();
 * 
 * client.onTaskAvailable(async (task) => {
 *   console.log('Task available:', task.title);
 *   await client.submitOffer(task.id, {
 *     priceLamports: 1000000,
 *     etaSeconds: 30,
 *   });
 * });
 * 
 * client.onTaskAssigned(async (task) => {
 *   console.log('Task assigned:', task.id);
 *   await client.startExecution(task.id);
 *   // ... do work ...
 *   await client.completeExecution(task.id, {
 *     success: true,
 *     signedResultPayload: JSON.stringify({ result: 'done' }),
 *     resultSummary: 'Task completed successfully',
 *   });
 * });
 * ```
 * 
 * @example Run Forever with Strategy
 * ```typescript
 * import { RunicClient, percentageOfBudgetStrategy } from '@runic/sdk';
 * 
 * const client = new RunicClient({ ... });
 * 
 * await client.runForever(
 *   percentageOfBudgetStrategy(80, 30), // Bid 80% of budget, 30s ETA
 *   async (task) => {
 *     const result = await performWork(task);
 *     return { success: true, result: JSON.stringify(result) };
 *   }
 * );
 * ```
 * 
 * @packageDocumentation
 */

// Main client
export { 
  RunicClient,
  // Strategies
  fixedPriceStrategy,
  percentageOfBudgetStrategy,
  capabilityFilterStrategy,
} from './client.js';

// Types
export type { 
  BiddingStrategy, 
  ExecutionHandler 
} from './client.js';

// HTTP client for direct API access
export { HttpClient } from './internal/http.js';

// WebSocket client
export { WsClient } from './internal/ws.js';

// All types
export type {
  // Enums
  TaskStatus,
  OfferStatus,
  ExecutionStatus,
  PaymentStatus,
  
  // Core models
  User,
  Agent,
  Task,
  TaskSummary,
  Offer,
  Execution,
  Payment,
  ReputationEvent,
  
  // Input types
  CreateAgentInput,
  UpdateAgentInput,
  CreateTaskInput,
  OfferParams,
  ExecutionCompleteParams,
  
  // Event types
  EventType,
  TaskAvailableEvent,
  TaskAssignedEvent,
  AuctionCompletedEvent,
  ExecutionCompletedEvent,
  
  // Config types
  RunicClientConfig,
  
  // API types
  ApiResponse,
  ApiError,
  AuthResponse,
} from './types.js';
