import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { MessageCircle, User, Clock, TrendingUp, Phone, Building } from "lucide-react";

interface Conversation {
  id: string;
  contactName: string;
  contactPhone: string;
  company?: string;
  status: string;
  qualificationScore: number;
  messageCount: number;
  lastActivity: string;
  latestMetrics?: any;
  lastMessage?: string;
  lastMessageTime?: string;
}

interface Message {
  id: string;
  content: string;
  direction: 'incoming' | 'outgoing';
  timestamp: string;
  messageType: string;
}

function ConversationCard({ conversation }: { conversation: Conversation }) {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  
  const { data: conversationDetails } = useQuery({
    queryKey: ['/api/conversations', conversation.id],
    enabled: selectedConversation === conversation.id
  });

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
    if (score >= 0.7) return 'text-green-500';
    if (score >= 0.4) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Card 
          className="cursor-pointer hover:bg-accent transition-colors"
          onClick={() => setSelectedConversation(conversation.id)}
          data-testid={`conversation-card-${conversation.id}`}
        >
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium" data-testid="contact-name">{conversation.contactName}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="w-3 h-3" />
                    <span data-testid="contact-phone">{conversation.contactPhone}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className={`w-3 h-3 rounded-full ${getStatusColor(conversation.status)}`} />
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(conversation.lastActivity).toLocaleTimeString('es-ES', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
            </div>

            {conversation.company && (
              <div className="flex items-center gap-2 mb-2">
                <Building className="w-3 h-3 text-muted-foreground" />
                <span className="text-sm text-muted-foreground" data-testid="company">{conversation.company}</span>
              </div>
            )}

            <div className="space-y-2 mb-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Qualification</span>
                <span className={`font-medium ${getQualificationColor(conversation.qualificationScore)}`}>
                  {Math.round(conversation.qualificationScore * 100)}%
                </span>
              </div>
              <Progress value={conversation.qualificationScore * 100} className="h-1" />
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <MessageCircle className="w-3 h-3 text-muted-foreground" />
                  <span data-testid="message-count">{conversation.messageCount}</span>
                </div>
                <Badge variant="outline" className="text-xs">
                  {conversation.status}
                </Badge>
              </div>
            </div>

            {conversation.lastMessage && (
              <p className="text-xs text-muted-foreground mt-2 line-clamp-2" data-testid="last-message">
                {conversation.lastMessage}
              </p>
            )}
          </CardContent>
        </Card>
      </DialogTrigger>

      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Conversation Analysis - {conversation.contactName}</DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-3 gap-4 h-[70vh]">
          {/* Messages */}
          <div className="col-span-2">
            <ScrollArea className="h-full border rounded-md p-4">
              <div className="space-y-4">
                {conversationDetails?.messages?.map((message: Message) => (
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
                      <p className="text-sm">{message.content}</p>
                      <p className="text-xs opacity-70 mt-1">
                        {new Date(message.timestamp).toLocaleTimeString('es-ES')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Metrics & Analysis */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {conversationDetails?.situationState && (
                  <>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Engagement</span>
                        <span>{Math.round(conversationDetails.situationState.dimensions.engagement.score * 100)}%</span>
                      </div>
                      <Progress 
                        value={conversationDetails.situationState.dimensions.engagement.score * 100} 
                        className="h-1"
                      />
                    </div>
                    
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Technical</span>
                        <span>{Math.round(conversationDetails.situationState.dimensions.technical.score * 100)}%</span>
                      </div>
                      <Progress 
                        value={conversationDetails.situationState.dimensions.technical.score * 100} 
                        className="h-1"
                      />
                    </div>
                    
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Trust</span>
                        <span>{Math.round(conversationDetails.situationState.dimensions.emotional.groups.trust.transparency * 100)}%</span>
                      </div>
                      <Progress 
                        value={conversationDetails.situationState.dimensions.emotional.groups.trust.transparency * 100} 
                        className="h-1"
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Decision Traces</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-32">
                  <div className="space-y-2">
                    {conversationDetails?.decisionTraces?.slice(0, 5).map((trace: any) => (
                      <div key={trace.id} className="text-xs p-2 bg-muted rounded">
                        <p className="font-medium">{trace.action}</p>
                        <p className="text-muted-foreground">{trace.reasoning.substring(0, 80)}...</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Conversations() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: conversations, isLoading } = useQuery<Conversation[]>({
    queryKey: ['/api/conversations']
  });

  const filteredConversations = conversations?.filter(conv => {
    const matchesSearch = conv.contactName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         conv.contactPhone.includes(searchTerm) ||
                         conv.company?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || conv.status === statusFilter;
    return matchesSearch && matchesStatus;
  }) || [];

  const activeCount = conversations?.filter(c => c.status === 'active').length || 0;
  const qualifiedCount = conversations?.filter(c => c.qualificationScore > 0.7).length || 0;
  const avgScore = conversations?.length ? 
    Math.round(conversations.reduce((sum, c) => sum + c.qualificationScore, 0) / conversations.length * 100) : 0;

  return (
    <>
      <Header 
        title="Conversations"
        subtitle="Manage and analyze B2B lead conversations"
      />
      
      <div className="flex-1 p-6 overflow-y-auto">
        {/* Stats Overview */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold" data-testid="total-conversations">
                    {conversations?.length || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Total Conversations</p>
                </div>
                <MessageCircle className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-green-600" data-testid="active-conversations">
                    {activeCount}
                  </p>
                  <p className="text-sm text-muted-foreground">Active</p>
                </div>
                <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-blue-600" data-testid="qualified-conversations">
                    {qualifiedCount}
                  </p>
                  <p className="text-sm text-muted-foreground">Qualified</p>
                </div>
                <TrendingUp className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold" data-testid="avg-qualification">
                    {avgScore}%
                  </p>
                  <p className="text-sm text-muted-foreground">Avg Qualification</p>
                </div>
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-primary font-medium text-sm">{avgScore}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1">
            <Input
              placeholder="Search conversations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="search-input"
            />
          </div>
          
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList>
              <TabsTrigger value="all" data-testid="filter-all">All</TabsTrigger>
              <TabsTrigger value="active" data-testid="filter-active">Active</TabsTrigger>
              <TabsTrigger value="qualified" data-testid="filter-qualified">Qualified</TabsTrigger>
              <TabsTrigger value="paused" data-testid="filter-paused">Paused</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Conversations Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="pt-6">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-3 bg-muted rounded w-1/2 mb-4" />
                  <div className="h-2 bg-muted rounded mb-2" />
                  <div className="h-8 bg-muted rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredConversations.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium">No conversations found</p>
              <p className="text-muted-foreground">
                {searchTerm || statusFilter !== "all" 
                  ? "Try adjusting your search or filters"
                  : "Conversations will appear here when you receive WhatsApp messages"
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredConversations.map((conversation) => (
              <ConversationCard key={conversation.id} conversation={conversation} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
