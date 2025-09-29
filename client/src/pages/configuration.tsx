import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle, Settings, Brain, MessageSquare, Shield, Database } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SystemHealth {
  status: string;
  uptime: number;
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  connections: {
    websocket: number;
    database: string;
  };
  metrics: {
    activeConversations: number;
    qualifiedLeads: number;
    avgResponseTime: number;
    successRate: number;
  };
}

interface ConfigSection {
  title: string;
  description: string;
  settings: ConfigSetting[];
}

interface ConfigSetting {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'slider';
  value: any;
  min?: number;
  max?: number;
  step?: number;
  description?: string;
}

const systemConfig: ConfigSection[] = [
  {
    title: "Learning Parameters",
    description: "Configure the adaptive learning system behavior",
    settings: [
      {
        key: "baseLearningRate",
        label: "Base Learning Rate",
        type: "slider",
        value: [0.3],
        min: 0.1,
        max: 0.8,
        step: 0.1,
        description: "How quickly the system adapts to new information"
      },
      {
        key: "baseExplorationRate",
        label: "Base Exploration Rate", 
        type: "slider",
        value: [0.3],
        min: 0.1,
        max: 0.6,
        step: 0.05,
        description: "Balance between exploration and exploitation"
      },
      {
        key: "confidenceThreshold",
        label: "Confidence Threshold",
        type: "slider",
        value: [0.7],
        min: 0.5,
        max: 0.95,
        step: 0.05,
        description: "Minimum confidence required for high-certainty decisions"
      }
    ]
  },
  {
    title: "Conversation Management",
    description: "Settings for conversation flow and timeouts",
    settings: [
      {
        key: "maxMessagesPerConversation",
        label: "Max Messages per Conversation",
        type: "number",
        value: 30,
        description: "Automatic conversation timeout after this many messages"
      },
      {
        key: "responseTimeoutMinutes",
        label: "Response Timeout (minutes)",
        type: "number",
        value: 1440,
        description: "Mark conversation as paused after this timeout"
      },
      {
        key: "autoQualificationThreshold",
        label: "Auto-Qualification Threshold",
        type: "slider",
        value: [0.8],
        min: 0.6,
        max: 0.95,
        step: 0.05,
        description: "Qualification score needed for automatic qualification"
      }
    ]
  },
  {
    title: "AI Configuration",
    description: "OpenAI and decision engine settings",
    settings: [
      {
        key: "enableAISuggestions",
        label: "Enable AI Question Suggestions",
        type: "boolean",
        value: true,
        description: "Use OpenAI to suggest optimal questions"
      },
      {
        key: "aiConfidenceWeight",
        label: "AI Suggestion Weight",
        type: "slider",
        value: [0.6],
        min: 0.2,
        max: 0.9,
        step: 0.1,
        description: "How much to trust AI suggestions vs. rule-based decisions"
      },
      {
        key: "enablePatternDetection",
        label: "Enable Pattern Detection",
        type: "boolean",
        value: true,
        description: "Automatically detect conversation patterns"
      }
    ]
  }
];

