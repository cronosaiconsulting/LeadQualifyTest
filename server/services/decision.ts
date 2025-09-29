import type { 
  QuestionBank, 
  ConversationMetrics, 
  DecisionTrace, 
  InsertDecisionTrace,
  SituationAwarenessState 
} from "@shared/schema";
import { storage } from "../storage";
import { learningService } from "./learning";
import { xaiService } from "./xai";
import { reasoningService } from "./reasoning";
import { nanoid } from "nanoid";

export interface QuestionCandidate {
  question: QuestionBank;
  utilityScore: number;
  explorationValue: number;
  totalScore: number;
  reasoning: string;
  confidence: number;
}

export interface DecisionContext {
  conversationId: string;
  currentState: SituationAwarenessState;
  messageHistory: string[];
  previousQuestions: string[];
  conversationStage: 'early' | 'mid' | 'late';
}

export class DecisionService {
  async selectOptimalQuestion(context: DecisionContext): Promise<QuestionCandidate | null> {
    const { conversationId, currentState, messageHistory } = context;
    
    // Get exploration rate for this conversation
    const explorationRate = await learningService.getExplorationRate(conversationId);
    
    // Get available questions
    const availableQuestions = await this.getEligibleQuestions(context);
    
    if (availableQuestions.length === 0) {
      return null;
    }

    // Calculate scores for each candidate
    const candidates: QuestionCandidate[] = [];
    
    for (const question of availableQuestions) {
      const utilityScore = await this.calculateUtilityScore(question, context);
      const explorationValue = await this.calculateExplorationValue(question, context);
      const totalScore = utilityScore + explorationRate * explorationValue;
      
      candidates.push({
        question,
        utilityScore,
        explorationValue,
        totalScore,
        reasoning: await this.generateReasoning(question, context, utilityScore, explorationValue),
        confidence: this.calculateConfidence(utilityScore, explorationValue, context)
      });
    }

    // Sort by total score and select top candidate
    candidates.sort((a, b) => b.totalScore - a.totalScore);
    const selectedCandidate = candidates[0];

    // Generate sophisticated reasoning using xAI for question selection
    const turnId = nanoid();
    const reasoningContext = {
      conversationId,
      turnId,
      decisionType: 'question_selection' as const,
      inputFeatures: {
        currentState,
        messageHistory,
        availableQuestions: availableQuestions.slice(0, 10),
        candidateScores: candidates.slice(0, 5)
      },
      candidates: availableQuestions
    };

    const reasoningResult = await reasoningService.generateQuestionSelectionReasoning(
      reasoningContext,
      currentState,
      availableQuestions
    );

    // Use xAI reasoning result as the primary decision
    const xaiChosenQuestion = reasoningResult.chosenOption;

    // Create QuestionCandidate from xAI reasoning result
    const xaiCandidate: QuestionCandidate = {
      question: xaiChosenQuestion,
      utilityScore: reasoningResult.reasoning.confidence,
      explorationValue: 0.3, // Default exploration value
      totalScore: reasoningResult.reasoning.confidence,
      reasoning: reasoningResult.reasoning.finalJustification,
      confidence: reasoningResult.reasoning.confidence
    };

    // Compare xAI choice with traditional scoring
    if (xaiCandidate.confidence > 0.7 && xaiCandidate.confidence > selectedCandidate.confidence) {
      console.log(`xAI reasoning selected different question with confidence ${xaiCandidate.confidence}`);
      return xaiCandidate;
    }

    // Store reasoning trace ID for later "Why" panel access
    selectedCandidate.reasoning += ` (Trace ID: ${reasoningResult.trace.id})`;
    
    return selectedCandidate;
  }

  private async getEligibleQuestions(context: DecisionContext): Promise<QuestionBank[]> {
    const { currentState, previousQuestions, conversationStage } = context;
    
    // Get all active questions
    const allQuestions = await storage.getQuestions(undefined, 'es', 'ES');
    
    // Filter based on eligibility criteria
    return allQuestions.filter(question => {
      // Don't repeat recent questions
      if (previousQuestions.some(prev => 
        this.questionsAreSimilar(prev, question.questionText))) {
        return false;
      }

      // Stage-appropriate questions
      if (!this.isStageAppropriate(question, conversationStage, currentState)) {
        return false;
      }

      // Category-specific filtering
      return this.isCategoryAppropriate(question, currentState);
    });
  }

