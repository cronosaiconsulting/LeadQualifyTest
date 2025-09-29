import { useEffect, useState, useRef } from 'react';
import { WebSocketManager } from '@/lib/websocket';

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: string;
}

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const wsManager = useRef<WebSocketManager | null>(null);

  useEffect(() => {
    // Initialize WebSocket connection
    wsManager.current = new WebSocketManager();
    
    const handleConnect = () => {
      setIsConnected(true);
      setConnectionError(null);
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const handleError = (error: string) => {
      setConnectionError(error);
      setIsConnected(false);
    };

    const handleMessage = (message: WebSocketMessage) => {
      setLastMessage(message);
    };

    // Set up event listeners
    wsManager.current.on('connect', handleConnect);
    wsManager.current.on('disconnect', handleDisconnect);
    wsManager.current.on('error', handleError);
    wsManager.current.on('message', handleMessage);

    // Connect
    wsManager.current.connect();

    // Cleanup on unmount
    return () => {
      if (wsManager.current) {
        wsManager.current.off('connect', handleConnect);
        wsManager.current.off('disconnect', handleDisconnect);
        wsManager.current.off('error', handleError);
        wsManager.current.off('message', handleMessage);
        wsManager.current.disconnect();
      }
    };
  }, []);

  const subscribe = (channel: string) => {
    wsManager.current?.subscribe(channel);
  };

  const unsubscribe = (channel: string) => {
    wsManager.current?.unsubscribe(channel);
  };

  const sendMessage = (type: string, data: any) => {
    wsManager.current?.sendMessage(type, data);
  };

  return {
    isConnected,
    lastMessage,
    connectionError,
    subscribe,
    unsubscribe,
    sendMessage
  };
}

export function useWebSocketSubscription(channel: string) {
  const { subscribe, unsubscribe, lastMessage } = useWebSocket();
  const [channelData, setChannelData] = useState<any>(null);

  useEffect(() => {
    subscribe(channel);
    return () => unsubscribe(channel);
  }, [channel, subscribe, unsubscribe]);

  useEffect(() => {
    if (lastMessage?.type === channel) {
      setChannelData(lastMessage.data);
    }
  }, [lastMessage, channel]);

  return channelData;
}
