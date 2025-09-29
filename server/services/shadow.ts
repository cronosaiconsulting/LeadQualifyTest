import type { 
  Experiment, ExperimentVariant, ShadowDecision, InsertShadowDecision,
  ShadowMetrics, InsertShadowMetrics, PropensityScore, InsertPropensityScore,
  DecisionContext, QuestionCandidate, SituationAwarenessState
} from "@shared/schema";
import { storage } from "../storage";
import { decisionService } from "./decision";
import { learningService } from "./learning";
import { metricsService } from "./metrics";
import { openaiService } from "./openai";
import { safetyService } from "./safety";

export interface ShadowExecutionResult {
  shadowDecision: ShadowDecision;
  shadowMetrics?: ShadowMetrics;
  propensityScore?: PropensityScore;
  executionTimeMs: number;
  errorOccurred: boolean;
  errorMessage?: string;
}

export interface PolicyConfig {
  type: 'thompson_sampling' | 'epsilon_greedy' | 'cultural_adapted' | 'budget_focused';
  parameters: Record<string, any>;
  metricsWeights?: Record<string, number>;
  explorationRate?: number;
  culturalAdaptations?: Record<string, any>;
}

export interface ShadowContext extends DecisionContext {
  experimentId: string;
  variantId: string;
  productionDecisionId?: string;
  productionAction?: string;
}

export class ShadowDecisionEngine {
  private resourceLimits = {
    maxExecutionTimeMs: 5000, // 5 seconds max per shadow decision
    maxMemoryMb: 100,
    maxConcurrentShadowDecisions: 10
  };

  private activeShadowExecutions = new Set<string>();

  /**
   * Execute shadow decisions for all active experiments on a conversation
   */
  async executeShadowDecisions(
    conversationId: string,
    decisionContext: DecisionContext,
    productionDecisionId?: string,
    productionAction?: string
  ): Promise<ShadowExecutionResult[]> {
    const executionStart = Date.now();
    
    try {
      // Get active experiments that apply to this conversation
      const activeExperiments = await this.getApplicableExperiments(conversationId, decisionContext);
      
      if (activeExperiments.length === 0) {
        return [];
      }

      // SAFETY CHECK: Pre-execution safety validation for each experiment
      const safeExperiments = [];
      for (const experiment of activeExperiments) {
        for (const variant of experiment.variants) {
          const safetyCheck = await safetyService.performPreExecutionSafetyCheck(
            experiment.id,
            conversationId
          );
          
          if (safetyCheck.allowed) {
            safeExperiments.push({ experiment, variant });
          } else {
            console.warn(`Shadow execution blocked for experiment ${experiment.id}:`, safetyCheck.reason);
          }
        }
      }

      if (safeExperiments.length === 0) {
        console.warn('All shadow executions blocked by safety checks');
        return [];
      }

      // Check legacy resource limits (kept for backwards compatibility)
      if (this.activeShadowExecutions.size >= this.resourceLimits.maxConcurrentShadowDecisions) {
        console.warn('Shadow decision execution limit reached, skipping');
        return [];
      }

      const shadowResults: ShadowExecutionResult[] = [];

      // Execute shadow decisions in parallel for all safe variants
      const shadowPromises = safeExperiments.map(({ experiment, variant }) => 
        this.executeSingleShadowDecision({
          ...decisionContext,
          experimentId: experiment.id,
          variantId: variant.id,
          productionDecisionId,
          productionAction
        })
      );

      // Execute with timeout and resource limits
      const results = await Promise.allSettled(
        shadowPromises.map(promise => 
          this.withTimeout(promise, this.resourceLimits.maxExecutionTimeMs)
        )
      );

      // Process results and report to safety service
      results.forEach(async (result, index) => {
        const { experiment, variant } = safeExperiments[index];
        const executionTime = Date.now() - executionStart;
        
        if (result.status === 'fulfilled') {
          shadowResults.push(result.value);
          
          // Report successful execution to safety service
          await safetyService.recordShadowDecisionOutcome(
            experiment.id,
            true,
            result.value.executionTimeMs
          );
        } else {
          console.error(`Shadow decision for experiment ${experiment.id} failed:`, result.reason);
          
          // Report failed execution to safety service
          await safetyService.recordShadowDecisionOutcome(
            experiment.id,
            false,
            executionTime,
            result.reason?.toString()
          );
        }
      });

      return shadowResults;
    } catch (error) {
      console.error('Shadow decision execution error:', error);
      // Never let shadow errors affect production
      return [];
    }
  }

