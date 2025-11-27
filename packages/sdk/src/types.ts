/**
 * Runic Protocol SDK Types
 * 
 * Type definitions for the Runic Protocol domain model.
 */

// ============================================
// Enums
// ============================================

export type TaskStatus = 
  | 'OPEN'
  | 'IN_AUCTION'
  | 'ASSIGNED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type OfferStatus = 
  | 'PENDING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'CANCELLED';

export type ExecutionStatus = 
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILURE';

export type PaymentStatus = 
  | 'PENDING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REFUNDED';

// ============================================
// Core Models
// ============================================

export interface User {
  id: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  name: string;
  description?: string;
  ownerUserId: string;
  walletAddress: string;
  capabilities: string[];
  reputationScore: number;
  totalTasksCompleted: number;
  totalTasksFailed: number;
  avgCompletionSeconds?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  chain: string;
  paymentTokenSymbol: string;
  budgetLamports: string; // BigInt as string
  createdByUserId: string;
  status: TaskStatus;
  requiredCapabilities: string[];
  deadline?: string | null;
  assignedAgentId?: string | null;
  createdAt: string;
  updatedAt: string;
  
  // Populated relations
  createdByUser?: Pick<User, 'id' | 'email'>;
  assignedAgent?: Pick<Agent, 'id' | 'name'>;
  offers?: Offer[];
  executions?: Execution[];
}

export interface TaskSummary {
  id: string;
  title: string;
  description: string;
  paymentTokenSymbol: string;
  budgetLamports: string;
  status: string;
  requiredCapabilities: string[];
  deadline?: string | null;
}

export interface Offer {
  id: string;
  taskId: string;
  agentId: string;
  priceLamports: string; // BigInt as string
  etaSeconds: number;
  status: OfferStatus;
  score: number;
  createdAt: string;
  
  // Populated relations
  agent?: Pick<Agent, 'id' | 'name' | 'reputationScore'>;
  task?: Task;
}

export interface Execution {
  id: string;
  taskId: string;
  agentId: string;
  startedAt: string;
  completedAt?: string;
  status: ExecutionStatus;
  signedResultPayload?: string;
  resultSummary?: string;
  errorMessage?: string;
  proofHash?: string;
  createdAt: string;
  
  // Populated relations
  task?: Pick<Task, 'id' | 'title'>;
  agent?: Pick<Agent, 'id' | 'name'>;
}

export interface Payment {
  id: string;
  taskId: string;
  agentId: string;
  amountLamports: string; // BigInt as string
  tokenSymbol: string;
  status: PaymentStatus;
  txHash?: string;
  chain: string;
  createdAt: string;
  updatedAt: string;
  
  // Populated relations
  task?: Pick<Task, 'id' | 'title'>;
  agent?: Pick<Agent, 'id' | 'name' | 'walletAddress'>;
}

export interface ReputationEvent {
  id: string;
  agentId: string;
  taskId: string;
  deltaScore: number;
  reason: string;
  createdAt: string;
}

// ============================================
// API Request/Response Types
// ============================================

export interface ApiResponse<T> {
  data: T;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  walletAddress: string;
  capabilities: string[];
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  capabilities?: string[];
  isActive?: boolean;
}

export interface CreateTaskInput {
  title: string;
  description: string;
  paymentTokenSymbol?: string;
  budgetLamports: string;
  deadline?: string;
  requiredCapabilities?: string[];
}

export interface OfferParams {
  priceLamports: string | number;
  etaSeconds: number;
}

export interface ExecutionCompleteParams {
  success: boolean;
  signedResultPayload?: string;
  resultSummary?: string;
  proofHash?: string;
  errorMessage?: string;
}

// ============================================
// WebSocket Event Types
// ============================================

export type EventType =
  | 'tasks:created'
  | 'tasks:updated'
  | 'tasks:available'
  | 'tasks:assigned'
  | 'offers:created'
  | 'auctions:completed'
  | 'executions:completed'
  | 'payments:updated';

export interface TaskAvailableEvent {
  task: TaskSummary;
  auctionEndsAt?: string;
}

export interface TaskAssignedEvent {
  taskId: string;
  offer: Offer;
}

export interface AuctionCompletedEvent {
  taskId: string;
  winningOffer: Offer | null;
  totalOffers: number;
  auctionDurationMs: number;
}

export interface ExecutionCompletedEvent {
  taskId: string;
  agentId: string;
  execution: Execution;
  success: boolean;
}

// ============================================
// SDK Configuration
// ============================================

export interface RunicClientConfig {
  /** Base URL for the Runic Protocol API */
  baseUrl: string;
  /** WebSocket URL (defaults to baseUrl) */
  wsUrl?: string;
  /** JWT token for authentication */
  authToken: string;
  /** Agent ID to operate as */
  agentId: string;
}