  private questionsAreSimilar(q1: string, q2: string): boolean {
    // Simple similarity check - in production, use more sophisticated NLP
    const words1 = q1.toLowerCase().split(' ').filter(w => w.length > 3);
    const words2 = q2.toLowerCase().split(' ').filter(w => w.length > 3);
    
    const commonWords = words1.filter(w => words2.includes(w));
    return commonWords.length > Math.min(words1.length, words2.length) * 0.5;
  }

  private isStageAppropriate(
    question: QuestionBank, 
    stage: 'early' | 'mid' | 'late',
    currentState: SituationAwarenessState
  ): boolean {
    const { category } = question;
    
    switch (stage) {
      case 'early':
        // Early stage: focus on engagement, needs, and basic qualification
        return ['need', 'relationship', 'general', 'industry'].includes(category);
      
      case 'mid':
        // Mid stage: technical details, authority, some budget exploration
        return ['technical', 'authority', 'budget', 'timeline', 'process'].includes(category);
      
      case 'late':
        // Late stage: budget, decision process, next steps
        return ['budget', 'authority', 'timeline', 'decision', 'closing'].includes(category);
      
      default:
        return true;
    }
  }

  private isCategoryAppropriate(
    question: QuestionBank,
    currentState: SituationAwarenessState
  ): boolean {
    const { category } = question;
    const { dimensions } = currentState;

    switch (category) {
      case 'budget':
        // Only ask budget questions if engagement and trust are sufficient
        return dimensions.engagement.score > 0.5 && 
               dimensions.emotional.groups.trust.transparency > 0.4;
      
      case 'authority':
        // Authority questions are generally safe but more effective mid-conversation
        return currentState.messageCount > 3;
      
      case 'technical':
        // Technical questions work best with technically inclined prospects
        return dimensions.technical.score > 0.3 || currentState.messageCount < 5;
      
      case 'timeline':
        // Timeline questions need some qualification foundation
        return dimensions.qualification.score > 0.3;
      
      default:
        return true;
    }
  }

  private async calculateUtilityScore(
    question: QuestionBank,
    context: DecisionContext
  ): Promise<number> {
    const metrics = await storage.getLatestMetrics(context.conversationId);
    
    if (!metrics) {
      return 0.5; // Default score if no metrics available
    }

    return await learningService.calculateUtilityScore(
      question.category,
      metrics,
      0 // No exploration bonus here - calculated separately
    );
  }

  private async calculateExplorationValue(
    question: QuestionBank,
    context: DecisionContext
  ): Promise<number> {
    const { currentState } = context;
    const { dimensions } = currentState;

    // Higher exploration value for less explored dimensions
    const dimensionScores = {
      budget: dimensions.qualification.groups.budget.signal_strength,
      authority: dimensions.qualification.groups.authority.decision_power,
      need: dimensions.qualification.groups.need.problem_severity,
      technical: dimensions.technical.score,
      timeline: dimensions.qualification.groups.budget.urgency // timeline urgency
    };

    const category = question.category as keyof typeof dimensionScores;
    const currentScore = dimensionScores[category] || 0.5;
    
    // Inverse relationship: lower current score = higher exploration value
    const explorationValue = 1 - currentScore;
    
    // Bonus for questions that haven't been used much
    const usageBonus = Math.max(0, 1 - (question.usageCount || 0) / 100);
    
    // Penalty for questions with low success rate
    const successPenalty = (question.successRate || 0.5);
    
    return Math.max(0, Math.min(1, explorationValue + usageBonus * 0.2)) * successPenalty;
  }

  private async generateReasoning(
    question: QuestionBank,
    context: DecisionContext,
    utilityScore: number,
    explorationValue: number
  ): Promise<string> {
    const { currentState } = context;
    const { dimensions, messageCount } = currentState;

    const reasonParts: string[] = [];

    // Utility reasoning
    if (utilityScore > 0.7) {
      reasonParts.push(`High utility (${utilityScore.toFixed(2)}) due to strong fit with current context`);
    } else if (utilityScore < 0.3) {
      reasonParts.push(`Low utility (${utilityScore.toFixed(2)}) but may provide needed information`);
    }

    // Exploration reasoning
    if (explorationValue > 0.6) {
      reasonParts.push(`High exploration value (${explorationValue.toFixed(2)}) - unexplored area`);
    }

    // Context-specific reasoning
    if (question.category === 'budget' && dimensions.engagement.score > 0.7) {
      reasonParts.push('Strong engagement makes budget discussion appropriate');
    }

    if (question.category === 'technical' && dimensions.technical.score > 0.6) {
      reasonParts.push('High technical sophistication detected');
    }

    if (messageCount > 15 && question.category === 'authority') {
      reasonParts.push('Extended conversation warrants authority qualification');
    }

    // Default reasoning if none specific
    if (reasonParts.length === 0) {
      reasonParts.push(`Category: ${question.category}, balanced approach for current conversation stage`);
    }

    return reasonParts.join('; ');
  }

