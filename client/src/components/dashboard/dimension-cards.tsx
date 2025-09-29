import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Heart, Medal, Cpu, Smile } from "lucide-react";

interface DimensionData {
  engagement: {
    score: number;
    velocity: number;
    depth: number;
    questions: number;
  };
  qualification: {
    score: number;
    budget: number;
    authority: number;
    need: number;
  };
  technical: {
    score: number;
    sophistication: number;
    scope: number;
  };
  emotional: {
    score: number;
    trust: number;
    enthusiasm: number;
    frustration: number;
  };
}

export function DimensionCards() {
  // This would normally fetch from multiple conversations
  // For demo purposes, showing aggregated/sample data
  const { data: conversations } = useQuery({
    queryKey: ['/api/conversations']
  });

  // Calculate average dimensions across all active conversations
  const dimensionData: DimensionData = {
    engagement: {
      score: 0.72,
      velocity: 0.82,
      depth: 0.65,
      questions: 0.23
    },
    qualification: {
      score: 0.61,
      budget: 0.41,
      authority: 0.78,
      need: 0.83
    },
    technical: {
      score: 0.68,
      sophistication: 0.70,
      scope: 0.60
    },
    emotional: {
      score: 0.65,
      trust: 0.70,
      enthusiasm: 0.60,
      frustration: 0.25
    }
  };

  const dimensions = [
    {
      title: "Engagement Metrics",
      icon: Heart,
      iconColor: "text-red-500",
      data: dimensionData.engagement,
      metrics: [
        { name: "Response Velocity", value: dimensionData.engagement.velocity, color: "bg-green-500" },
        { name: "Message Depth", value: dimensionData.engagement.depth, color: "bg-blue-500" },
        { name: "Question Ratio", value: dimensionData.engagement.questions, color: "bg-yellow-500" }
      ],
      testId: "dimension-engagement"
    },
    {
      title: "Qualification Status",
      icon: Medal,
      iconColor: "text-yellow-500", 
      data: dimensionData.qualification,
      metrics: [
        { name: "Budget Signals", value: dimensionData.qualification.budget, color: "bg-orange-500" },
        { name: "Authority Level", value: dimensionData.qualification.authority, color: "bg-green-500" },
        { name: "Need Intensity", value: dimensionData.qualification.need, color: "bg-red-500" }
      ],
      testId: "dimension-qualification"
    },
    {
      title: "Technical Assessment",
      icon: Cpu,
      iconColor: "text-blue-500",
      data: dimensionData.technical,
      metrics: [
        { name: "Sophistication", value: dimensionData.technical.sophistication, color: "bg-purple-500" },
        { name: "Project Scope", value: dimensionData.technical.scope, color: "bg-indigo-500" }
      ],
      testId: "dimension-technical"
    },
    {
      title: "Emotional Intelligence",
      icon: Smile,
      iconColor: "text-green-500",
      data: dimensionData.emotional,
      metrics: [
        { name: "Trust Level", value: dimensionData.emotional.trust, color: "bg-green-500" },
        { name: "Enthusiasm", value: dimensionData.emotional.enthusiasm, color: "bg-blue-500" },
        { name: "Frustration", value: dimensionData.emotional.frustration, color: "bg-red-500", invert: true }
      ],
      testId: "dimension-emotional"
    }
  ];

  return (
    <div className="grid grid-cols-2 gap-6 mb-6" data-testid="dimension-cards">
      {dimensions.map((dimension, index) => (
        <Card key={index} data-testid={dimension.testId}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <dimension.icon className={`h-5 w-5 ${dimension.iconColor}`} />
              {dimension.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {dimension.metrics.map((metric, metricIndex) => (
              <div key={metricIndex} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {metric.name}
                </span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${metric.color} rounded-full transition-all duration-500`}
                      style={{ 
                        width: `${(metric.invert ? (1 - metric.value) : metric.value) * 100}%` 
                      }}
                    />
                  </div>
                  <span 
                    className="text-sm font-medium w-10 text-right"
                    data-testid={`metric-${metric.name.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {(metric.value * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
