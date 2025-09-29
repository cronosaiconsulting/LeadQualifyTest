// ReasoningService - Generates explicit step-by-step reasoning for AI decisions
// Core component of trace-first architecture for human-reviewable AI reasoning
// Enhanced with Knowledge Graph context for continuous learning and better decisions
import { xaiService } from "./xai";
import { knowledgeGraphService } from "./knowledge-graph";
import { storage } from "../storage";
import type { 
  SituationAwarenessState, 
  QuestionBank, 
  InsertReasoningTrace,
  ReasoningTrace
} from "@shared/schema";
import { nanoid } from "nanoid";

export interface ReasoningStep {
  step: number;
  description: string;
  evidence: string[];
  confidence: number;
  reasoning: string;
  dataUsed: Record<string, any>;
  alternatives: string[];
}

export interface DecisionCandidate {
  option: any;
  score: number;
  pros: string[];
  cons: string[];
  reasoning: string;
  confidence: number;
}

export interface ReasoningContext {
  conversationId: string;
  turnId: string;
  decisionType: 'question_selection' | 'response_generation' | 'qualification_assessment';
  inputFeatures: Record<string, any>;
  candidates: any[];
  culturalContext?: any;
  businessGoals?: string[];
}

export interface ReasoningResult {
  chosenOption: any;
  reasoning: {
    steps: ReasoningStep[];
    finalJustification: string;
    confidence: number;
    riskFactors: string[];
    alternativesConsidered: DecisionCandidate[];
  };
  trace: ReasoningTrace;
  processingTimeMs: number;
}

export class ReasoningService {
  
  /**
   * Generates comprehensive reasoning for question selection decisions
   * Enhanced with Knowledge Graph context for historical insights
   */
  async generateQuestionSelectionReasoning(
    context: ReasoningContext,
    situationState: SituationAwarenessState,
    availableQuestions: QuestionBank[]
  ): Promise<ReasoningResult> {
    const startTime = Date.now();
    const traceId = nanoid();
    
    try {
      // Extract entities from current conversation context
      const messageHistory = context.inputFeatures.messageHistory || [];
      const entityExtractionResult = await knowledgeGraphService.extractKnowledgeFromConversation(
        context.conversationId,
        messageHistory
      );

      // Get knowledge graph context for decision-making
      const extractedEntities = entityExtractionResult.entities.map(e => e.entityId);
      const graphContext = await knowledgeGraphService.getGraphContextForReasoning(
        context.conversationId,
        extractedEntities,
        context.decisionType
      );

      // Prepare enhanced decision context for xAI including graph insights
      const decisionPrompt = this.buildKnowledgeEnhancedPrompt(
        context,
        situationState,
        availableQuestions,
        graphContext,
        entityExtractionResult
      );
      
      // Get sophisticated reasoning from xAI with graph context
      const xaiAnalysis = await xaiService.suggestNextQuestion(
        situationState,
        messageHistory,
        availableQuestions
      );
      
      // Process reasoning into structured format with graph insights
      const structuredReasoning = this.processGraphEnhancedReasoning(
        xaiAnalysis.reasoning,
        availableQuestions,
        graphContext,
        'question_selection'
      );
      
      // Select optimal question based on reasoning and graph insights
      const chosenQuestion = this.selectOptimalQuestionWithGraphContext(
        availableQuestions,
        structuredReasoning,
        xaiAnalysis,
        graphContext
      );
      
      const processingTimeMs = Date.now() - startTime;
      
      // Create reasoning trace for database storage
      const reasoningTrace: InsertReasoningTrace = {
        turnId: context.turnId,
        conversationId: context.conversationId,
        decisionType: context.decisionType,
        features: {
          ...context.inputFeatures,
          extractedEntities: extractedEntities,
          graphContext: graphContext,
          graphConfidence: graphContext.graphConfidence
        },
        candidates: structuredReasoning.alternativesConsidered.map(c => ({
          question: c.option,
          score: c.score,
          reasoning: c.reasoning,
          graphInsights: c.graphInsights || []
        })),
        chosen: {
          question: chosenQuestion,
          reasoning: structuredReasoning.finalJustification,
          confidence: structuredReasoning.confidence,
          graphRecommendation: graphContext.entityRecommendations.length > 0
        },
        reasoningChain: structuredReasoning.steps,
        confidence: structuredReasoning.confidence,
        policyVersion: "2.0.0", // Updated for knowledge graph integration
        traceId,
        processingTimeMs,
        businessJustification: this.generateKnowledgeEnhancedBusinessJustification(
          chosenQuestion,
          structuredReasoning,
          graphContext,
          'question_selection'
        ),
        riskFactors: structuredReasoning.riskFactors,
        alternativesConsidered: structuredReasoning.alternativesConsidered.map(c => c.option),
        apiLatencyMs: processingTimeMs,
        tokensUsed: this.estimateTokenUsage(decisionPrompt),
        model: "grok-2-1212"
      };
      
      // Save reasoning trace to database
      const savedTrace = await storage.saveReasoningTrace(reasoningTrace);
      
      return {
        chosenOption: chosenQuestion,
        reasoning: structuredReasoning,
        trace: savedTrace,
        processingTimeMs
      };
    } catch (error) {
      console.error('Error generating question selection reasoning:', error);
      return this.createFallbackQuestionReasoning(context, availableQuestions, startTime);
    }
  }