  /**
   * Execute a single shadow decision for a specific variant
   */
  private async executeSingleShadowDecision(
    shadowContext: ShadowContext
  ): Promise<ShadowExecutionResult> {
    const startTime = Date.now();
    const executionId = `${shadowContext.experimentId}_${shadowContext.variantId}_${Date.now()}`;
    
    try {
      this.activeShadowExecutions.add(executionId);

      // Get variant configuration
      const variant = await storage.getExperimentVariant(shadowContext.variantId);
      if (!variant) {
        throw new Error(`Variant ${shadowContext.variantId} not found`);
      }

      // Create shadow policy instance
      const shadowPolicy = this.createShadowPolicy(variant);
      
      // Execute shadow decision
      const shadowCandidate = await this.executePolicyDecision(shadowPolicy, shadowContext);
      
      // Calculate propensity score for IPS evaluation
      const propensityScore = await this.calculatePropensityScore(
        shadowContext,
        shadowCandidate,
        variant
      );

      // Record shadow decision
      const shadowDecision = await this.recordShadowDecision(
        shadowContext,
        shadowCandidate,
        variant,
        propensityScore,
        Date.now() - startTime
      );

      // Calculate shadow metrics if decision was successful
      let shadowMetrics: ShadowMetrics | undefined;
      if (shadowCandidate) {
        shadowMetrics = await this.calculateShadowMetrics(
          shadowContext,
          shadowDecision,
          shadowCandidate
        );
      }

      return {
        shadowDecision,
        shadowMetrics,
        propensityScore,
        executionTimeMs: Date.now() - startTime,
        errorOccurred: false
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error('Single shadow decision error:', error);

      // Record failed shadow decision for analysis
      const failedDecision = await this.recordFailedShadowDecision(
        shadowContext,
        error as Error,
        executionTime
      );

      return {
        shadowDecision: failedDecision,
        executionTimeMs: executionTime,
        errorOccurred: true,
        errorMessage: (error as Error).message
      };
    } finally {
      this.activeShadowExecutions.delete(executionId);
    }
  }

  /**
   * Create a shadow policy instance based on variant configuration
   */
  private createShadowPolicy(variant: ExperimentVariant): ShadowPolicy {
    const config: PolicyConfig = {
      type: variant.policyType as any,
      parameters: variant.policyConfig as Record<string, any>,
      metricsWeights: variant.metricsWeights as Record<string, number>,
      explorationRate: variant.explorationParams?.explorationRate,
      culturalAdaptations: variant.culturalAdaptations as Record<string, any>
    };

    switch (config.type) {
      case 'thompson_sampling':
        return new ThompsonSamplingShadowPolicy(config);
      case 'epsilon_greedy':
        return new EpsilonGreedyShadowPolicy(config);
      case 'cultural_adapted':
        return new CulturalAdaptedShadowPolicy(config);
      case 'budget_focused':
        return new BudgetFocusedShadowPolicy(config);
      default:
        throw new Error(`Unknown policy type: ${config.type}`);
    }
  }

  /**
   * Execute policy decision with the shadow policy
   */
  private async executePolicyDecision(
    policy: ShadowPolicy,
    context: ShadowContext
  ): Promise<QuestionCandidate | null> {
    try {
      // Create isolated context for shadow execution
      const isolatedContext = this.createIsolatedContext(context);
      
      // Execute policy decision
      const candidate = await policy.selectQuestion(isolatedContext);
      
      return candidate;
    } catch (error) {
      console.error('Policy execution error:', error);
      return null;
    }
  }

  /**
   * Calculate propensity score for IPS evaluation
   */
  private async calculatePropensityScore(
    context: ShadowContext,
    shadowCandidate: QuestionCandidate | null,
    variant: ExperimentVariant
  ): Promise<PropensityScore> {
    try {
      // Get production policy probabilities
      const productionProbability = await this.getProductionPolicyProbability(
        context,
        shadowCandidate?.selectedAction || 'no_action'
      );

      // Get shadow policy probabilities
      const shadowProbability = await this.getShadowPolicyProbability(
        context,
        shadowCandidate,
        variant
      );

      // Calculate propensity score for IPS
      const propensityScore = shadowProbability > 0 ? productionProbability / shadowProbability : 0;

      const propensityData: InsertPropensityScore = {
        conversationId: context.conversationId,
        experimentId: context.experimentId,
        variantId: context.variantId,
        behaviourPolicyScore: productionProbability,
        evaluationPolicyScore: shadowProbability,
        propensityScore,
        contextFeatures: this.extractContextFeatures(context),
        actionTaken: shadowCandidate?.selectedAction || 'no_action',
        propensityModel: 'policy_based',
        modelConfidence: Math.min(productionProbability, shadowProbability),
        isValidForIPS: propensityScore > 0 && propensityScore < 10 // Reasonable bounds for IPS
      };

      return await storage.savePropensityScore(propensityData);
    } catch (error) {
      console.error('Propensity score calculation error:', error);
      // Return default propensity score
      return await storage.savePropensityScore({
        conversationId: context.conversationId,
        experimentId: context.experimentId,
        variantId: context.variantId,
        behaviourPolicyScore: 0.5,
        evaluationPolicyScore: 0.5,
        propensityScore: 1.0,
        contextFeatures: {},
        actionTaken: 'error',
        isValidForIPS: false,
        validationNotes: `Error calculating propensity: ${(error as Error).message}`
      });
    }
  }

  /**
   * Record successful shadow decision
   */
  private async recordShadowDecision(
    context: ShadowContext,
    candidate: QuestionCandidate | null,
    variant: ExperimentVariant,
    propensityScore: PropensityScore,
    executionTimeMs: number
  ): Promise<ShadowDecision> {
    const shadowDecisionData: InsertShadowDecision = {
      conversationId: context.conversationId,
      experimentId: context.experimentId,
      variantId: context.variantId,
      productionDecisionId: context.productionDecisionId,
      decisionContext: context as any,
      selectedAction: candidate?.selectedAction || 'no_action',
      selectedQuestion: candidate?.question.questionText,
      questionId: candidate?.question.id !== 'ai-suggested' ? candidate?.question.id : null,
      confidence: candidate?.confidence || 0,
      utilityScore: candidate?.utilityScore || 0,
      explorationValue: candidate?.explorationValue || 0,
      reasoning: candidate?.reasoning || 'No candidate selected',
      policyScores: {
        utility: candidate?.utilityScore,
        exploration: candidate?.explorationValue,
        total: candidate?.totalScore
      },
      learningState: await this.captureLearningState(context.conversationId),
      culturalFactors: this.extractCulturalFactors(context),
      propensityScore: propensityScore.propensityScore,
      behaviourPolicy: {
        type: 'production',
        version: '1.0.0'
      },
      executionTimeMs,
      resourceUsage: this.captureResourceUsage(),
      errorOccurred: false
    };

    return await storage.saveShadowDecision(shadowDecisionData);
  }

  /**
   * Record failed shadow decision for analysis
   */
  private async recordFailedShadowDecision(
    context: ShadowContext,
    error: Error,
    executionTimeMs: number
  ): Promise<ShadowDecision> {
    const shadowDecisionData: InsertShadowDecision = {
      conversationId: context.conversationId,
      experimentId: context.experimentId,
      variantId: context.variantId,
      productionDecisionId: context.productionDecisionId,
      decisionContext: context as any,
      selectedAction: 'error',
      reasoning: `Shadow decision failed: ${error.message}`,
      confidence: 0,
      utilityScore: 0,
      explorationValue: 0,
      executionTimeMs,
      errorOccurred: true,
      errorMessage: error.message
    };

    return await storage.saveShadowDecision(shadowDecisionData);
  }

  /**
   * Calculate shadow metrics based on shadow decision
   */
  private async calculateShadowMetrics(
    context: ShadowContext,
    shadowDecision: ShadowDecision,
    candidate: QuestionCandidate
  ): Promise<ShadowMetrics> {
    try {
      // Simulate metrics calculation for shadow decision
      const shadowMetricsData: InsertShadowMetrics = {
        shadowDecisionId: shadowDecision.id,
        conversationId: context.conversationId,
        experimentId: context.experimentId,
        variantId: context.variantId,
        messageCount: context.currentState.messageCount,
        
        // Extract shadow scores from current state (these would be calculated differently in practice)
        shadowEngagementScore: context.currentState.dimensions.engagement.score,
        shadowQualificationScore: context.currentState.dimensions.qualification.score,
        shadowTechnicalScore: context.currentState.dimensions.technical.score,
        shadowEmotionalScore: context.currentState.dimensions.emotional.score,
        shadowCulturalScore: context.currentState.dimensions.cultural.score,
        
        // Calculate shadow-specific metrics
        shadowExpectedValue: this.calculateShadowExpectedValue(context, candidate),
        shadowAdvanceProbability: this.calculateShadowAdvanceProbability(context, candidate),
        shadowRegretScore: 0, // Will be calculated later in regret analysis
        
        // Counterfactual analysis
        counterfactualScores: await this.calculateCounterfactualScores(context, candidate),
        alternativeOutcomes: await this.generateAlternativeOutcomes(context, candidate),
        
        fullShadowMetrics: {
          policyType: shadowDecision.policyScores,
          executionDetails: {
            timeMs: shadowDecision.executionTimeMs,
            resourceUsage: shadowDecision.resourceUsage
          }
        }
      };

      return await storage.saveShadowMetrics(shadowMetricsData);
    } catch (error) {
      console.error('Shadow metrics calculation error:', error);
      throw error;
    }
  }

  // Helper methods
  private async getApplicableExperiments(
    conversationId: string,
    context: DecisionContext
  ): Promise<Array<Experiment & { variants: ExperimentVariant[] }>> {
    try {
      const experiments = await storage.getActiveExperiments();
      const applicable = [];

      for (const experiment of experiments) {
        // Check if conversation matches experiment criteria
        if (await this.isConversationEligible(conversationId, context, experiment)) {
          // Check traffic allocation
          if (this.shouldIncludeInExperiment(conversationId, experiment.trafficAllocation || 0.1)) {
            const variants = await storage.getExperimentVariants(experiment.id);
            applicable.push({ ...experiment, variants });
          }
        }
      }

      return applicable;
    } catch (error) {
      console.error('Error getting applicable experiments:', error);
      return [];
    }
  }

  private async isConversationEligible(
    conversationId: string,
    context: DecisionContext,
    experiment: Experiment
  ): Promise<boolean> {
    try {
      const targetPopulation = experiment.targetPopulation as any;
      
      // Check conversation stage
      if (targetPopulation.conversationStage && 
          !targetPopulation.conversationStage.includes(context.conversationStage)) {
        return false;
      }

      // Check message count
      if (targetPopulation.minMessageCount && 
          context.currentState.messageCount < targetPopulation.minMessageCount) {
        return false;
      }

      // Check qualification score
      if (targetPopulation.minQualificationScore &&
          context.currentState.dimensions.qualification.score < targetPopulation.minQualificationScore) {
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error checking conversation eligibility:', error);
      return false;
    }
  }

  private shouldIncludeInExperiment(conversationId: string, trafficAllocation: number): boolean {
    // Use deterministic hash of conversation ID for consistent allocation
    const hash = this.hashString(conversationId);
    return hash < trafficAllocation;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash % 100) / 100; // Return value between 0 and 1
  }

  private createIsolatedContext(context: ShadowContext): DecisionContext {
    // Return a deep copy to prevent shadow operations from affecting production context
    return JSON.parse(JSON.stringify({
      conversationId: context.conversationId,
      currentState: context.currentState,
      messageHistory: context.messageHistory,
      previousQuestions: context.previousQuestions,
      conversationStage: context.conversationStage
    }));
  }

  private async getProductionPolicyProbability(
    context: ShadowContext,
    action: string
  ): Promise<number> {
    // This would integrate with the production decision service to get action probabilities
    // For now, return a reasonable default
    return 0.5;
  }

  private async getShadowPolicyProbability(
    context: ShadowContext,
    candidate: QuestionCandidate | null,
    variant: ExperimentVariant
  ): Promise<number> {
    // Calculate probability based on policy type and candidate scores
    if (!candidate) return 0.1; // Small probability for no action
    
    // Normalize scores to probabilities
    return Math.max(0.1, Math.min(0.9, candidate.totalScore));
  }

  private extractContextFeatures(context: ShadowContext): Record<string, any> {
    return {
      messageCount: context.currentState.messageCount,
      engagementScore: context.currentState.dimensions.engagement.score,
      qualificationScore: context.currentState.dimensions.qualification.score,
      conversationStage: context.conversationStage,
      culturalScore: context.currentState.dimensions.cultural.score
    };
  }

  private async captureLearningState(conversationId: string): Promise<Record<string, any>> {
    try {
      const learningStates = await storage.getAllLearningStates(conversationId);
      return learningStates.reduce((acc, state) => {
        acc[state.metricName] = {
          value: state.currentValue,
          confidence: state.confidence,
          explorationRate: state.explorationRate
        };
        return acc;
      }, {} as Record<string, any>);
    } catch (error) {
      return {};
    }
  }

  private extractCulturalFactors(context: ShadowContext): Record<string, any> {
    return {
      culturalScore: context.currentState.dimensions.cultural.score,
      // Extract specific cultural indicators from the state
      formalityLevel: context.currentState.dimensions.cultural.groups?.formality || {},
      communicationStyle: context.currentState.dimensions.cultural.groups?.style || {}
    };
  }

  private captureResourceUsage(): Record<string, any> {
    const memoryUsage = process.memoryUsage();
    return {
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      external: memoryUsage.external
    };
  }

  private calculateShadowExpectedValue(
    context: ShadowContext,
    candidate: QuestionCandidate
  ): number {
    // Calculate expected value based on shadow decision
    const baseValue = context.currentState.dimensions.qualification.score * 10000; // $10k base
    const candidateMultiplier = candidate ? (candidate.utilityScore + 1) : 1;
    return baseValue * candidateMultiplier;
  }

  private calculateShadowAdvanceProbability(
    context: ShadowContext,
    candidate: QuestionCandidate
  ): number {
    // Calculate probability of advancing based on shadow decision
    const baseProb = context.currentState.dimensions.qualification.score;
    const candidateBoost = candidate ? candidate.confidence * 0.2 : 0;
    return Math.min(0.95, baseProb + candidateBoost);
  }

  private async calculateCounterfactualScores(
    context: ShadowContext,
    candidate: QuestionCandidate
  ): Promise<Record<string, number>> {
    // Calculate what scores would be under different scenarios
    return {
      noAction: context.currentState.dimensions.qualification.score,
      alternativeQuestion: context.currentState.dimensions.qualification.score * 0.9,
      selectedAction: candidate ? candidate.totalScore : 0
    };
  }

  private async generateAlternativeOutcomes(
    context: ShadowContext,
    candidate: QuestionCandidate
  ): Promise<Array<{ action: string; expectedOutcome: number; probability: number }>> {
    // Generate alternative outcomes for analysis
    return [
      { action: 'no_action', expectedOutcome: 0, probability: 0.1 },
      { action: 'standard_question', expectedOutcome: 0.5, probability: 0.6 },
      { action: 'selected_action', expectedOutcome: candidate?.totalScore || 0, probability: 0.3 }
    ];
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error('Shadow execution timeout')), timeoutMs)
      )
    ]);
  }
}

