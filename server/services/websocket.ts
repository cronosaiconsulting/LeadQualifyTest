import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { storage } from '../storage';
import { metricsService } from './metrics';
import { tracingService } from './tracing';

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: string;
}

export interface ClientConnection {
  id: string;
  ws: WebSocket;
  subscriptions: Set<string>;
  lastPing: Date;
  traceId?: string;
}

export class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ClientConnection> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;

  initialize(server: Server): void {
    this.wss = new WebSocketServer({ 
      server, 
      path: '/ws',
      clientTracking: true
    });

    this.wss.on('connection', (ws, request) => {
      this.handleConnection(ws, request);
    });

    // Set up ping/pong for connection health
    this.pingInterval = setInterval(() => {
      this.pingClients();
    }, 30000); // Ping every 30 seconds

    console.log('WebSocket server initialized on path /ws');
  }

  private handleConnection(ws: WebSocket, request: any): void {
    const clientId = this.generateClientId();
    
    // Start trace for WebSocket connection
    const traceId = tracingService.startTrace(
      'websocket_connection',
      'system',
      {
        clientId,
        userAgent: request.headers['user-agent'],
        ip: request.socket.remoteAddress,
        origin: request.headers.origin
      }
    );
    
    const client: ClientConnection = {
      id: clientId,
      ws,
      subscriptions: new Set(),
      lastPing: new Date(),
      traceId
    };

    this.clients.set(clientId, client);
    
    tracingService.logStructured('info', 'websocket_client_connected', {
      clientId,
      traceId,
      connectionCount: this.clients.size
    });

    // Send welcome message
    this.sendToClient(clientId, {
      type: 'connected',
      data: { clientId, timestamp: new Date().toISOString() },
      timestamp: new Date().toISOString()
    });

    // Handle incoming messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleClientMessage(clientId, message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    // Handle client disconnect
    ws.on('close', () => {
      const client = this.clients.get(clientId);
      if (client?.traceId) {
        tracingService.logStructured('info', 'websocket_client_disconnected', {
          clientId,
          traceId: client.traceId,
          connectionCount: this.clients.size - 1
        });
        tracingService.finishTrace(client.traceId);
      }
      this.clients.delete(clientId);
      console.log(`Client ${clientId} disconnected`);
    });

    // Handle pong responses
    ws.on('pong', () => {
      const client = this.clients.get(clientId);
      if (client) {
        client.lastPing = new Date();
      }
    });

    console.log(`Client ${clientId} connected`);
  }

  private handleClientMessage(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case 'subscribe':
        this.handleSubscription(clientId, message.data);
        break;
      
      case 'unsubscribe':
        this.handleUnsubscription(clientId, message.data);
        break;
      
      case 'get_system_status':
        this.sendSystemStatus(clientId);
        break;
      
      case 'get_active_conversations':
        this.sendActiveConversations(clientId);
        break;
      
      case 'get_conversation_details':
        this.sendConversationDetails(clientId, message.data.conversationId);
        break;

      default:
        console.log(`Unknown message type: ${message.type}`);
    }
  }

  private handleSubscription(clientId: string, subscription: { channel: string }): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.subscriptions.add(subscription.channel);
    
    this.sendToClient(clientId, {
      type: 'subscribed',
      data: { channel: subscription.channel },
      timestamp: new Date().toISOString()
    });

    // Send initial data for the subscription
    this.sendInitialData(clientId, subscription.channel);
  }

  private handleUnsubscription(clientId: string, subscription: { channel: string }): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.subscriptions.delete(subscription.channel);
    
    this.sendToClient(clientId, {
      type: 'unsubscribed',
      data: { channel: subscription.channel },
      timestamp: new Date().toISOString()
    });
  }

  private async sendInitialData(clientId: string, channel: string): Promise<void> {
    switch (channel) {
      case 'system_metrics':
        await this.sendSystemStatus(clientId);
        break;
      
      case 'active_conversations':
        await this.sendActiveConversations(clientId);
        break;
      
      case 'decision_traces':
        await this.sendRecentDecisionTraces(clientId);
        break;
    }
  }

  private async sendSystemStatus(clientId: string): Promise<void> {
    try {
      const metrics = await storage.getSystemMetrics();
      
      this.sendToClient(clientId, {
        type: 'system_metrics',
        data: {
          ...metrics,
          timestamp: new Date().toISOString(),
          connectedClients: this.clients.size,
          uptime: process.uptime()
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error sending system status:', error);
    }
  }

  private async sendActiveConversations(clientId: string): Promise<void> {
    try {
      const conversations = await storage.getActiveConversations();
      
      // Enhance with latest metrics for each conversation
      const enhancedConversations = await Promise.all(
        conversations.map(async (conv) => {
          const metrics = await storage.getLatestMetrics(conv.id);
          const lastMessage = await storage.getLatestMessage(conv.id);
          
          return {
            ...conv,
            qualificationScore: metrics?.qualificationScore || 0,
            engagementScore: metrics?.engagementScore || 0,
            lastMessage: lastMessage?.content.substring(0, 100) || '',
            lastActivity: conv.lastActivity.toISOString()
          };
        })
      );

      this.sendToClient(clientId, {
        type: 'active_conversations',
        data: enhancedConversations,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error sending active conversations:', error);
    }
  }

  private async sendConversationDetails(clientId: string, conversationId: string): Promise<void> {
    try {
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) return;

      const metrics = await storage.getLatestMetrics(conversationId);
      const messages = await storage.getMessages(conversationId, 20);
      const decisionTraces = await storage.getDecisionTraces(conversationId, 10);

      let situationState = null;
      if (metrics) {
        situationState = metricsService.createSituationAwarenessState(conversationId, metrics);
      }

      this.sendToClient(clientId, {
        type: 'conversation_details',
        data: {
          conversation,
          metrics,
          situationState,
          messages: messages.reverse(), // Show oldest first
          decisionTraces,
          timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error sending conversation details:', error);
    }
  }

  private async sendRecentDecisionTraces(clientId: string): Promise<void> {
    try {
      const traces = await storage.getDecisionTraces(undefined, 10);
      
      this.sendToClient(clientId, {
        type: 'decision_traces',
        data: traces,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error sending decision traces:', error);
    }
  }

  // Public methods for broadcasting updates
  async broadcastMetricsUpdate(conversationId: string): Promise<void> {
    const metrics = await storage.getLatestMetrics(conversationId);
    if (!metrics) return;

    const situationState = metricsService.createSituationAwarenessState(conversationId, metrics);

    this.broadcast('metrics_update', {
      conversationId,
      metrics,
      situationState,
      timestamp: new Date().toISOString()
    });
  }

  async broadcastDecisionUpdate(trace: any): Promise<void> {
    this.broadcast('decision_update', {
      trace,
      timestamp: new Date().toISOString()
    });
  }

  async broadcastConversationUpdate(conversationId: string): Promise<void> {
    const conversation = await storage.getConversation(conversationId);
    if (!conversation) return;

    this.broadcast('conversation_update', {
      conversation,
      timestamp: new Date().toISOString()
    });
  }

  async broadcastSystemAlert(alert: { level: string, message: string, data?: any }): Promise<void> {
    this.broadcast('system_alert', {
      ...alert,
      timestamp: new Date().toISOString()
    });
  }

  private broadcast(type: string, data: any): void {
    const message: WebSocketMessage = {
      type,
      data,
      timestamp: new Date().toISOString()
    };

    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(JSON.stringify(message));
        } catch (error) {
          console.error('Error broadcasting to client:', error);
        }
      }
    });
  }

  private sendToClient(clientId: string, message: WebSocketMessage): void {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      client.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error(`Error sending message to client ${clientId}:`, error);
    }
  }

  private pingClients(): void {
    const now = new Date();
    
    this.clients.forEach((client, clientId) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        // Remove clients that haven't responded to ping in 60 seconds
        if (now.getTime() - client.lastPing.getTime() > 60000) {
          console.log(`Removing unresponsive client ${clientId}`);
          client.ws.terminate();
          this.clients.delete(clientId);
          return;
        }

        // Send ping
        client.ws.ping();
      } else {
        this.clients.delete(clientId);
      }
    });
  }

  private generateClientId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  getConnectedClientsCount(): number {
    return this.clients.size;
  }

  close(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    this.clients.forEach((client) => {
      client.ws.close();
    });

    if (this.wss) {
      this.wss.close();
    }
  }
}

export const websocketService = new WebSocketService();
