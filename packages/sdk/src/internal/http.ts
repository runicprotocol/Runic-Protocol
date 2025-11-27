/**
 * HTTP Client for Runic Protocol API
 */

import type {
  AuthResponse,
  CreateAgentInput,
  UpdateAgentInput,
  CreateTaskInput,
  OfferParams,
  ExecutionCompleteParams,
  Agent,
  Task,
  TaskSummary,
  Offer,
  Execution,
  Payment,
  User,
  ApiResponse,
} from '../types.js';

export interface HttpClientConfig {
  baseUrl: string;
  authToken?: string;
}

export class HttpClient {
  private baseUrl: string;
  private authToken?: string;

  constructor(config: HttpClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.authToken = config.authToken;
  }

  /**
   * Set authentication token
   */
  setAuthToken(token: string): void {
    this.authToken = token;
  }

  /**
   * Make an HTTP request
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const json = await response.json();

    if (!response.ok) {
      const error = new Error(json.error?.message || 'Request failed') as any;
      error.code = json.error?.code;
      error.status = response.status;
      throw error;
    }

    // Return the data property if it exists
    return json.data ?? json;
  }

  // ============================================
  // Auth Endpoints
  // ============================================

  async devLogin(email?: string): Promise<AuthResponse> {
    const result = await this.request<AuthResponse>('POST', '/api/auth/dev-login', { email });
    if (result.token) {
      this.authToken = result.token;
    }
    return result;
  }

  async getMe(): Promise<{ user: User & { agents: Agent[]; tasksCreatedCount: number } }> {
    return this.request('GET', '/api/auth/me');
  }

  // ============================================
  // Agent Endpoints
  // ============================================

  async createAgent(input: CreateAgentInput): Promise<{ agent: Agent }> {
    return this.request('POST', '/api/agents', input);
  }

  async listAgents(filters?: {
    isActive?: boolean;
    search?: string;
    capability?: string;
  }): Promise<{ agents: Agent[] }> {
    const params = new URLSearchParams();
    if (filters?.isActive !== undefined) params.set('isActive', String(filters.isActive));
    if (filters?.search) params.set('search', filters.search);
    if (filters?.capability) params.set('capability', filters.capability);
    
    const query = params.toString();
    return this.request('GET', `/api/agents${query ? `?${query}` : ''}`);
  }

  async getAgent(id: string): Promise<{ agent: Agent }> {
    return this.request('GET', `/api/agents/${id}`);
  }

  async updateAgent(id: string, input: UpdateAgentInput): Promise<{ agent: Agent }> {
    return this.request('PATCH', `/api/agents/${id}`, input);
  }

  // ============================================
  // Task Endpoints
  // ============================================

  async createTask(input: CreateTaskInput): Promise<{ task: Task; message: string }> {
    return this.request('POST', '/api/tasks', input);
  }

  async listTasks(filters?: {
    status?: string;
    search?: string;
  }): Promise<{ tasks: Task[] }> {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.search) params.set('search', filters.search);
    
    const query = params.toString();
    return this.request('GET', `/api/tasks${query ? `?${query}` : ''}`);
  }

  async listOpenTasks(filters?: { 
    capability?: string; 
    status?: string 
  }): Promise<TaskSummary[]> {
    const params = new URLSearchParams();
    params.set('status', filters?.status || 'OPEN');
    if (filters?.capability) params.set('capability', filters.capability);
    
    const result = await this.request<{ tasks: Task[] }>('GET', `/api/tasks?${params.toString()}`);
    
    return result.tasks.map(t => ({
      id: t.id,
      title: t.title,
      description: t.description,
      paymentTokenSymbol: t.paymentTokenSymbol,
      budgetLamports: t.budgetLamports,
      status: t.status,
      requiredCapabilities: t.requiredCapabilities,
      deadline: t.deadline,
    }));
  }

  async getTask(id: string): Promise<{ task: Task; auctionTimeRemaining: number | null; offersSummary: any }> {
    return this.request('GET', `/api/tasks/${id}`);
  }

  async cancelTask(id: string): Promise<{ task: Task; message: string }> {
    return this.request('POST', `/api/tasks/${id}/cancel`);
  }

  // ============================================
  // Offer Endpoints
  // ============================================

  async submitOffer(taskId: string, agentId: string, params: OfferParams): Promise<{ offer: Offer }> {
    return this.request('POST', `/api/tasks/${taskId}/offers`, {
      agentId,
      priceLamports: String(params.priceLamports),
      etaSeconds: params.etaSeconds,
    });
  }

  async listOffers(taskId: string): Promise<{ offers: Offer[] }> {
    return this.request('GET', `/api/tasks/${taskId}/offers`);
  }

  // ============================================
  // Execution Endpoints
  // ============================================

  async startExecution(taskId: string): Promise<{ execution: Execution; message: string }> {
    return this.request('POST', `/api/tasks/${taskId}/execution/start`);
  }

  async completeExecution(taskId: string, params: ExecutionCompleteParams): Promise<{ execution: Execution; message: string }> {
    return this.request('POST', `/api/tasks/${taskId}/execution/complete`, params);
  }

  // ============================================
  // Payment Endpoints
  // ============================================

  async listPayments(filters?: {
    agentId?: string;
    taskId?: string;
    status?: string;
  }): Promise<{ payments: Payment[] }> {
    const params = new URLSearchParams();
    if (filters?.agentId) params.set('agentId', filters.agentId);
    if (filters?.taskId) params.set('taskId', filters.taskId);
    if (filters?.status) params.set('status', filters.status);
    
    const query = params.toString();
    return this.request('GET', `/api/payments${query ? `?${query}` : ''}`);
  }

  async getPayment(id: string): Promise<{ payment: Payment }> {
    return this.request('GET', `/api/payments/${id}`);
  }

  async settlePayment(id: string): Promise<{ payment: Payment; message: string }> {
    return this.request('POST', `/api/payments/${id}/settle`);
  }
}