// Abstract base class for shadow policies
abstract class ShadowPolicy {
  protected config: PolicyConfig;

  constructor(config: PolicyConfig) {
    this.config = config;
  }

  abstract selectQuestion(context: DecisionContext): Promise<QuestionCandidate | null>;
  
  protected async getAvailableQuestions(context: DecisionContext): Promise<any[]> {
    // Get questions using existing service but in isolated manner
    return await storage.getQuestions(undefined, 'es', 'ES');
  }
}

// Thompson Sampling Shadow Policy
class ThompsonSamplingShadowPolicy extends ShadowPolicy {
  async selectQuestion(context: DecisionContext): Promise<QuestionCandidate | null> {
    const questions = await this.getAvailableQuestions(context);
    if (questions.length === 0) return null;

    // Thompson sampling with shadow parameters
    const alpha = this.config.parameters.alpha || 1;
    const beta = this.config.parameters.beta || 1;
    
    let bestQuestion = null;
    let bestScore = -1;

    for (const question of questions) {
      // Sample from Beta distribution for this question
      const successRate = question.successRate || 0.5;
      const usageCount = question.usageCount || 1;
      
      const sampleAlpha = alpha + successRate * usageCount;
      const sampleBeta = beta + (1 - successRate) * usageCount;
      
      // Simple beta sampling approximation
      const sample = Math.random() * (sampleAlpha / (sampleAlpha + sampleBeta));
      
      if (sample > bestScore) {
        bestScore = sample;
        bestQuestion = question;
      }
    }

    if (!bestQuestion) return null;

    return {
      question: bestQuestion,
      utilityScore: bestScore,
      explorationValue: this.config.explorationRate || 0.1,
      totalScore: bestScore,
      reasoning: `Thompson sampling selected with score ${bestScore.toFixed(3)}`,
      confidence: bestScore,
      selectedAction: `ask_question_${bestQuestion.category}`
    };
  }
}

