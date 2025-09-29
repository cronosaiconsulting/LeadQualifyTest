export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: string;
}

type EventCallback = (...args: any[]) => void;

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private subscriptions = new Set<string>();
  private eventListeners = new Map<string, EventCallback[]>();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    this.url = `${protocol}//${window.location.host}/ws`;
  }

  connect(): void {
    try {
      this.ws = new WebSocket(this.url);
      this.setupEventListeners();
    } catch (error) {
      this.emit('error', `Failed to connect: ${error}`);
    }
  }

  disconnect(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private setupEventListeners(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.emit('connect');
      this.startHeartbeat();
      this.resubscribeChannels();
    };

    this.ws.onclose = (event) => {
      console.log('WebSocket disconnected:', event.code, event.reason);
      this.emit('disconnect');
      this.stopHeartbeat();
      
      if (event.code !== 1000) { // Not a normal closure
        this.handleReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.emit('error', 'WebSocket connection error');
    };

    this.ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };
  }

  private handleMessage(message: WebSocketMessage): void {
    this.emit('message', message);

    // Handle specific message types
    switch (message.type) {
      case 'connected':
        console.log('WebSocket handshake completed');
        break;
      case 'subscribed':
        console.log('Subscribed to channel:', message.data.channel);
        break;
      case 'unsubscribed':
        console.log('Unsubscribed from channel:', message.data.channel);
        break;
      case 'system_metrics':
      case 'active_conversations':
      case 'conversation_details':
      case 'decision_traces':
      case 'metrics_update':
      case 'decision_update':
      case 'conversation_update':
      case 'system_alert':
        // Emit specific events for these message types
        this.emit(message.type, message.data);
        break;
      default:
        console.log('Unhandled message type:', message.type);
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Send ping message (browser WebSocket doesn't have ping method)
        try {
          this.sendMessage('ping', { timestamp: Date.now() });
        } catch (error) {
          console.warn('Failed to send ping:', error);
        }
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      
      console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
      
      setTimeout(() => {
        this.connect();
      }, delay);
    } else {
      console.error('Max reconnection attempts reached');
      this.emit('error', 'Failed to reconnect after maximum attempts');
    }
  }

  private resubscribeChannels(): void {
    this.subscriptions.forEach(channel => {
      this.subscribe(channel);
    });
  }

  subscribe(channel: string): void {
    this.subscriptions.add(channel);
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendMessage('subscribe', { channel });
    }
  }

  unsubscribe(channel: string): void {
    this.subscriptions.delete(channel);
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendMessage('unsubscribe', { channel });
    }
  }

  sendMessage(type: string, data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message = {
        type,
        data,
        timestamp: new Date().toISOString()
      };
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, cannot send message');
    }
  }

  on(event: string, callback: EventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  off(event: string, callback: EventCallback): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  private emit(event: string, ...args: any[]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(...args);
        } catch (error) {
          console.error(`Error in WebSocket event listener for ${event}:`, error);
        }
      });
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getConnectionState(): string {
    if (!this.ws) return 'disconnected';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'connected';
      case WebSocket.CLOSING: return 'closing';
      case WebSocket.CLOSED: return 'closed';
      default: return 'unknown';
    }
  }
}
