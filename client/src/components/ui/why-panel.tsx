import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Brain, 
  HelpCircle, 
  Clock, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle,
  MessageSquare,
  Target,
  Lightbulb,
  BarChart3
} from "lucide-react";

interface ReasoningStep {
  step: number;
  description: string;
  evidence: string[];
  confidence: number;
  reasoning: string;
  dataUsed?: Record<string, any>;
  alternatives?: string[];
}

interface ReasoningTrace {
  id: string;
  decisionType: string;
  timestamp: string;
  confidence: number;
  processingTimeMs: number;
  features: Record<string, any>;
  candidates: any[];
  chosen: any;
  reasoningChain: ReasoningStep[];
  businessJustification: string;
  riskFactors: string[];
  alternativesConsidered: any[];
  model: string;
}

interface WhyPanelProps {
  traceId?: string;
  decisionText: string;
  decisionType: 'question_selection' | 'response_generation' | 'qualification_assessment';
  trigger?: React.ReactNode;
  buttonText?: string;
}

export function WhyPanel({ 
  traceId, 
  decisionText, 
  decisionType, 
  trigger,
  buttonText = "Why?" 
}: WhyPanelProps) {
  const [open, setOpen] = useState(false);

  const { data: reasoningTrace, isLoading, error } = useQuery<ReasoningTrace>({
    queryKey: ['/api/reasoning-traces', traceId],
    enabled: open && !!traceId,
    retry: 1
  });

  const getDecisionTypeIcon = (type: string) => {
    switch (type) {
      case 'question_selection':
        return <MessageSquare className="w-4 h-4" />;
      case 'qualification_assessment':
        return <Target className="w-4 h-4" />;
      case 'response_generation':
        return <Brain className="w-4 h-4" />;
      default:
        return <HelpCircle className="w-4 h-4" />;
    }
  };

  const getDecisionTypeLabel = (type: string) => {
    switch (type) {
      case 'question_selection':
        return "Question Selection";
      case 'qualification_assessment':
        return "Lead Qualification";
      case 'response_generation':
        return "Response Generation";
      default:
        return "AI Decision";
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return "text-green-600";
    if (confidence >= 0.6) return "text-yellow-600";
    return "text-red-600";
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return "High Confidence";
    if (confidence >= 0.6) return "Medium Confidence";
    return "Low Confidence";
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 text-xs"
            data-testid={`why-button-${decisionType}`}
          >
            <Brain className="w-3 h-3 mr-1" />
            {buttonText}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getDecisionTypeIcon(decisionType)}
            AI Reasoning: {getDecisionTypeLabel(decisionType)}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 max-h-[70vh]">
          {/* Decision Overview */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Decision Made</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium mb-2" data-testid="decision-text">
                {decisionText}
              </p>
              
              {isLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
                  Loading reasoning analysis...
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <AlertTriangle className="w-4 h-4" />
                  Unable to load reasoning trace
                </div>
              )}

              {!traceId && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <HelpCircle className="w-4 h-4" />
                  No reasoning trace available for this decision
                </div>
              )}
            </CardContent>
          </Card>

          {reasoningTrace && (
            <Tabs defaultValue="reasoning" className="flex-1">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="reasoning" data-testid="tab-reasoning">
                  Reasoning Steps
                </TabsTrigger>
                <TabsTrigger value="alternatives" data-testid="tab-alternatives">
                  Alternatives
                </TabsTrigger>
                <TabsTrigger value="evidence" data-testid="tab-evidence">
                  Evidence
                </TabsTrigger>
                <TabsTrigger value="performance" data-testid="tab-performance">
                  Performance
                </TabsTrigger>
              </TabsList>

              <TabsContent value="reasoning" className="mt-4">
                <ScrollArea className="h-[400px]">
                  <div className="space-y-4">
                    {/* Confidence & Model Info */}
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className={getConfidenceColor(reasoningTrace.confidence)}>
                          {getConfidenceLabel(reasoningTrace.confidence)}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {Math.round(reasoningTrace.confidence * 100)}% confident
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Model: {reasoningTrace.model}
                      </div>
                    </div>

                    {/* Business Justification */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Lightbulb className="w-4 h-4" />
                          Business Justification
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm" data-testid="business-justification">
                          {reasoningTrace.businessJustification}
                        </p>
                      </CardContent>
                    </Card>

                    {/* Reasoning Steps */}
                    <div className="space-y-3">
                      {reasoningTrace.reasoningChain?.map((step, index) => (
                        <Card key={index} className="border-l-4 border-l-primary">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <span className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs">
                                {step.step}
                              </span>
                              {step.description}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            <p className="text-sm text-muted-foreground">
                              {step.reasoning}
                            </p>
                            
                            {step.evidence && step.evidence.length > 0 && (
                              <div>
                                <p className="text-xs font-medium mb-1">Evidence:</p>
                                <ul className="text-xs text-muted-foreground space-y-1">
                                  {step.evidence.map((evidence, i) => (
                                    <li key={i} className="flex items-center gap-1">
                                      <CheckCircle className="w-3 h-3 text-green-500" />
                                      {evidence}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Confidence:</span>
                              <Progress 
                                value={step.confidence * 100} 
                                className="h-2 flex-1"
                              />
                              <span className="text-xs">
                                {Math.round(step.confidence * 100)}%
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="alternatives" className="mt-4">
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium">Alternatives Considered</h4>
                    
                    {reasoningTrace.candidates?.length > 0 ? (
                      reasoningTrace.candidates.map((candidate, index) => (
                        <Card key={index} className="border-l-4 border-l-muted">
                          <CardContent className="pt-4">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium">
                                  Option {index + 1}
                                </p>
                                {candidate.score && (
                                  <Badge variant="outline">
                                    Score: {candidate.score.toFixed(2)}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {candidate.question || candidate.option || JSON.stringify(candidate).substring(0, 100)}
                              </p>
                              {candidate.reasoning && (
                                <p className="text-xs text-muted-foreground">
                                  {candidate.reasoning}
                                </p>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No alternative options were recorded for this decision.
                      </p>
                    )}

                    {reasoningTrace.riskFactors?.length > 0 && (
                      <Card className="border-orange-200">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2 text-orange-700">
                            <AlertTriangle className="w-4 h-4" />
                            Risk Factors
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-1">
                            {reasoningTrace.riskFactors.map((risk, index) => (
                              <li key={index} className="text-sm text-orange-700 flex items-center gap-2">
                                <AlertTriangle className="w-3 h-3" />
                                {risk}
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="evidence" className="mt-4">
                <ScrollArea className="h-[400px]">
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Input Features & Evidence</h4>
                    
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Decision Context</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                          {JSON.stringify(reasoningTrace.features, null, 2)}
                        </pre>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Chosen Solution</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                          {JSON.stringify(reasoningTrace.chosen, null, 2)}
                        </pre>
                      </CardContent>
                    </Card>
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="performance" className="mt-4">
                <ScrollArea className="h-[400px]">
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Performance Metrics</h4>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            Processing Time
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-2xl font-bold">
                            {reasoningTrace.processingTimeMs}ms
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {reasoningTrace.processingTimeMs < 2000 ? "Excellent" : "Needs optimization"}
                          </p>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <BarChart3 className="w-4 h-4" />
                            Decision Quality
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-2xl font-bold">
                            {Math.round(reasoningTrace.confidence * 100)}%
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Confidence level
                          </p>
                        </CardContent>
                      </Card>
                    </div>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Decision Timeline</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm">
                          <strong>Made at:</strong> {new Date(reasoningTrace.timestamp).toLocaleString()}
                        </p>
                        <p className="text-sm">
                          <strong>Trace ID:</strong> {reasoningTrace.id}
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}