// Epsilon Greedy Shadow Policy
class EpsilonGreedyShadowPolicy extends ShadowPolicy {
  async selectQuestion(context: DecisionContext): Promise<QuestionCandidate | null> {
    const questions = await this.getAvailableQuestions(context);
    if (questions.length === 0) return null;

    const epsilon = this.config.parameters.epsilon || 0.1;
    const isExploration = Math.random() < epsilon;

    let selectedQuestion;
    let reasoning;

    if (isExploration) {
      // Random exploration
      selectedQuestion = questions[Math.floor(Math.random() * questions.length)];
      reasoning = `Epsilon-greedy exploration (ε=${epsilon})`;
    } else {
      // Greedy exploitation
      selectedQuestion = questions.reduce((best, current) => 
        (current.successRate || 0) > (best.successRate || 0) ? current : best
      );
      reasoning = `Epsilon-greedy exploitation (best success rate: ${selectedQuestion.successRate})`;
    }

    const utilityScore = selectedQuestion.successRate || 0.5;
    
    return {
      question: selectedQuestion,
      utilityScore,
      explorationValue: isExploration ? 1 : 0,
      totalScore: utilityScore,
      reasoning,
      confidence: isExploration ? 0.5 : utilityScore,
      selectedAction: `ask_question_${selectedQuestion.category}`
    };
  }
}