  /**
   * Generates reasoning for qualification assessment decisions
   */
  async generateQualificationReasoning(
    context: ReasoningContext,
    metrics: any,
    conversationHistory: string[]
  ): Promise<ReasoningResult> {
    const startTime = Date.now();
    const traceId = nanoid();
    
    try {
      // Analyze latest message with cultural context
      const latestMessage = conversationHistory[conversationHistory.length - 1];
      const messageAnalysis = await xaiService.analyzeMessage(latestMessage);
      
      // Get LATAM cultural analysis
      const culturalAnalysis = await xaiService.analyzeLATAMCulturalContext(
        latestMessage,
        conversationHistory.slice(-5)
      );
      
      // Generate comprehensive qualification reasoning
      const qualificationReasoning = await this.analyzeQualificationEvidence(
        messageAnalysis,
        culturalAnalysis,
        metrics,
        conversationHistory
      );
      
      const processingTimeMs = Date.now() - startTime;
      
      // Create reasoning trace
      const reasoningTrace: InsertReasoningTrace = {
        turnId: context.turnId,
        conversationId: context.conversationId,
        decisionType: context.decisionType,
        features: {
          metrics,
          messageAnalysis: messageAnalysis,
          culturalContext: culturalAnalysis,
          conversationLength: conversationHistory.length
        },
        candidates: qualificationReasoning.dimensionAnalyses,
        chosen: {
          qualificationScore: qualificationReasoning.overallScore,
          evidence: qualificationReasoning.evidence,
          reasoning: qualificationReasoning.reasoning
        },
        reasoningChain: qualificationReasoning.steps,
        confidence: qualificationReasoning.confidence,
        policyVersion: "1.0.0",
        traceId,
        processingTimeMs,
        businessJustification: this.generateBusinessJustification(
          qualificationReasoning,
          qualificationReasoning,
          'qualification_assessment'
        ),
        riskFactors: qualificationReasoning.riskFactors,
        alternativesConsidered: qualificationReasoning.alternativeInterpretations,
        apiLatencyMs: processingTimeMs,
        tokensUsed: this.estimateTokenUsage(latestMessage),
        model: "grok-2-1212"
      };
      
      const savedTrace = await storage.saveReasoningTrace(reasoningTrace);
      
      return {
        chosenOption: qualificationReasoning,
        reasoning: {
          steps: qualificationReasoning.steps,
          finalJustification: qualificationReasoning.reasoning,
          confidence: qualificationReasoning.confidence,
          riskFactors: qualificationReasoning.riskFactors,
          alternativesConsidered: qualificationReasoning.dimensionAnalyses
        },
        trace: savedTrace,
        processingTimeMs
      };
    } catch (error) {
      console.error('Error generating qualification reasoning:', error);
      return this.createFallbackQualificationReasoning(context, metrics, startTime);
    }
  }