  private calculateConfidence(
    utilityScore: number,
    explorationValue: number,
    context: DecisionContext
  ): number {
    const { currentState } = context;
    
    // Base confidence from utility score
    let confidence = utilityScore;
    
    // Increase confidence with more conversation data
    const dataConfidence = Math.min(1, currentState.messageCount / 10);
    confidence = confidence * 0.7 + dataConfidence * 0.3;
    
    // Adjust for exploration uncertainty
    if (explorationValue > 0.7) {
      confidence *= 0.8; // Less confident about highly exploratory questions
    }
    
    // System confidence factor
    const systemConfidence = currentState.meta.systemConfidence.score;
    confidence = confidence * 0.8 + systemConfidence * 0.2;
    
    return Math.max(0.1, Math.min(0.95, confidence));
  }

  async recordDecision(
    conversationId: string,
    selectedCandidate: QuestionCandidate,
    context: DecisionContext
  ): Promise<DecisionTrace> {
    const trace: InsertDecisionTrace = {
      conversationId,
      action: `ask_question_${selectedCandidate.question.category}`,
      reasoning: selectedCandidate.reasoning,
      metricsUsed: this.extractMetricsUsed(context),
      confidence: selectedCandidate.confidence,
      explorationValue: selectedCandidate.explorationValue,
      utilityScore: selectedCandidate.utilityScore,
      questionSelected: selectedCandidate.question.questionText,
      outcome: 'pending',
      feedback: {
        questionId: selectedCandidate.question.id,
        category: selectedCandidate.question.category,
        totalScore: selectedCandidate.totalScore,
        conversationStage: context.conversationStage,
        messageCount: context.currentState.messageCount
      }
    };

    return await storage.saveDecisionTrace(trace);
  }

  private extractMetricsUsed(context: DecisionContext): string[] {
    const { dimensions } = context.currentState;
    
    return [
      `engagement:${dimensions.engagement.score.toFixed(2)}`,
      `qualification:${dimensions.qualification.score.toFixed(2)}`,
      `technical:${dimensions.technical.score.toFixed(2)}`,
      `emotional:${dimensions.emotional.score.toFixed(2)}`,
      `trust:${dimensions.emotional.groups.trust.transparency.toFixed(2)}`,
      `budget_signals:${dimensions.qualification.groups.budget.signal_strength.toFixed(2)}`
    ];
  }

  async updateDecisionOutcome(
    traceId: string,
    outcome: 'success' | 'failure' | 'neutral',
    feedback: any
  ): Promise<void> {
    // This would update the decision trace with the outcome
    // and trigger learning updates
    
    const outcomeValue = outcome === 'success' ? 1 : outcome === 'failure' ? -1 : 0;
    
    // Update learning state for relevant metrics
    // This would be called after analyzing the user's response to the question
  }

  getConversationStage(messageCount: number, qualificationScore: number): 'early' | 'mid' | 'late' {
    if (messageCount <= 5) return 'early';
    if (messageCount <= 15 || qualificationScore < 0.6) return 'mid';
    return 'late';
  }

  async getWeightConfiguration(stage: 'early' | 'mid' | 'late'): Promise<Record<string, number>> {
    const configurations = {
      early: {
        engagement: 0.35,
        trust: 0.30,
        qualification: 0.20,
        technical: 0.15
      },
      mid: {
        qualification: 0.35,
        technical: 0.25,
        engagement: 0.20,
        trust: 0.20
      },
      late: {
        qualification: 0.40,
        coverage: 0.30,
        trust: 0.20,
        efficiency: 0.10
      }
    };

    return configurations[stage];
  }
}

export const decisionService = new DecisionService();