// Cultural Adapted Shadow Policy
class CulturalAdaptedShadowPolicy extends ShadowPolicy {
  async selectQuestion(context: DecisionContext): Promise<QuestionCandidate | null> {
    const questions = await this.getAvailableQuestions(context);
    if (questions.length === 0) return null;

    const culturalScore = context.currentState.dimensions.cultural.score;
    const adaptations = this.config.culturalAdaptations || {};
    
    // Filter questions based on cultural appropriateness
    const culturallyAppropriate = questions.filter(question => {
      // Apply cultural filtering logic
      if (culturalScore < 0.5 && question.category === 'budget') {
        return false; // Avoid budget questions if cultural rapport is low
      }
      return true;
    });

    if (culturallyAppropriate.length === 0) {
      return null;
    }

    // Score questions with cultural weights
    const scored = culturallyAppropriate.map(question => {
      let score = question.successRate || 0.5;
      
      // Apply cultural boosts
      if (question.category === 'relationship' && culturalScore > 0.7) {
        score *= 1.3; // Boost relationship questions for high cultural score
      }
      
      return { question, score };
    });

    const best = scored.reduce((best, current) => 
      current.score > best.score ? current : best
    );

    return {
      question: best.question,
      utilityScore: best.score,
      explorationValue: 0.1,
      totalScore: best.score,
      reasoning: `Cultural adaptation: selected ${best.question.category} (cultural score: ${culturalScore.toFixed(2)})`,
      confidence: Math.min(0.9, best.score + culturalScore * 0.1),
      selectedAction: `ask_question_${best.question.category}`
    };
  }
}

