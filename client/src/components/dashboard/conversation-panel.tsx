import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useWebSocket } from "@/hooks/use-websocket";
import { User, Phone, Building, MessageCircle, TrendingUp, Clock, ChartBar, Settings, HelpCircle } from "lucide-react";

interface ConversationSummary {
  id: string;
  contactName: string;
  contactPhone: string;
  company?: string;
  status: string;
  qualificationScore: number;
  engagementScore: number;
  lastMessage: string;
  lastActivity: string;
  messageCount: number;
  tags: string[];
}

interface ConversationDetails {
  conversation: any;
  metrics: any;
  situationState: any;
  messages: any[];
  decisionTraces: any[];
}

function ConversationCard({ conversation, onClick }: { 
  conversation: ConversationSummary; 
  onClick: () => void;
}) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'paused': return 'bg-yellow-500';
      case 'qualified': return 'bg-blue-500';
      case 'disqualified': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getQualificationColor = (score: number) => {
    if (score >= 0.7) return 'text-green-400';
    if (score >= 0.4) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  };

  const timeAgo = (dateString: string) => {
    const now = new Date().getTime();
    const time = new Date(dateString).getTime();
    const diffMinutes = Math.floor((now - time) / (1000 * 60));
    
    if (diffMinutes < 1) return 'now';
    if (diffMinutes < 60) return `${diffMinutes}m`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h`;
    return `${Math.floor(diffMinutes / 1440)}d`;
  };

  return (
    <div 
      className="bg-muted rounded-lg p-3 cursor-pointer hover:bg-accent transition-colors group"
      onClick={onClick}
      data-testid={`conversation-${conversation.id}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center">
            <span className="text-xs font-medium text-primary" data-testid="contact-initials">
              {getInitials(conversation.contactName)}
            </span>
          </div>
          <div>
            <p className="text-sm font-medium" data-testid="contact-name">
              {conversation.contactName}
            </p>
            {conversation.company && (
              <div className="flex items-center gap-1">
                <Building className="w-3 h-3 text-muted-foreground" />
                <p className="text-xs text-muted-foreground" data-testid="company">
                  {conversation.company}
                </p>
              </div>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground" data-testid="last-activity">
            {timeAgo(conversation.lastActivity)}
          </p>
          <div className={`w-2 h-2 rounded-full ${getStatusColor(conversation.status)} mt-1`} />
        </div>
      </div>
      
      <div className="space-y-1 mb-2">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Qualification</span>
          <span className={`font-medium ${getQualificationColor(conversation.qualificationScore)}`}>
            {Math.round(conversation.qualificationScore * 100)}%
          </span>
        </div>
        <div className="w-full h-1 bg-background rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${conversation.qualificationScore * 100}%` }}
          />
        </div>
      </div>
      
      <p className="text-xs text-muted-foreground line-clamp-2 mb-2" data-testid="last-message">
        {conversation.lastMessage}
      </p>
      
      <div className="flex gap-1 flex-wrap">
        {conversation.tags.map((tag, index) => (
          <Badge key={index} variant="secondary" className="text-xs">
            {tag}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function ConversationDetailsModal({ 
  conversationId, 
  isOpen, 
  onClose 
}: { 
  conversationId: string | null; 
  isOpen: boolean; 
  onClose: () => void;
}) {
  const { data: details, isLoading } = useQuery<ConversationDetails>({
    queryKey: ['/api/conversations', conversationId],
    enabled: !!conversationId && isOpen
  });

  if (!conversationId || !isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            Conversation Analysis - {details?.conversation?.contactName || 'Loading...'}
          </DialogTitle>
        </DialogHeader>
        
        {isLoading ? (
          <div className="flex items-center justify-center h-96">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : details ? (
          <div className="grid grid-cols-4 gap-4 h-[70vh]">
            {/* Messages - 2 columns */}
            <div className="col-span-2">
              <div className="h-full border rounded-md">
                <div className="p-3 border-b bg-muted/50">
                  <h3 className="font-medium">Conversation History</h3>
                </div>
                <ScrollArea className="h-[calc(100%-3rem)] p-4">
                  <div className="space-y-4">
                    {details.messages?.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-xs lg:max-w-md px-3 py-2 rounded-lg text-sm ${
                            message.direction === 'outgoing'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          }`}
                        >
                          <p>{message.content}</p>
                          <p className="text-xs opacity-70 mt-1">
                            {new Date(message.timestamp).toLocaleTimeString('es-ES')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>

            {/* Metrics - 1 column */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Live Metrics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {details.situationState && (
                    <>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span>Engagement</span>
                          <span>{Math.round(details.situationState.dimensions.engagement.score * 100)}%</span>
                        </div>
                        <Progress 
                          value={details.situationState.dimensions.engagement.score * 100} 
                          className="h-1"
                        />
                      </div>
                      
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span>Qualification</span>
                          <span>{Math.round(details.situationState.dimensions.qualification.score * 100)}%</span>
                        </div>
                        <Progress 
                          value={details.situationState.dimensions.qualification.score * 100} 
                          className="h-1"
                        />
                      </div>
                      
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span>Technical</span>
                          <span>{Math.round(details.situationState.dimensions.technical.score * 100)}%</span>
                        </div>
                        <Progress 
                          value={details.situationState.dimensions.technical.score * 100} 
                          className="h-1"
                        />
                      </div>
                      
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span>Trust</span>
                          <span>{Math.round(details.situationState.dimensions.emotional.groups.trust.transparency * 100)}%</span>
                        </div>
                        <Progress 
                          value={details.situationState.dimensions.emotional.groups.trust.transparency * 100} 
                          className="h-1"
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Conversation Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Messages</span>
                    <span>{details.conversation?.messageCount || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant="outline" className="text-xs">
                      {details.conversation?.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Language</span>
                    <span>{details.conversation?.language?.toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Region</span>
                    <span>{details.conversation?.region}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Decision Traces - 1 column */}
            <div>
              <Card className="h-full">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Decision Traces</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[calc(100%-4rem)]">
                    <div className="space-y-2 p-4">
                      {details.decisionTraces?.slice(0, 10).map((trace) => (
                        <div key={trace.id} className="text-xs p-2 bg-muted/50 rounded">
                          <div className="flex justify-between items-start mb-1">
                            <p className="font-medium">{trace.action}</p>
                            <span className="text-muted-foreground">
                              {new Date(trace.timestamp).toLocaleTimeString('es-ES', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          <p className="text-muted-foreground line-clamp-2">
                            {trace.reasoning}
                          </p>
                          <div className="flex justify-between items-center mt-1">
                            <Badge variant="outline" className="text-xs">
                              {Math.round(trace.confidence * 100)}%
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Failed to load conversation details</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ConversationPanel() {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['/api/conversations'],
    refetchInterval: 30000
  });

  // Use WebSocket for real-time updates
  const { lastMessage } = useWebSocket();

  // Transform conversations data for display
  const conversationSummaries: ConversationSummary[] = conversations?.map((conv: any) => ({
    id: conv.id,
    contactName: conv.contactName,
    contactPhone: conv.contactPhone,
    company: conv.company,
    status: conv.status,
    qualificationScore: conv.latestMetrics?.qualificationScore || 0,
    engagementScore: conv.latestMetrics?.engagementScore || 0,
    lastMessage: conv.lastMessage || 'No messages yet',
    lastActivity: conv.lastActivity,
    messageCount: conv.messageCount || 0,
    tags: [
      conv.latestMetrics?.qualificationScore > 0.7 ? 'High Potential' : 
      conv.latestMetrics?.qualificationScore > 0.4 ? 'Moderate' : 'Early Stage',
      conv.latestMetrics?.technicalScore > 0.6 ? 'Tech Savvy' : null,
      conv.latestMetrics?.engagementScore > 0.7 ? 'Highly Engaged' : null
    ].filter(Boolean)
  })) || [];

  const handleConversationClick = (conversationId: string) => {
    setSelectedConversationId(conversationId);
    setIsModalOpen(true);
  };

  const handleQuickAction = (action: string) => {
    console.log('Quick action:', action);
    // Implement quick actions
  };

  const activeCount = conversationSummaries.filter(c => c.status === 'active').length;

  return (
    <>
      <aside className="w-80 bg-card border-l border-border flex flex-col" data-testid="conversation-panel">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold mb-2">Live Conversations</h3>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span data-testid="active-sessions-count">{activeCount} active sessions</span>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading ? (
            // Loading skeleton
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse bg-muted rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-background rounded-full" />
                  <div className="space-y-1">
                    <div className="h-4 bg-background rounded w-24" />
                    <div className="h-3 bg-background rounded w-16" />
                  </div>
                </div>
                <div className="h-2 bg-background rounded mb-2" />
                <div className="h-3 bg-background rounded w-3/4" />
              </div>
            ))
          ) : conversationSummaries.length === 0 ? (
            <div className="text-center py-8">
              <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No active conversations</p>
              <p className="text-sm text-muted-foreground">
                Conversations will appear here when you receive WhatsApp messages
              </p>
            </div>
          ) : (
            conversationSummaries.map((conversation) => (
              <ConversationCard
                key={conversation.id}
                conversation={conversation}
                onClick={() => handleConversationClick(conversation.id)}
              />
            ))
          )}
        </div>
        
        {/* Quick Actions */}
        <div className="p-4 border-t border-border">
          <h4 className="text-sm font-medium mb-3">Quick Actions</h4>
          <div className="space-y-2">
            <Button 
              variant="ghost" 
              className="w-full justify-start text-left px-3 py-2 text-sm bg-primary/10 text-primary hover:bg-primary/20"
              onClick={() => handleQuickAction('suggest_question')}
              data-testid="quick-action-suggest"
            >
              <HelpCircle className="mr-2 h-4 w-4" />
              Suggest Next Question
            </Button>
            <Button 
              variant="ghost"
              className="w-full justify-start text-left px-3 py-2 text-sm hover:bg-accent"
              onClick={() => handleQuickAction('generate_report')}
              data-testid="quick-action-report"
            >
              <ChartBar className="mr-2 h-4 w-4" />
              Generate Report
            </Button>
            <Button 
              variant="ghost"
              className="w-full justify-start text-left px-3 py-2 text-sm hover:bg-accent"
              onClick={() => handleQuickAction('adjust_thresholds')}
              data-testid="quick-action-thresholds"
            >
              <Settings className="mr-2 h-4 w-4" />
              Adjust Thresholds
            </Button>
          </div>
        </div>
      </aside>

      <ConversationDetailsModal
        conversationId={selectedConversationId}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedConversationId(null);
        }}
      />
    </>
  );
}
