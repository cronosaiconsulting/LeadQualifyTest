import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Route } from "lucide-react";

interface DecisionTrace {
  id: string;
  timestamp: string;
  action: string;
  reasoning: string;
  metricsUsed: string[] | Record<string, number>;
  confidence: number;
  utilityScore: number;
}

export function DecisionTraces({ conversationId }: { conversationId?: string } = {}) {
  const { data: traces, isLoading } = useQuery<DecisionTrace[]>({
    queryKey: ['/api/decision-traces', conversationId || 'all'],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', '10');
      if (conversationId) {
        params.set('conversationId', conversationId);
      }
      const response = await fetch(`/api/decision-traces?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch decision traces');
      }
      return response.json();
    },
    refetchInterval: 30000
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Route className="h-5 w-5 text-green-500" />
            Recent Decision Traces
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse border-l-2 border-muted pl-4 py-2">
                <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                <div className="h-3 bg-muted rounded w-full mb-2" />
                <div className="flex gap-2">
                  <div className="h-5 bg-muted rounded w-16" />
                  <div className="h-5 bg-muted rounded w-16" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!traces || traces.length === 0) {
    return (
      <Card data-testid="decision-traces">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Route className="h-5 w-5 text-green-500" />
            Recent Decision Traces
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Route className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No decision traces yet</p>
            <p className="text-sm text-muted-foreground">
              Decision traces will appear as the AI processes conversations
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getActionColor = (action: string) => {
    if (action.includes('budget')) return 'border-orange-500';
    if (action.includes('technical')) return 'border-blue-500';
    if (action.includes('authority')) return 'border-purple-500';
    if (action.includes('need')) return 'border-red-500';
    return 'border-primary';
  };

  const getMetricBadgeColor = (metric: string) => {
    if (metric.includes('engagement')) return 'bg-green-500/10 text-green-500';
    if (metric.includes('budget')) return 'bg-orange-500/10 text-orange-500';
    if (metric.includes('trust')) return 'bg-blue-500/10 text-blue-500';
    if (metric.includes('technical')) return 'bg-purple-500/10 text-purple-500';
    return 'bg-primary/10 text-primary';
  };

  return (
    <Card data-testid="decision-traces">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Route className="h-5 w-5 text-green-500" />
          Recent Decision Traces
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-96">
          <div className="space-y-3">
            {traces.map((trace) => (
              <div 
                key={trace.id}
                className={`border-l-2 pl-4 py-2 ${getActionColor(trace.action)}`}
                data-testid={`decision-trace-${trace.id}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium" data-testid="trace-action">
                      {trace.action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1" data-testid="trace-reasoning">
                      {trace.reasoning.length > 150 
                        ? `${trace.reasoning.substring(0, 150)}...`
                        : trace.reasoning
                      }
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground" data-testid="trace-timestamp">
                      {new Date(trace.timestamp).toLocaleTimeString('es-ES', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                    <div className="mt-1">
                      <Badge variant="outline" className="text-xs">
                        {Math.round(trace.confidence * 100)}%
                      </Badge>
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2 mt-2 flex-wrap">
                  {(() => {
                    // Handle both array and object formats for metricsUsed
                    let metricsArray: string[] = [];
                    
                    if (Array.isArray(trace.metricsUsed)) {
                      metricsArray = trace.metricsUsed;
                    } else if (typeof trace.metricsUsed === 'object' && trace.metricsUsed !== null) {
                      // Convert object like {"technical": 33, "engagement": 58} to array
                      metricsArray = Object.entries(trace.metricsUsed).map(([key, value]) => `${key}:${value}`);
                    }
                    
                    const displayMetrics = metricsArray.slice(0, 3);
                    
                    return (
                      <>
                        {displayMetrics.map((metric, index) => (
                          <Badge 
                            key={index}
                            variant="secondary"
                            className={`text-xs ${getMetricBadgeColor(metric)}`}
                            data-testid={`trace-metric-${index}`}
                          >
                            {metric}
                          </Badge>
                        ))}
                        {metricsArray.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{metricsArray.length - 3} more
                          </Badge>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