// Budget Focused Shadow Policy
class BudgetFocusedShadowPolicy extends ShadowPolicy {
  async selectQuestion(context: DecisionContext): Promise<QuestionCandidate | null> {
    const questions = await this.getAvailableQuestions(context);
    if (questions.length === 0) return null;

    const budgetSignal = context.currentState.dimensions.qualification.groups?.budget?.strength || 0;
    const targetBudget = this.config.parameters.targetBudget || 10000;
    
    // Prioritize budget-related questions if budget signal is weak
    let prioritizedQuestions = questions;
    if (budgetSignal < 0.3) {
      const budgetQuestions = questions.filter(q => q.category === 'budget');
      if (budgetQuestions.length > 0) {
        prioritizedQuestions = budgetQuestions;
      }
    }

    // Score based on budget detection effectiveness
    const scored = prioritizedQuestions.map(question => {
      let score = question.successRate || 0.5;
      
      // Boost budget-related questions
      if (question.category === 'budget') {
        score *= 1.5;
      }
      
      // Boost questions that historically led to budget discovery around target range
      const metrics = question.metrics as any;
      if (metrics?.avgBudgetDiscovered && 
          Math.abs(metrics.avgBudgetDiscovered - targetBudget) < targetBudget * 0.5) {
        score *= 1.2;
      }
      
      return { question, score };
    });

    const best = scored.reduce((best, current) => 
      current.score > best.score ? current : best
    );

    return {
      question: best.question,
      utilityScore: best.score,
      explorationValue: budgetSignal < 0.3 ? 0.3 : 0.1,
      totalScore: best.score,
      reasoning: `Budget-focused: targeting $${targetBudget} deals (current signal: ${budgetSignal.toFixed(2)})`,
      confidence: best.score,
      selectedAction: `ask_question_${best.question.category}`
    };
  }
}

export const shadowDecisionEngine = new ShadowDecisionEngine();