  /**
   * Generates reasoning for response generation decisions
   */
  async generateResponseReasoning(
    context: ReasoningContext,
    selectedQuestion: QuestionBank,
    culturalContext: any
  ): Promise<ReasoningResult> {
    const startTime = Date.now();
    const traceId = nanoid();
    
    try {
      // Analyze cultural appropriateness and timing
      const responseAnalysis = await this.analyzeResponseStrategy(
        selectedQuestion,
        culturalContext,
        context.inputFeatures
      );
      
      const processingTimeMs = Date.now() - startTime;
      
      // Create reasoning trace
      const reasoningTrace: InsertReasoningTrace = {
        turnId: context.turnId,
        conversationId: context.conversationId,
        decisionType: context.decisionType,
        features: {
          selectedQuestion,
          culturalContext,
          conversationState: context.inputFeatures
        },
        candidates: responseAnalysis.alternativeResponses,
        chosen: {
          response: selectedQuestion.questionText,
          strategy: responseAnalysis.strategy,
          culturalAdaptations: responseAnalysis.culturalAdaptations
        },
        reasoningChain: responseAnalysis.steps,
        confidence: responseAnalysis.confidence,
        policyVersion: "1.0.0",
        traceId,
        processingTimeMs,
        businessJustification: this.generateBusinessJustification(
          selectedQuestion,
          responseAnalysis,
          'response_generation'
        ),
        riskFactors: responseAnalysis.riskFactors,
        alternativesConsidered: responseAnalysis.alternativeResponses,
        apiLatencyMs: processingTimeMs,
        tokensUsed: this.estimateTokenUsage(selectedQuestion.questionText),
        model: "grok-2-1212"
      };
      
      const savedTrace = await storage.saveReasoningTrace(reasoningTrace);
      
      return {
        chosenOption: selectedQuestion,
        reasoning: {
          steps: responseAnalysis.steps,
          finalJustification: responseAnalysis.reasoning,
          confidence: responseAnalysis.confidence,
          riskFactors: responseAnalysis.riskFactors,
          alternativesConsidered: responseAnalysis.alternativeResponses
        },
        trace: savedTrace,
        processingTimeMs
      };
    } catch (error) {
      console.error('Error generating response reasoning:', error);
      return this.createFallbackResponseReasoning(context, selectedQuestion, startTime);
    }
  }

  /**
   * Retrieves reasoning trace for a specific decision for "Why" panel display
   */
  async getReasoningTrace(traceId: string): Promise<ReasoningTrace | null> {
    try {
      return await storage.getReasoningTrace(traceId);
    } catch (error) {
      console.error('Error retrieving reasoning trace:', error);
      return null;
    }
  }

  /**
   * Gets reasoning traces for a conversation for debugging and review
   */
  async getConversationReasoningTraces(
    conversationId: string, 
    decisionType?: string,
    limit: number = 20
  ): Promise<ReasoningTrace[]> {
    try {
      return await storage.getReasoningTraces(conversationId, decisionType, limit);
    } catch (error) {
      console.error('Error retrieving conversation reasoning traces:', error);
      return [];
    }
  }

  /**
   * Validates reasoning quality and flags potential issues
   */
  async validateReasoningQuality(trace: ReasoningTrace): Promise<{
    isValid: boolean;
    issues: string[];
    qualityScore: number;
    recommendations: string[];
  }> {
    const issues: string[] = [];
    let qualityScore = 1.0;
    
    // Check confidence levels
    if (trace.confidence < 0.3) {
      issues.push("Low confidence level in reasoning");
      qualityScore -= 0.2;
    }
    
    // Check reasoning chain completeness
    const reasoningSteps = Array.isArray(trace.reasoningChain) ? trace.reasoningChain : [];
    if (reasoningSteps.length < 2) {
      issues.push("Insufficient reasoning steps");
      qualityScore -= 0.3;
    }
    
    // Check processing time (should be under 2s for good UX)
    if (trace.processingTimeMs > 2000) {
      issues.push("Slow reasoning generation (>2s)");
      qualityScore -= 0.1;
    }
    
    // Check for risk factors
    const riskFactors = Array.isArray(trace.riskFactors) ? trace.riskFactors : [];
    if (riskFactors.length > 3) {
      issues.push("High number of identified risk factors");
      qualityScore -= 0.1;
    }
    
    const recommendations: string[] = [];
    if (qualityScore < 0.7) {
      recommendations.push("Review reasoning parameters");
      recommendations.push("Consider additional context");
    }
    
    return {
      isValid: issues.length === 0,
      issues,
      qualityScore: Math.max(0, qualityScore),
      recommendations
    };
  }

