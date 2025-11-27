/**
 * WebSocket Client for Runic Protocol Real-time Events
 */

import { io, Socket } from 'socket.io-client';
import type { EventType } from '../types.js';

export interface WsClientConfig {
  url: string;
  authToken: string;
  agentId: string;
}

export type EventHandler<T = unknown> = (data: T) => void;

export class WsClient {
  private socket: Socket | null = null;
  private config: WsClientConfig;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private connected = false;

  constructor(config: WsClientConfig) {
    this.config = config;
  }

  /**
   * Connect to the WebSocket server (agents namespace)
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }

      const url = `${this.config.url}/agents`;

      this.socket = io(url, {
        query: {
          token: this.config.authToken,
          agentId: this.config.agentId,
        },
        transports: ['websocket', 'polling'],
      });

      this.socket.on('connect', () => {
        this.connected = true;
        
        // Subscribe to available tasks
        this.socket!.emit('subscribe:tasks');
        
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        if (!this.connected) {
          reject(error);
        }
      });

      this.socket.on('disconnect', () => {
        this.connected = false;
      });

      // Set up event forwarding
      this.setupEventForwarding();
    });
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected && this.socket?.connected === true;
  }

  /**
   * Subscribe to an event
   */
  on<T = unknown>(event: EventType | string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    
    this.handlers.get(event)!.add(handler as EventHandler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(event)?.delete(handler as EventHandler);
    };
  }

  /**
   * Unsubscribe from an event
   */
  off(event: EventType | string, handler?: EventHandler): void {
    if (handler) {
      this.handlers.get(event)?.delete(handler);
    } else {
      this.handlers.delete(event);
    }
  }

  /**
   * Set up event forwarding from socket to handlers
   */
  private setupEventForwarding(): void {
    if (!this.socket) return;

    // All events we care about
    const events: (EventType | string)[] = [
      'tasks:available',
      'tasks:assigned',
      'tasks:updated',
      'offers:created',
      'auctions:completed',
      'executions:completed',
      'payments:updated',
    ];

    events.forEach(event => {
      this.socket!.on(event, (data: unknown) => {
        const handlers = this.handlers.get(event);
        if (handlers) {
          handlers.forEach(handler => handler(data));
        }
      });
    });
  }
}
