import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain } from "lucide-react";

interface AISystemData {
  learning: {
    explorationRate: number;
    confidence: number;
    adaptations: number;
  };
  patterns: {
    quickQualifier: number;
    techExplorer: number;
    relationshipBuilder: number;
  };
  performance: {
    decisionTime: number;
    accuracy: number;
    uptime: number;
  };
}

export function AiStatus() {
  // This would fetch from the AI system status endpoint
  const aiData: AISystemData = {
    learning: {
      explorationRate: 15.2,
      confidence: 87.3,
      adaptations: 342
    },
    patterns: {
      quickQualifier: 34,
      techExplorer: 28, 
      relationshipBuilder: 38
    },
    performance: {
      decisionTime: 42,
      accuracy: 91.2,
      uptime: 99.97
    }
  };

  return (
    <Card className="mb-6" data-testid="ai-status">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          AI Decision Engine
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">Learning State</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Exploration Rate</span>
                <span data-testid="exploration-rate">{aiData.learning.explorationRate}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Confidence</span>
                <span data-testid="ai-confidence">{aiData.learning.confidence}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Adaptations</span>
                <span data-testid="adaptations-count">{aiData.learning.adaptations}</span>
              </div>
            </div>
          </div>
          
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">Pattern Recognition</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Quick Qualifier</span>
                <Badge variant="outline" className="text-green-500 border-green-500/20">
                  {aiData.patterns.quickQualifier}%
                </Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span>Tech Explorer</span>
                <Badge variant="outline" className="text-blue-500 border-blue-500/20">
                  {aiData.patterns.techExplorer}%
                </Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span>Relationship Builder</span>
                <Badge variant="outline" className="text-purple-500 border-purple-500/20">
                  {aiData.patterns.relationshipBuilder}%
                </Badge>
              </div>
            </div>
          </div>
          
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">Performance</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Avg Decision Time</span>
                <span data-testid="decision-time">{aiData.performance.decisionTime}ms</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Accuracy</span>
                <span data-testid="ai-accuracy">{aiData.performance.accuracy}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Uptime</span>
                <span className="text-green-500" data-testid="ai-uptime">{aiData.performance.uptime}%</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