  // Private helper methods
  
  private buildQuestionSelectionPrompt(
    context: ReasoningContext,
    situationState: SituationAwarenessState,
    availableQuestions: QuestionBank[]
  ): string {
    return `Sophisticated question selection for Spanish LATAM B2B lead qualification:

Context:
${JSON.stringify(context.inputFeatures, null, 2)}

Current Situation:
${JSON.stringify(situationState, null, 2)}

Available Questions:
${availableQuestions.slice(0, 10).map(q => `${q.category}: ${q.questionText}`).join('\n')}

Provide detailed reasoning for optimal question selection with LATAM cultural considerations.`;
  }

  private processXAIReasoning(xaiReasoning: any, options: any[], decisionType: string): any {
    // Process and structure the reasoning from xAI into our format
    const steps: ReasoningStep[] = (xaiReasoning.reasoningSteps || []).map((step: any, index: number) => ({
      step: index + 1,
      description: step.description || `Step ${index + 1}`,
      evidence: Array.isArray(step.evidence) ? step.evidence : [],
      confidence: step.confidence || 0.5,
      reasoning: step.reasoning || "No reasoning provided",
      dataUsed: step.inputFeatures || {},
      alternatives: step.alternatives || []
    }));

    return {
      steps,
      finalJustification: xaiReasoning.businessJustification || "Decision based on available analysis",
      confidence: xaiReasoning.finalConfidence || 0.5,
      riskFactors: Array.isArray(xaiReasoning.riskFactors) ? xaiReasoning.riskFactors : [],
      alternativesConsidered: (xaiReasoning.candidatesConsidered || []).map((candidate: any, index: number) => ({
        option: candidate,
        score: 0.5,
        pros: [],
        cons: [],
        reasoning: `Alternative option ${index + 1}`,
        confidence: 0.5
      }))
    };
  }

  private selectOptimalQuestion(
    availableQuestions: QuestionBank[],
    reasoning: any,
    xaiAnalysis: any
  ): QuestionBank {
    // Use xAI suggestion if available and valid
    if (xaiAnalysis.question) {
      const matchingQuestion = availableQuestions.find(q => 
        q.questionText.includes(xaiAnalysis.question.substring(0, 20))
      );
      if (matchingQuestion) {
        return matchingQuestion;
      }
    }
    
    // Fallback to first available question
    return availableQuestions[0] || {
      id: 'fallback',
      category: 'general',
      subcategory: null,
      questionText: '¿Podrías contarme más sobre tus necesidades específicas?',
      expectedResponses: [],
      metrics: {},
      language: 'es',
      region: 'ES',
      industryVertical: null,
      isActive: true,
      successRate: 0.5,
      usageCount: 0,
      lastUsed: null,
      createdAt: new Date()
    };
  }

  private async analyzeQualificationEvidence(
    messageAnalysis: any,
    culturalAnalysis: any,
    metrics: any,
    conversationHistory: string[]
  ): Promise<any> {
    // Analyze qualification evidence and provide structured reasoning
    return {
      overallScore: (messageAnalysis.sentiment + 1) / 2, // Convert -1,1 to 0,1
      evidence: [
        `Sentiment: ${messageAnalysis.sentiment}`,
        `Technical level: ${messageAnalysis.technicalLevel}`,
        `Cultural formality: ${culturalAnalysis.formalityLevel}`
      ],
      reasoning: "Based on message analysis and cultural context",
      steps: [
        {
          step: 1,
          description: "Message Analysis",
          evidence: [`Sentiment: ${messageAnalysis.sentiment}`],
          confidence: 0.8,
          reasoning: "Analyzed latest message content and tone",
          dataUsed: { messageAnalysis },
          alternatives: []
        }
      ],
      confidence: 0.7,
      riskFactors: messageAnalysis.objectionTone > 0.5 ? ["High objection tone detected"] : [],
      alternativeInterpretations: ["Could be misinterpreting cultural context"],
      dimensionAnalyses: [
        {
          dimension: "engagement",
          score: messageAnalysis.sentiment,
          reasoning: "Based on sentiment analysis"
        }
      ]
    };
  }