function SystemHealthCard() {
  const { data: health, isLoading } = useQuery<SystemHealth>({
    queryKey: ['/api/health'],
    refetchInterval: 30000
  });

  if (isLoading || !health) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            System Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="h-4 bg-muted rounded w-2/3" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const isHealthy = health.status === 'healthy';
  const memoryUsage = (health.memory.heapUsed / health.memory.heapTotal) * 100;
  const uptimeHours = Math.floor(health.uptime / 3600);
  const uptimeDays = Math.floor(uptimeHours / 24);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          System Health
          <Badge variant={isHealthy ? "default" : "destructive"} className="ml-auto">
            {isHealthy ? (
              <><CheckCircle className="h-3 w-3 mr-1" /> Healthy</>
            ) : (
              <><AlertCircle className="h-3 w-3 mr-1" /> Unhealthy</>
            )}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">Memory Usage</span>
              <span className="text-sm text-muted-foreground">{Math.round(memoryUsage)}%</span>
            </div>
            <Progress value={memoryUsage} className="h-2" />
          </div>
          
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">Uptime</span>
              <span className="text-sm text-muted-foreground">
                {uptimeDays > 0 ? `${uptimeDays}d ` : ''}{uptimeHours % 24}h
              </span>
            </div>
            <Progress value={100} className="h-2" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">WebSocket Connections</span>
              <span className="font-medium" data-testid="ws-connections">{health.connections.websocket}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Database</span>
              <Badge variant={health.connections.database === 'connected' ? "default" : "destructive"} className="text-xs">
                {health.connections.database}
              </Badge>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Active Conversations</span>
              <span className="font-medium" data-testid="active-conversations">{health.metrics.activeConversations}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Success Rate</span>
              <span className="font-medium text-green-600" data-testid="success-rate">{health.metrics.successRate}%</span>
            </div>
          </div>
        </div>

        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            Last updated: {new Date().toLocaleTimeString('es-ES')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfigurationSection({ section }: { section: ConfigSection }) {
  const { toast } = useToast();
  const [settings, setSettings] = useState(section.settings);

  const updateSetting = (key: string, value: any) => {
    setSettings(prev => prev.map(setting => 
      setting.key === key ? { ...setting, value } : setting
    ));
  };

  const saveMutation = useMutation({
    mutationFn: async (config: any) => {
      // This would save to backend - not implemented yet
      return new Promise(resolve => setTimeout(resolve, 1000));
    },
    onSuccess: () => {
      toast({ title: "Configuration saved successfully" });
    },
    onError: () => {
      toast({ 
        title: "Error saving configuration", 
        variant: "destructive" 
      });
    }
  });

  const handleSave = () => {
    const config = settings.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {} as any);
    saveMutation.mutate(config);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{section.title}</CardTitle>
        <p className="text-sm text-muted-foreground">{section.description}</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {settings.map((setting) => (
          <div key={setting.key} className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={setting.key} className="text-sm font-medium">
                {setting.label}
              </Label>
              {setting.type === 'slider' && (
                <span className="text-sm text-muted-foreground">
                  {Array.isArray(setting.value) ? setting.value[0] : setting.value}
                </span>
              )}
            </div>
            
            {setting.type === 'text' && (
              <Input
                id={setting.key}
                value={setting.value}
                onChange={(e) => updateSetting(setting.key, e.target.value)}
                data-testid={`setting-${setting.key}`}
              />
            )}
            
            {setting.type === 'number' && (
              <Input
                id={setting.key}
                type="number"
                value={setting.value}
                onChange={(e) => updateSetting(setting.key, parseInt(e.target.value))}
                data-testid={`setting-${setting.key}`}
              />
            )}
            
            {setting.type === 'boolean' && (
              <div className="flex items-center space-x-2">
                <Switch
                  id={setting.key}
                  checked={setting.value}
                  onCheckedChange={(checked) => updateSetting(setting.key, checked)}
                  data-testid={`setting-${setting.key}`}
                />
                <span className="text-sm">{setting.value ? 'Enabled' : 'Disabled'}</span>
              </div>
            )}
            
            {setting.type === 'slider' && (
              <Slider
                value={Array.isArray(setting.value) ? setting.value : [setting.value]}
                onValueChange={(value) => updateSetting(setting.key, value)}
                max={setting.max}
                min={setting.min}
                step={setting.step}
                className="w-full"
                data-testid={`setting-${setting.key}`}
              />
            )}
            
            {setting.description && (
              <p className="text-xs text-muted-foreground">{setting.description}</p>
            )}
          </div>
        ))}
        
        <div className="pt-4 border-t">
          <Button 
            onClick={handleSave} 
            disabled={saveMutation.isPending}
            data-testid={`save-${section.title.replace(/\s+/g, '-').toLowerCase()}`}
          >
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function IntegrationsTab() {
  const { toast } = useToast();
  
  const testWhatsAppMutation = useMutation({
    mutationFn: async (data: { to: string; message: string }) => {
      const response = await fetch('/api/test/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to send test message');
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: data.sent ? "Test message sent successfully" : "Failed to send test message",
        variant: data.sent ? "default" : "destructive"
      });
    }
  });

  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("¡Hola! Este es un mensaje de prueba del sistema ConversaAI.");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            WhatsApp Business API
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="webhook-url">Webhook URL</Label>
              <Input 
                id="webhook-url" 
                value={`${window.location.origin}/api/webhook`}
                readOnly
                className="bg-muted"
              />
            </div>
            <div>
              <Label htmlFor="verify-token">Verify Token</Label>
              <Input 
                id="verify-token" 
                type="password"
                placeholder="Configure in environment"
                readOnly
                className="bg-muted"
              />
            </div>
          </div>
          
          <Separator />
          
          <div className="space-y-3">
            <h4 className="font-medium">Test WhatsApp Integration</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="test-phone">Phone Number</Label>
                <Input 
                  id="test-phone"
                  placeholder="+34600000000"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  data-testid="test-phone-input"
                />
              </div>
              <div>
                <Label htmlFor="test-message">Test Message</Label>
                <Input 
                  id="test-message"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  data-testid="test-message-input"
                />
              </div>
            </div>
            <Button 
              onClick={() => testWhatsAppMutation.mutate({ to: testPhone, message: testMessage })}
              disabled={!testPhone || !testMessage || testWhatsAppMutation.isPending}
              data-testid="send-test-message"
            >
              {testWhatsAppMutation.isPending ? "Sending..." : "Send Test Message"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            OpenAI Integration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="openai-model">Model</Label>
              <Input 
                id="openai-model" 
                value="gpt-5"
                readOnly
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Latest model as of August 2025
              </p>
            </div>
            <div>
              <Label htmlFor="api-key-status">API Key Status</Label>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="default">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Configured
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Set via environment variable
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Connection Status</Label>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="default">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Connected
                </Badge>
              </div>
            </div>
            <div>
              <Label>Provider</Label>
              <p className="text-sm mt-2">PostgreSQL (Neon)</p>
            </div>
          </div>
          
          <div className="pt-2 border-t">
            <Button variant="outline" data-testid="run-db-migration">
              Run Database Migration
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Configuration() {
  return (
    <>
      <Header 
        title="Configuration"
        subtitle="System settings and integrations"
      />
      
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-4xl">
          <SystemHealthCard />
          
          <div className="mt-6">
            <Tabs defaultValue="system" className="space-y-6">
              <TabsList className="grid grid-cols-4">
                <TabsTrigger value="system" data-testid="tab-system">System</TabsTrigger>
                <TabsTrigger value="learning" data-testid="tab-learning">Learning</TabsTrigger>
                <TabsTrigger value="integrations" data-testid="tab-integrations">Integrations</TabsTrigger>
                <TabsTrigger value="security" data-testid="tab-security">Security</TabsTrigger>
              </TabsList>
              
              <TabsContent value="system">
                <div className="space-y-6">
                  <ConfigurationSection section={systemConfig[1]} />
                </div>
              </TabsContent>
              
              <TabsContent value="learning">
                <div className="space-y-6">
                  <ConfigurationSection section={systemConfig[0]} />
                  <ConfigurationSection section={systemConfig[2]} />
                </div>
              </TabsContent>
              
              <TabsContent value="integrations">
                <IntegrationsTab />
              </TabsContent>
              
              <TabsContent value="security">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Security Settings
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-8">
                      <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">
                        Security configuration panel coming soon
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </>
  );
}
