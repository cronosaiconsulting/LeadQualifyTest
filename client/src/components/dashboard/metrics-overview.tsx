import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle, Star, Clock, Trophy, ArrowUpRight, ArrowDownRight } from "lucide-react";

interface SystemMetrics {
  activeConversations: number;
  qualifiedLeads: number;
  avgResponseTime: number;
  successRate: number;
}

function calculateChange(current: number, previous: number): { change: string; color: string } {
  if (previous === 0) return { change: "+0%", color: "text-muted-foreground" };
  
  const percentChange = ((current - previous) / previous) * 100;
  const isPositive = percentChange >= 0;
  
  return {
    change: `${isPositive ? '+' : ''}${Math.round(percentChange)}%`,
    color: isPositive ? "text-green-500" : "text-red-500"
  };
}

export function MetricsOverview() {
  const { data: metrics, isLoading } = useQuery<SystemMetrics>({
    queryKey: ['/api/system/metrics'],
    refetchInterval: 30000
  });

  // Query historical metrics for percentage calculations
  const { data: historicalMetrics } = useQuery<{ current: SystemMetrics; previous: SystemMetrics }>({
    queryKey: ['/api/system/metrics/comparison'],
    enabled: !!metrics,
    refetchInterval: 60000
  });

  // Calculate dynamic percentage changes
  const activeChange = historicalMetrics ? 
    calculateChange(historicalMetrics.current.activeConversations, historicalMetrics.previous.activeConversations) :
    { change: "+0%", color: "text-muted-foreground" };
    
  const qualifiedChange = historicalMetrics ?
    calculateChange(historicalMetrics.current.qualifiedLeads, historicalMetrics.previous.qualifiedLeads) :
    { change: "+0%", color: "text-muted-foreground" };
    
  const responseTimeChange = historicalMetrics ?
    calculateChange(historicalMetrics.previous.avgResponseTime, historicalMetrics.current.avgResponseTime) : // Inverted for response time (lower is better)
    { change: "+0%", color: "text-muted-foreground" };
    
  const successRateChange = historicalMetrics ?
    calculateChange(historicalMetrics.current.successRate, historicalMetrics.previous.successRate) :
    { change: "+0%", color: "text-muted-foreground" };

  const metricCards = [
    {
      title: "Active Conversations",
      value: metrics?.activeConversations || 0,
      icon: MessageCircle,
      iconColor: "text-primary",
      change: activeChange.change,
      changeColor: activeChange.color,
      testId: "metric-active-conversations"
    },
    {
      title: "Qualified Leads", 
      value: metrics?.qualifiedLeads || 0,
      icon: Star,
      iconColor: "text-yellow-500",
      change: qualifiedChange.change,
      changeColor: qualifiedChange.color,
      testId: "metric-qualified-leads"
    },
    {
      title: "Avg Response Time",
      value: `${metrics?.avgResponseTime || 0}s`,
      icon: Clock,
      iconColor: "text-blue-500", 
      change: responseTimeChange.change,
      changeColor: responseTimeChange.color,
      testId: "metric-response-time"
    },
    {
      title: "Success Rate",
      value: `${metrics?.successRate || 0}%`,
      icon: Trophy,
      iconColor: "text-primary",
      change: successRateChange.change,
      changeColor: successRateChange.color,
      testId: "metric-success-rate"
    }
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="pt-4">
              <div className="h-4 bg-muted rounded w-3/4 mb-2" />
              <div className="h-6 bg-muted rounded w-1/2 mb-2" />
              <div className="h-3 bg-muted rounded w-1/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-4 mb-6" data-testid="metrics-overview">
      {metricCards.map((metric, index) => (
        <Card key={index}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                {metric.title}
              </h3>
              <metric.icon className={`h-5 w-5 ${metric.iconColor}`} />
            </div>
            <div className="flex items-end gap-2">
              <span 
                className="text-2xl font-bold" 
                data-testid={metric.testId}
              >
                {metric.value}
              </span>
              <span className={`text-sm flex items-center ${metric.changeColor}`} data-testid={`change-${metric.testId}`}>
                {metric.changeColor.includes('green') ? 
                  <ArrowUpRight className="w-3 h-3 mr-1" /> : 
                  <ArrowDownRight className="w-3 h-3 mr-1" />
                }
                {metric.change}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