  private async analyzeResponseStrategy(
    selectedQuestion: QuestionBank,
    culturalContext: any,
    inputFeatures: any
  ): Promise<any> {
    return {
      strategy: "direct_inquiry",
      culturalAdaptations: ["formal_language", "relationship_building"],
      steps: [
        {
          step: 1,
          description: "Cultural Appropriateness Check",
          evidence: [`Formality level: ${culturalContext.formalityLevel}`],
          confidence: 0.8,
          reasoning: "Question matches cultural context",
          dataUsed: { culturalContext },
          alternatives: []
        }
      ],
      confidence: 0.8,
      reasoning: "Question is culturally appropriate and timely",
      riskFactors: [],
      alternativeResponses: []
    };
  }

  private generateBusinessJustification(
    chosenOption: any,
    reasoning: any,
    decisionType: string
  ): string {
    switch (decisionType) {
      case 'question_selection':
        return `Selected question to optimize lead qualification progress and maintain engagement`;
      case 'qualification_assessment':
        return `Assessment aligns with LATAM business patterns and supports accurate lead scoring`;
      case 'response_generation':
        return `Response strategy maintains cultural appropriateness while advancing qualification goals`;
      default:
        return `Decision supports overall business objectives`;
    }
  }

  private estimateTokenUsage(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  private createFallbackQuestionReasoning(
    context: ReasoningContext,
    availableQuestions: QuestionBank[],
    startTime: number
  ): ReasoningResult {
    const processingTimeMs = Date.now() - startTime;
    const fallbackQuestion = availableQuestions[0] || {
      id: 'fallback',
      category: 'general',
      subcategory: null,
      questionText: '¿Podrías contarme más sobre tus necesidades específicas?',
      expectedResponses: [],
      metrics: {},
      language: 'es',
      region: 'ES',
      industryVertical: null,
      isActive: true,
      successRate: 0.5,
      usageCount: 0,
      lastUsed: null,
      createdAt: new Date()
    };

    return {
      chosenOption: fallbackQuestion,
      reasoning: {
        steps: [{
          step: 1,
          description: "Fallback Selection",
          evidence: ["reasoning_failed"],
          confidence: 0.1,
          reasoning: "Using fallback due to reasoning failure",
          dataUsed: {},
          alternatives: []
        }],
        finalJustification: "Fallback question selected due to analysis failure",
        confidence: 0.1,
        riskFactors: ["analysis_failure"],
        alternativesConsidered: []
      },
      trace: {
        id: nanoid(),
        turnId: context.turnId,
        conversationId: context.conversationId,
        decisionType: context.decisionType,
        timestamp: new Date(),
        features: context.inputFeatures,
        candidates: [],
        chosen: fallbackQuestion,
        reasoningChain: [],
        confidence: 0.1,
        policyVersion: "1.0.0",
        traceId: nanoid(),
        processingTimeMs,
        businessJustification: "Fallback reasoning",
        riskFactors: ["analysis_failure"],
        alternativesConsidered: [],
        humanReviewed: false,
        humanRating: null,
        humanFeedback: null,
        apiLatencyMs: processingTimeMs,
        tokensUsed: 0,
        model: "fallback"
      },
      processingTimeMs
    };
  }

  private createFallbackQualificationReasoning(
    context: ReasoningContext,
    metrics: any,
    startTime: number
  ): ReasoningResult {
    const processingTimeMs = Date.now() - startTime;
    
    return {
      chosenOption: { qualificationScore: 0.5 },
      reasoning: {
        steps: [{
          step: 1,
          description: "Fallback Assessment",
          evidence: ["reasoning_failed"],
          confidence: 0.1,
          reasoning: "Using fallback assessment due to analysis failure",
          dataUsed: {},
          alternatives: []
        }],
        finalJustification: "Fallback qualification assessment",
        confidence: 0.1,
        riskFactors: ["analysis_failure"],
        alternativesConsidered: []
      },
      trace: {
        id: nanoid(),
        turnId: context.turnId,
        conversationId: context.conversationId,
        decisionType: context.decisionType,
        timestamp: new Date(),
        features: context.inputFeatures,
        candidates: [],
        chosen: { qualificationScore: 0.5 },
        reasoningChain: [],
        confidence: 0.1,
        policyVersion: "1.0.0",
        traceId: nanoid(),
        processingTimeMs,
        businessJustification: "Fallback reasoning",
        riskFactors: ["analysis_failure"],
        alternativesConsidered: [],
        humanReviewed: false,
        humanRating: null,
        humanFeedback: null,
        apiLatencyMs: processingTimeMs,
        tokensUsed: 0,
        model: "fallback"
      },
      processingTimeMs
    };
  }

  private createFallbackResponseReasoning(
    context: ReasoningContext,
    selectedQuestion: QuestionBank,
    startTime: number
  ): ReasoningResult {
    const processingTimeMs = Date.now() - startTime;
    
    return {
      chosenOption: selectedQuestion,
      reasoning: {
        steps: [{
          step: 1,
          description: "Fallback Response",
          evidence: ["reasoning_failed"],
          confidence: 0.1,
          reasoning: "Using fallback response strategy due to analysis failure",
          dataUsed: {},
          alternatives: []
        }],
        finalJustification: "Fallback response generation",
        confidence: 0.1,
        riskFactors: ["analysis_failure"],
        alternativesConsidered: []
      },
      trace: {
        id: nanoid(),
        turnId: context.turnId,
        conversationId: context.conversationId,
        decisionType: context.decisionType,
        timestamp: new Date(),
        features: context.inputFeatures,
        candidates: [],
        chosen: selectedQuestion,
        reasoningChain: [],
        confidence: 0.1,
        policyVersion: "1.0.0",
        traceId: nanoid(),
        processingTimeMs,
        businessJustification: "Fallback reasoning",
        riskFactors: ["analysis_failure"],
        alternativesConsidered: [],
        humanReviewed: false,
        humanRating: null,
        humanFeedback: null,
        apiLatencyMs: processingTimeMs,
        tokensUsed: 0,
        model: "fallback"
      },
      processingTimeMs
    };
  }

  // Knowledge Graph Enhanced Methods

  /**
   * Build enhanced prompt including knowledge graph context
   */
  private buildKnowledgeEnhancedPrompt(
    context: ReasoningContext,
    situationState: SituationAwarenessState,
    availableQuestions: QuestionBank[],
    graphContext: any,
    entityExtractionResult: any
  ): string {
    return `Enhanced question selection with knowledge graph insights:

CURRENT CONVERSATION CONTEXT:
- Conversation ID: ${context.conversationId}
- Current Stage: ${situationState.messageCount} messages
- Qualification Score: ${situationState.dimensions.qualification.score}
- Engagement Level: ${situationState.dimensions.engagement.score}

EXTRACTED ENTITIES:
${entityExtractionResult.entities.map((e: any) => `- ${e.entityType}: ${e.entityName} (confidence: ${e.confidence})`).join('\n')}

KNOWLEDGE GRAPH INSIGHTS:
- Similar Successful Conversations: ${graphContext.similarSuccessfulConversations.length}
- Relevant Success Patterns: ${graphContext.relevantPatterns.join(', ')}
- Graph Confidence: ${graphContext.graphConfidence}
- Entity Recommendations: ${graphContext.entityRecommendations.length}

HISTORICAL PATTERNS:
${graphContext.similarSuccessfulConversations.slice(0, 3).map((conv: any, i: number) => 
  `${i + 1}. Similar conversation led to ${conv.outcome} with pattern: ${conv.pattern}`
).join('\n')}

AVAILABLE QUESTIONS:
${availableQuestions.map((q, i) => `${i + 1}. [${q.category}] ${q.questionText}`).join('\n')}

Based on historical success patterns and current entity context, recommend the optimal next question.
Consider which questions have historically led to successful outcomes for similar entity combinations.
Provide detailed reasoning including graph-derived insights.`;
  }

  /**
   * Process reasoning with knowledge graph enhancements
   */
  private processGraphEnhancedReasoning(
    xaiReasoning: any,
    availableQuestions: QuestionBank[],
    graphContext: any,
    decisionType: string
  ): any {
    // Enhanced reasoning processing that includes graph insights
    const baseReasoning = this.processXAIReasoning(xaiReasoning, availableQuestions, decisionType);
    
    // Add graph-specific reasoning steps
    const graphReasoningStep = {
      step: baseReasoning.steps.length + 1,
      description: "Knowledge Graph Analysis",
      evidence: [
        `${graphContext.similarSuccessfulConversations.length} similar successful conversations found`,
        `Graph confidence: ${graphContext.graphConfidence}`,
        `Patterns identified: ${graphContext.relevantPatterns.join(', ')}`
      ],
      confidence: graphContext.graphConfidence,
      reasoning: `Based on knowledge graph analysis, similar entity combinations historically achieved ${
        graphContext.similarSuccessfulConversations.length > 0 ? 'positive' : 'mixed'
      } outcomes. Recommended approach aligns with successful patterns.`,
      dataUsed: {
        graphNodes: graphContext.entityRecommendations.length,
        historicalConversations: graphContext.similarSuccessfulConversations.length,
        successPatterns: graphContext.relevantPatterns
      },
      alternatives: ["Pattern-based approach", "Entity-similarity approach", "Historical-outcome approach"]
    };

    return {
      ...baseReasoning,
      steps: [...baseReasoning.steps, graphReasoningStep],
      finalJustification: baseReasoning.finalJustification + 
        ` Knowledge graph analysis supports this decision with ${graphContext.graphConfidence.toFixed(2)} confidence based on similar successful conversations.`,
      confidence: Math.min(baseReasoning.confidence + (graphContext.graphConfidence * 0.2), 1.0)
    };
  }

  /**
   * Select optimal question using graph context
   */
  private selectOptimalQuestionWithGraphContext(
    availableQuestions: QuestionBank[],
    structuredReasoning: any,
    xaiAnalysis: any,
    graphContext: any
  ): QuestionBank {
    // Get base recommendation
    const baseChoice = this.selectOptimalQuestion(availableQuestions, structuredReasoning, xaiAnalysis);
    
    // If we have strong graph context, potentially override the choice
    if (graphContext.graphConfidence > 0.7 && graphContext.entityRecommendations.length > 0) {
      // Look for questions that align with successful patterns
      const patternAlignedQuestions = availableQuestions.filter(q => 
        graphContext.relevantPatterns.some((pattern: string) => 
          q.category.toLowerCase().includes(pattern.toLowerCase()) ||
          q.questionText.toLowerCase().includes(pattern.toLowerCase())
        )
      );
      
      if (patternAlignedQuestions.length > 0) {
        // Return the highest-success-rate question from pattern-aligned options
        return patternAlignedQuestions.reduce((best, current) => 
          (current.successRate || 0) > (best.successRate || 0) ? current : best
        );
      }
    }
    
    return baseChoice;
  }

  /**
   * Generate business justification enhanced with knowledge graph insights
   */
  private generateKnowledgeEnhancedBusinessJustification(
    chosenOption: any,
    reasoning: any,
    graphContext: any,
    decisionType: string
  ): string {
    const baseJustification = this.generateBusinessJustification(chosenOption, reasoning, decisionType);
    
    const graphJustification = `

KNOWLEDGE GRAPH ENHANCEMENT:
- Decision supported by ${graphContext.similarSuccessfulConversations.length} similar successful conversations
- Graph confidence level: ${(graphContext.graphConfidence * 100).toFixed(1)}%
- Success patterns aligned: ${graphContext.relevantPatterns.join(', ')}
- Entity-based recommendations: ${graphContext.entityRecommendations.length} relevant insights
- Historical success rate for similar contexts: ${
  graphContext.similarSuccessfulConversations.length > 0 
    ? `${((graphContext.similarSuccessfulConversations.filter((c: any) => c.outcome === 'qualified').length / 
         graphContext.similarSuccessfulConversations.length) * 100).toFixed(1)}%`
    : 'Insufficient data'
}

This decision leverages accumulated knowledge from previous conversations to optimize lead qualification outcomes.`;

    return baseJustification + graphJustification;
  }
}

// Export singleton instance
export const reasoningService = new ReasoningService();