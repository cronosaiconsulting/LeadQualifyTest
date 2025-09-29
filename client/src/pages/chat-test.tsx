import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { MessageSquare, Send, Bot, User, Zap, BarChart3, Brain, Play, Pause, Settings } from 'lucide-react';
import { useWebSocket } from '@/hooks/use-websocket';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface Message {
  id: string;
  conversationId: string;
  direction: 'incoming' | 'outgoing';
  content: string;
  messageType: string;
  timestamp: string;
  metadata?: any;
}

interface Conversation {
  id: string;
  contactName: string;
  contactPhone: string;
  status: string;
  language: string;
  region: string;
}

interface ConversationMetrics {
  id: string;
  conversationId: string;
  engagementScore: number;
  qualificationScore: number;
  technicalScore: number;
  emotionalScore: number;
  culturalScore: number;
  budgetSignalStrength: number;
  authorityScore: number;
  needIntensity: number;
  timestamp: string;
}

interface DecisionTrace {
  id: string;
  conversationId: string;
  action: string;
  reasoning: string;
  confidence: number;
  timestamp: string;
}

export default function ChatTestPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isConnected, lastMessage } = useWebSocket();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Listen for WebSocket updates
  useEffect(() => {
    if (lastMessage && selectedConversation) {
      if (lastMessage.type === 'conversation_update' && lastMessage.data.conversation.id === selectedConversation) {
        // Refresh messages when conversation updates
        queryClient.invalidateQueries({ queryKey: ['/api/messages', selectedConversation] });
      }
    }
  }, [lastMessage, selectedConversation, queryClient]);

  // Fetch active conversations
  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ['/api/conversations'],
    queryFn: async () => {
      const response = await fetch('/api/conversations?status=active&limit=10');
      if (!response.ok) throw new Error('Failed to fetch conversations');
      return response.json();
    },
    refetchInterval: 10000
  });

  // Fetch messages for selected conversation
  const { data: conversationMessages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ['/api/messages', selectedConversation],
    queryFn: async () => {
      if (!selectedConversation) return [];
      const response = await fetch(`/api/messages/${selectedConversation}?limit=50`);
      if (!response.ok) throw new Error('Failed to fetch messages');
      return response.json();
    },
    enabled: !!selectedConversation,
    refetchInterval: 5000
  });

  // Fetch latest metrics for selected conversation
  const { data: metrics } = useQuery<ConversationMetrics>({
    queryKey: ['/api/metrics', selectedConversation],
    queryFn: async () => {
      if (!selectedConversation) return null;
      const response = await fetch(`/api/conversations/${selectedConversation}/metrics/latest`);
      if (!response.ok) throw new Error('Failed to fetch metrics');
      return response.json();
    },
    enabled: !!selectedConversation,
    refetchInterval: 5000
  });

  // Fetch latest decision traces
  const { data: decisionTraces = [] } = useQuery<DecisionTrace[]>({
    queryKey: ['/api/decision-traces', selectedConversation],
    queryFn: async () => {
      if (!selectedConversation) return [];
      const response = await fetch(`/api/decision-traces?conversationId=${selectedConversation}&limit=5`);
      if (!response.ok) throw new Error('Failed to fetch decision traces');
      return response.json();
    },
    enabled: !!selectedConversation,
    refetchInterval: 5000
  });

  // Update messages when conversation messages change
  useEffect(() => {
    setMessages(conversationMessages);
  }, [conversationMessages]);

  // Create new test conversation
  const createConversationMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          whatsappId: `test_${Date.now()}`,
          contactName: `Test User ${Date.now()}`,
          contactPhone: `+34600${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
          company: 'Test Company',
          status: 'active',
          language: 'es',
          region: 'ES'
        })
      });
      if (!response.ok) throw new Error('Failed to create conversation');
      return response.json();
    },
    onSuccess: (conversation) => {
      setSelectedConversation(conversation.id);
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      toast({ title: 'Test conversation created', description: `Conversation with ${conversation.contactName}` });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create test conversation', variant: 'destructive' });
    }
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!selectedConversation) throw new Error('No conversation selected');
      
      const response = await fetch(`/api/conversations/${selectedConversation}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content,
          direction: 'incoming',
          messageType: 'text'
        })
      });
      if (!response.ok) throw new Error('Failed to send message');
      return response.json();
    },
    onSuccess: () => {
      setNewMessage('');
      queryClient.invalidateQueries({ queryKey: ['/api/messages', selectedConversation] });
      queryClient.invalidateQueries({ queryKey: ['/api/metrics', selectedConversation] });
      queryClient.invalidateQueries({ queryKey: ['/api/decision-traces', selectedConversation] });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to send message', variant: 'destructive' });
    }
  });

  // Simulate Grok conversation
  const simulateConversationMutation = useMutation({
    mutationFn: async () => {
      if (!selectedConversation) throw new Error('No conversation selected');
      
      const response = await fetch(`/api/conversations/${selectedConversation}/simulate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          scenario: 'spanish_b2b_consulting',
          messageCount: 8,
          dealSize: 10000
        })
      });
      if (!response.ok) throw new Error('Failed to start simulation');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Simulation started', description: 'Grok is generating conversation flow' });
      queryClient.invalidateQueries({ queryKey: ['/api/messages', selectedConversation] });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to start simulation', variant: 'destructive' });
    }
  });

  const handleSendMessage = () => {
    if (!newMessage.trim() || !selectedConversation) return;
    sendMessageMutation.mutate(newMessage.trim());
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getMetricColor = (value: number) => {
    if (value >= 0.7) return 'text-green-600';
    if (value >= 0.4) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Conversations Sidebar */}
      <div className="w-80 border-r bg-muted/10">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Chat Testing</h2>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-xs text-muted-foreground">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
          
          <Button 
            onClick={() => createConversationMutation.mutate()}
            disabled={createConversationMutation.isPending}
            className="w-full mb-4"
            data-testid="button-create-conversation"
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            New Test Conversation
          </Button>

          <ScrollArea className="h-[calc(100vh-140px)]">
            <div className="space-y-2">
              {conversations.map((conversation) => (
                <Card 
                  key={conversation.id}
                  className={`cursor-pointer transition-colors ${
                    selectedConversation === conversation.id ? 'bg-primary/10 border-primary' : 'hover:bg-muted/50'
                  }`}
                  onClick={() => setSelectedConversation(conversation.id)}
                  data-testid={`conversation-${conversation.id}`}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm" data-testid="conversation-name">
                          {conversation.contactName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {conversation.contactPhone}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {conversation.status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="border-b p-4 bg-muted/10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold" data-testid="chat-header">
                    {conversations.find(c => c.id === selectedConversation)?.contactName || 'Test Conversation'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Spanish LATAM B2B Testing • {messages.length} messages
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => simulateConversationMutation.mutate()}
                    disabled={simulateConversationMutation.isPending}
                    data-testid="button-simulate"
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    Simulate with Grok
                  </Button>
                  <Button variant="outline" size="sm">
                    <Settings className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              {messagesLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-muted-foreground">Loading messages...</div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}
                      data-testid={`message-${message.id}`}
                    >
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                          message.direction === 'outgoing'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {message.direction === 'outgoing' ? (
                            <Bot className="w-4 h-4" />
                          ) : (
                            <User className="w-4 h-4" />
                          )}
                          <span className="text-xs opacity-70">
                            {formatTimestamp(message.timestamp)}
                          </span>
                        </div>
                        <p className="text-sm" data-testid="message-content">
                          {message.content}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Message Input */}
            <div className="border-t p-4">
              <div className="flex gap-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type a test message in Spanish..."
                  disabled={sendMessageMutation.isPending}
                  className="flex-1"
                  data-testid="input-message"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim() || sendMessageMutation.isPending}
                  data-testid="button-send"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Select a conversation</h3>
              <p className="text-muted-foreground">
                Choose a conversation to start testing or create a new one
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Metrics & Analysis Sidebar */}
      {selectedConversation && (
        <div className="w-80 border-l bg-muted/10 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {/* Real-time Metrics */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    Live Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {metrics ? (
                    <>
                      <div className="flex justify-between text-sm">
                        <span>Engagement</span>
                        <span className={getMetricColor(metrics.engagementScore)} data-testid="metric-engagement">
                          {Math.round(metrics.engagementScore * 100)}%
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Qualification</span>
                        <span className={getMetricColor(metrics.qualificationScore)} data-testid="metric-qualification">
                          {Math.round(metrics.qualificationScore * 100)}%
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Technical</span>
                        <span className={getMetricColor(metrics.technicalScore)} data-testid="metric-technical">
                          {Math.round(metrics.technicalScore * 100)}%
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Cultural</span>
                        <span className={getMetricColor(metrics.culturalScore)} data-testid="metric-cultural">
                          {Math.round(metrics.culturalScore * 100)}%
                        </span>
                      </div>
                      <Separator />
                      <div className="flex justify-between text-sm">
                        <span>Budget Signal</span>
                        <span className={getMetricColor(metrics.budgetSignalStrength)} data-testid="metric-budget">
                          {Math.round(metrics.budgetSignalStrength * 100)}%
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Authority</span>
                        <span className={getMetricColor(metrics.authorityScore)} data-testid="metric-authority">
                          {Math.round(metrics.authorityScore * 100)}%
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground">No metrics yet</div>
                  )}
                </CardContent>
              </Card>

              {/* Decision Traces */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Brain className="w-4 h-4" />
                    AI Decision Traces
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {decisionTraces.length > 0 ? (
                      decisionTraces.map((trace) => (
                        <div key={trace.id} className="text-xs border-l-2 border-primary/20 pl-2" data-testid={`trace-${trace.id}`}>
                          <div className="font-medium">{trace.action}</div>
                          <div className="text-muted-foreground truncate">
                            {trace.reasoning.substring(0, 80)}...
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-muted-foreground">
                              {formatTimestamp(trace.timestamp)}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {Math.round(trace.confidence * 100)}%
                            </Badge>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-muted-foreground">No decisions yet</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}