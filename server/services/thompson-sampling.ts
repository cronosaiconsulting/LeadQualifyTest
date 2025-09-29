import type { ShadowDecision, ShadowMetrics, ExperimentVariant } from "@shared/schema";
import { storage } from "../storage";

export interface ThompsonSamplingConfig {
  algorithm: 'beta_bernoulli' | 'gaussian' | 'linear_gaussian' | 'contextual_bandits';
  
  // Beta-Bernoulli configuration
  betaBernoulli?: {
    priorAlpha: number;
    priorBeta: number;
    successThreshold: number; // What constitutes "success" (e.g., qualification score > 0.7)
  };
  
  // Gaussian configuration
  gaussian?: {
    priorMean: number;
    priorVariance: number;
    noiseVariance: number;
    updateMethod: 'bayesian' | 'empirical_bayes';
  };
  
  // Contextual bandits configuration
  contextualBandits?: {
    featureDimension: number;
    regularizationParam: number;
    confidenceWidth: number;
    updateFrequency: number; // How often to update the model
  };
  
  // General sampling configuration
  samplingConfig: {
    batchSize?: number; // For batch sampling
    temperatureSchedule?: 'constant' | 'linear_decay' | 'exponential_decay';
    initialTemperature?: number;
    minTemperature?: number;
    decayRate?: number;
    
    // Confidence-based parameters
    confidenceThreshold: number;
    uncertaintyPenalty: number; // How much to penalize high uncertainty
    diversificationBonus: number; // Bonus for choosing diverse actions
  };
  
  // Cultural and contextual adaptations
  contextualAdaptations: {
    culturalFactors: Record<string, number>; // Weights for different cultural contexts
    conversationStageWeights: Record<string, number>; // Different weights by conversation stage
    timeOfDayFactors?: Record<string, number>; // Time-based adaptations
    regionSpecificParams?: Record<string, any>; // Region-specific parameters
  };
}

export interface ActionCandidate {
  actionId: string;
  actionType: 'question_selection' | 'qualification_threshold' | 'response_strategy';
  expectedReward: number;
  uncertainty: number;
  contextFeatures: Record<string, number>;
  culturalAlignment: number;
  
  // Thompson sampling specific
  sampledValue?: number;
  posteriorMean?: number;
  posteriorVariance?: number;
  confidenceInterval?: { lower: number; upper: number };
}

export interface SamplingResult {
  selectedAction: ActionCandidate;
  allCandidates: ActionCandidate[];
  samplingMetadata: {
    algorithm: string;
    temperature: number;
    explorationRate: number;
    confidenceLevel: number;
    diversityScore: number;
  };
  contextualFactors: {
    conversationStage: string;
    culturalContext: Record<string, number>;
    timeContext: string;
    urgencyLevel: number;
  };
}

export interface BeliefState {
  actionId: string;
  
  // Beta-Bernoulli beliefs
  alpha?: number;
  beta?: number;
  successRate?: number;
  
  // Gaussian beliefs
  mean?: number;
  variance?: number;
  precision?: number;
  
  // Contextual bandit beliefs
  featureWeights?: number[];
  covarianceMatrix?: number[][];
  
  // Metadata
  sampleCount: number;
  lastUpdated: Date;
  confidenceLevel: number;
  explorationBonus: number;
}

export class ThompsonSamplingService {
  private beliefStates: Map<string, BeliefState> = new Map();
  private samplingHistory: Map<string, SamplingResult[]> = new Map();

  /**
   * Select action using Thompson sampling
   */
  async selectAction(
    experimentId: string,
    variantId: string,
    conversationId: string,
    actionCandidates: ActionCandidate[],
    context: Record<string, any>
  ): Promise<SamplingResult> {
    const variant = await storage.getExperimentVariant(variantId);
    if (!variant) {
      throw new Error('Experiment variant not found');
    }

    const config = this.parseThompsonSamplingConfig(variant);
    
    // Update beliefs based on recent observations
    await this.updateBeliefs(experimentId, variantId, config);
    
    // Prepare candidates with current beliefs
    const enrichedCandidates = await this.enrichCandidatesWithBeliefs(
      actionCandidates, 
      config, 
      context
    );
    
    // Perform Thompson sampling
    const selectedAction = this.performThompsonSampling(enrichedCandidates, config, context);
    
    // Calculate sampling metadata
    const samplingMetadata = this.calculateSamplingMetadata(enrichedCandidates, config);
    
    // Extract contextual factors
    const contextualFactors = this.extractContextualFactors(context);
    
    const result: SamplingResult = {
      selectedAction,
      allCandidates: enrichedCandidates,
      samplingMetadata,
      contextualFactors
    };
    
    // Store sampling history
    await this.recordSamplingResult(experimentId, variantId, conversationId, result);
    
    return result;
  }

  /**
   * Update action based on observed reward
   */
  async updateActionReward(
    experimentId: string,
    variantId: string,
    actionId: string,
    reward: number,
    context: Record<string, any>
  ): Promise<void> {
    const variant = await storage.getExperimentVariant(variantId);
    if (!variant) {
      throw new Error('Experiment variant not found');
    }

    const config = this.parseThompsonSamplingConfig(variant);
    const beliefKey = `${experimentId}_${variantId}_${actionId}`;
    
    let belief = this.beliefStates.get(beliefKey) || this.initializeBelief(actionId, config);
    
    // Update belief based on algorithm type
    switch (config.algorithm) {
      case 'beta_bernoulli':
        belief = this.updateBetaBernoulliBeliefs(belief, reward, config);
        break;
        
      case 'gaussian':
        belief = this.updateGaussianBeliefs(belief, reward, config);
        break;
        
      case 'contextual_bandits':
        belief = this.updateContextualBanditBeliefs(belief, reward, context, config);
        break;
        
      default:
        throw new Error(`Unknown Thompson sampling algorithm: ${config.algorithm}`);
    }
    
    belief.lastUpdated = new Date();
    belief.sampleCount += 1;
    
    this.beliefStates.set(beliefKey, belief);
    
    // Persist beliefs periodically
    if (belief.sampleCount % 10 === 0) {
      await this.persistBeliefs(experimentId, variantId);
    }
  }

  /**
   * Get current beliefs for an experiment variant
   */
  async getBeliefs(experimentId: string, variantId: string): Promise<Record<string, BeliefState>> {
    const beliefs: Record<string, BeliefState> = {};
    
    for (const [key, belief] of this.beliefStates.entries()) {
      if (key.startsWith(`${experimentId}_${variantId}_`)) {
        const actionId = key.split('_').slice(2).join('_');
        beliefs[actionId] = belief;
      }
    }
    
    return beliefs;
  }

  /**
   * Analyze Thompson sampling performance
   */
  async analyzeThompsonSamplingPerformance(
    experimentId: string,
    variantId: string,
    timeRange?: { start: Date; end: Date }
  ): Promise<{
    explorationRate: number;
    exploitationRate: number;
    regretBounds: { lower: number; upper: number };
    convergenceMetrics: {
      beliefStability: number;
      actionDistribution: Record<string, number>;
      uncertaintyReduction: number;
    };
    culturalAdaptationEffectiveness: Record<string, number>;
    recommendations: string[];
  }> {
    const samplingHistory = this.samplingHistory.get(`${experimentId}_${variantId}`) || [];
    
    // Filter by time range if provided
    let relevantHistory = samplingHistory;
    if (timeRange) {
      relevantHistory = samplingHistory.filter(result => {
        const timestamp = new Date(); // Would get actual timestamp from result
        return timestamp >= timeRange.start && timestamp <= timeRange.end;
      });
    }
    
    // Calculate exploration vs exploitation
    const explorationDecisions = relevantHistory.filter(r => 
      r.samplingMetadata.explorationRate > 0.5
    ).length;
    const explorationRate = relevantHistory.length > 0 ? 
      explorationDecisions / relevantHistory.length : 0;
    const exploitationRate = 1 - explorationRate;
    
    // Calculate regret bounds using concentration inequalities
    const regretBounds = this.calculateRegretBounds(relevantHistory);
    
    // Analyze convergence
    const convergenceMetrics = this.analyzeConvergence(experimentId, variantId, relevantHistory);
    
    // Analyze cultural adaptation effectiveness
    const culturalAdaptationEffectiveness = this.analyzeCulturalAdaptation(relevantHistory);
    
    // Generate recommendations
    const recommendations = this.generateThompsonSamplingRecommendations({
      explorationRate,
      convergenceMetrics,
      culturalAdaptationEffectiveness,
      sampleSize: relevantHistory.length
    });
    
    return {
      explorationRate,
      exploitationRate,
      regretBounds,
      convergenceMetrics,
      culturalAdaptationEffectiveness,
      recommendations
    };
  }

  /**
   * Generate different Thompson sampling configurations for experiments
   */
  generateThompsonSamplingConfigurations(): Record<string, ThompsonSamplingConfig> {
    return {
      'conservative_beta_bernoulli': {
        algorithm: 'beta_bernoulli',
        betaBernoulli: {
          priorAlpha: 1,
          priorBeta: 1,
          successThreshold: 0.7
        },
        samplingConfig: {
          confidenceThreshold: 0.8,
          uncertaintyPenalty: 0.2,
          diversificationBonus: 0.1,
          temperatureSchedule: 'constant',
          initialTemperature: 1.0
        },
        contextualAdaptations: {
          culturalFactors: { 'latam': 1.2, 'us': 1.0, 'europe': 1.1 },
          conversationStageWeights: { 'early': 1.3, 'mid': 1.0, 'late': 0.8 }
        }
      },
      
      'aggressive_exploration': {
        algorithm: 'gaussian',
        gaussian: {
          priorMean: 0.5,
          priorVariance: 0.25,
          noiseVariance: 0.1,
          updateMethod: 'bayesian'
        },
        samplingConfig: {
          confidenceThreshold: 0.6,
          uncertaintyPenalty: 0.1,
          diversificationBonus: 0.3,
          temperatureSchedule: 'exponential_decay',
          initialTemperature: 2.0,
          minTemperature: 0.5,
          decayRate: 0.95
        },
        contextualAdaptations: {
          culturalFactors: { 'latam': 1.5, 'us': 1.0, 'europe': 1.2 },
          conversationStageWeights: { 'early': 1.5, 'mid': 1.2, 'late': 0.9 }
        }
      },
      
      'contextual_cultural': {
        algorithm: 'contextual_bandits',
        contextualBandits: {
          featureDimension: 10,
          regularizationParam: 0.1,
          confidenceWidth: 2.0,
          updateFrequency: 5
        },
        samplingConfig: {
          confidenceThreshold: 0.75,
          uncertaintyPenalty: 0.15,
          diversificationBonus: 0.2,
          temperatureSchedule: 'linear_decay',
          initialTemperature: 1.5,
          minTemperature: 0.3,
          decayRate: 0.98
        },
        contextualAdaptations: {
          culturalFactors: { 
            'latam': 1.3, 
            'us': 1.0, 
            'europe': 1.1,
            'latam_traditional': 1.5,
            'latam_modern': 1.2
          },
          conversationStageWeights: { 'early': 1.4, 'mid': 1.1, 'late': 0.7 },
          timeOfDayFactors: { 'morning': 1.1, 'afternoon': 1.0, 'evening': 0.9 },
          regionSpecificParams: {
            'latam': {
              relationshipWeight: 0.3,
              formalityBonus: 0.2,
              timeFlexibility: 1.5
            }
          }
        }
      },
      
      'budget_optimization': {
        algorithm: 'beta_bernoulli',
        betaBernoulli: {
          priorAlpha: 2,
          priorBeta: 1,
          successThreshold: 0.8 // Higher threshold for budget qualification
        },
        samplingConfig: {
          confidenceThreshold: 0.85,
          uncertaintyPenalty: 0.25,
          diversificationBonus: 0.05,
          temperatureSchedule: 'constant',
          initialTemperature: 0.8
        },
        contextualAdaptations: {
          culturalFactors: { 
            'latam': 1.1, // Slightly more cautious for LATAM budget discussions
            'us': 1.0, 
            'europe': 1.05 
          },
          conversationStageWeights: { 
            'early': 0.8, // Less aggressive budget probing early
            'mid': 1.2, 
            'late': 1.5 
          }
        }
      }
    };
  }

  // Private helper methods

  private parseThompsonSamplingConfig(variant: ExperimentVariant): ThompsonSamplingConfig {
    const learningConfig = variant.learningConfig as any;
    
    // Extract Thompson sampling configuration from variant
    if (learningConfig?.thompsonSampling) {
      return learningConfig.thompsonSampling;
    }
    
    // Return default configuration based on policy type
    const configs = this.generateThompsonSamplingConfigurations();
    
    switch (variant.policyType) {
      case 'cultural_adapted':
        return configs.contextual_cultural;
      case 'budget_focused':
        return configs.budget_optimization;
      default:
        return configs.conservative_beta_bernoulli;
    }
  }

  private async updateBeliefs(
    experimentId: string, 
    variantId: string, 
    config: ThompsonSamplingConfig
  ): Promise<void> {
    // Get recent shadow decisions and metrics for belief updates
    const recentDecisions = await storage.getShadowDecisions(undefined, experimentId);
    const variantDecisions = recentDecisions
      .filter(d => d.variantId === variantId)
      .slice(-50); // Consider last 50 decisions
    
    for (const decision of variantDecisions) {
      const metrics = await storage.getShadowMetrics(decision.id);
      if (metrics && decision.shadowPolicyDecision) {
        const actionId = (decision.shadowPolicyDecision as any).actionId;
        const reward = metrics.shadowQualificationScore || 0;
        
        await this.updateActionReward(
          experimentId,
          variantId,
          actionId,
          reward,
          decision.shadowContext as Record<string, any>
        );
      }
    }
  }

  private async enrichCandidatesWithBeliefs(
    candidates: ActionCandidate[],
    config: ThompsonSamplingConfig,
    context: Record<string, any>
  ): Promise<ActionCandidate[]> {
    return candidates.map(candidate => {
      const beliefKey = `${candidate.actionId}`;
      const belief = this.beliefStates.get(beliefKey);
      
      if (belief) {
        // Add posterior statistics to candidate
        candidate.posteriorMean = belief.mean || belief.successRate || 0.5;
        candidate.posteriorVariance = belief.variance || 0.1;
        candidate.confidenceInterval = this.calculateConfidenceInterval(belief);
      } else {
        // Use prior beliefs for new actions
        candidate.posteriorMean = 0.5;
        candidate.posteriorVariance = 0.25;
        candidate.confidenceInterval = { lower: 0.1, upper: 0.9 };
      }
      
      return candidate;
    });
  }

  private performThompsonSampling(
    candidates: ActionCandidate[],
    config: ThompsonSamplingConfig,
    context: Record<string, any>
  ): ActionCandidate {
    // Sample from posterior distributions
    candidates.forEach(candidate => {
      switch (config.algorithm) {
        case 'beta_bernoulli':
          candidate.sampledValue = this.sampleBetaDistribution(candidate);
          break;
        case 'gaussian':
          candidate.sampledValue = this.sampleGaussianDistribution(candidate);
          break;
        case 'contextual_bandits':
          candidate.sampledValue = this.sampleContextualBandit(candidate, context, config);
          break;
      }
    });
    
    // Apply cultural and contextual adjustments
    this.applyContextualAdjustments(candidates, config, context);
    
    // Select action with highest sampled value
    return candidates.reduce((best, current) => 
      (current.sampledValue || 0) > (best.sampledValue || 0) ? current : best
    );
  }

  private initializeBelief(actionId: string, config: ThompsonSamplingConfig): BeliefState {
    const belief: BeliefState = {
      actionId,
      sampleCount: 0,
      lastUpdated: new Date(),
      confidenceLevel: 0.5,
      explorationBonus: 0.1
    };

    switch (config.algorithm) {
      case 'beta_bernoulli':
        belief.alpha = config.betaBernoulli?.priorAlpha || 1;
        belief.beta = config.betaBernoulli?.priorBeta || 1;
        belief.successRate = belief.alpha / (belief.alpha + belief.beta);
        break;
        
      case 'gaussian':
        belief.mean = config.gaussian?.priorMean || 0.5;
        belief.variance = config.gaussian?.priorVariance || 0.25;
        belief.precision = 1 / belief.variance;
        break;
        
      case 'contextual_bandits':
        const dim = config.contextualBandits?.featureDimension || 5;
        belief.featureWeights = new Array(dim).fill(0);
        belief.covarianceMatrix = this.createIdentityMatrix(dim);
        break;
    }

    return belief;
  }

  private updateBetaBernoulliBeliefs(
    belief: BeliefState,
    reward: number,
    config: ThompsonSamplingConfig
  ): BeliefState {
    const threshold = config.betaBernoulli?.successThreshold || 0.7;
    const success = reward >= threshold ? 1 : 0;
    
    belief.alpha = (belief.alpha || 1) + success;
    belief.beta = (belief.beta || 1) + (1 - success);
    belief.successRate = belief.alpha / (belief.alpha + belief.beta);
    
    return belief;
  }

  private updateGaussianBeliefs(
    belief: BeliefState,
    reward: number,
    config: ThompsonSamplingConfig
  ): BeliefState {
    const noiseVariance = config.gaussian?.noiseVariance || 0.1;
    const currentPrecision = belief.precision || 1;
    const currentMean = belief.mean || 0.5;
    
    // Bayesian update
    const newPrecision = currentPrecision + (1 / noiseVariance);
    const newMean = (currentPrecision * currentMean + reward / noiseVariance) / newPrecision;
    
    belief.mean = newMean;
    belief.precision = newPrecision;
    belief.variance = 1 / newPrecision;
    
    return belief;
  }

  private updateContextualBanditBeliefs(
    belief: BeliefState,
    reward: number,
    context: Record<string, any>,
    config: ThompsonSamplingConfig
  ): BeliefState {
    // Extract context features
    const features = this.extractContextFeatures(context, config);
    
    // Update using linear regression with regularization
    // Simplified implementation - would use proper matrix operations in production
    const learningRate = 0.1;
    const regularization = config.contextualBandits?.regularizationParam || 0.1;
    
    if (belief.featureWeights) {
      const prediction = features.reduce((sum, feature, i) => 
        sum + feature * (belief.featureWeights![i] || 0), 0
      );
      const error = reward - prediction;
      
      // Update weights
      belief.featureWeights = belief.featureWeights.map((weight, i) => 
        weight + learningRate * error * features[i] - regularization * weight
      );
    }
    
    return belief;
  }

  private sampleBetaDistribution(candidate: ActionCandidate): number {
    // Simple Beta distribution sampling using transformed normal approximation
    const alpha = 1; // Would get from belief state
    const beta = 1;
    
    // For simplicity, use mean + random variation
    const mean = alpha / (alpha + beta);
    const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
    
    return Math.max(0, Math.min(1, mean + (Math.random() - 0.5) * Math.sqrt(variance) * 2));
  }

  private sampleGaussianDistribution(candidate: ActionCandidate): number {
    const mean = candidate.posteriorMean || 0.5;
    const variance = candidate.posteriorVariance || 0.1;
    
    // Box-Muller transform for normal distribution
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    
    return mean + Math.sqrt(variance) * z;
  }

  private sampleContextualBandit(
    candidate: ActionCandidate,
    context: Record<string, any>,
    config: ThompsonSamplingConfig
  ): number {
    // Extract features and compute confidence-based sampling
    const features = Object.values(candidate.contextFeatures);
    const uncertainty = candidate.uncertainty || 0.1;
    const confidenceWidth = config.contextualBandits?.confidenceWidth || 2.0;
    
    const basePrediction = features.reduce((sum, f) => sum + f, 0) / features.length;
    const confidenceBonus = confidenceWidth * Math.sqrt(uncertainty);
    
    return basePrediction + (Math.random() - 0.5) * confidenceBonus;
  }

  private applyContextualAdjustments(
    candidates: ActionCandidate[],
    config: ThompsonSamplingConfig,
    context: Record<string, any>
  ): void {
    const culturalContext = context.culturalContext || 'us';
    const conversationStage = context.conversationStage || 'mid';
    
    candidates.forEach(candidate => {
      // Apply cultural factor
      const culturalFactor = config.contextualAdaptations.culturalFactors[culturalContext] || 1.0;
      
      // Apply conversation stage weight
      const stageWeight = config.contextualAdaptations.conversationStageWeights[conversationStage] || 1.0;
      
      // Apply temperature
      const temperature = this.getCurrentTemperature(config);
      
      candidate.sampledValue = (candidate.sampledValue || 0) * culturalFactor * stageWeight / temperature;
    });
  }

  private getCurrentTemperature(config: ThompsonSamplingConfig): number {
    // Simplified temperature calculation
    switch (config.samplingConfig.temperatureSchedule) {
      case 'constant':
        return config.samplingConfig.initialTemperature || 1.0;
      case 'linear_decay':
      case 'exponential_decay':
        // Would implement proper decay based on time/samples
        return Math.max(
          config.samplingConfig.minTemperature || 0.1,
          (config.samplingConfig.initialTemperature || 1.0) * 0.95
        );
      default:
        return 1.0;
    }
  }

  private calculateConfidenceInterval(belief: BeliefState): { lower: number; upper: number } {
    if (belief.alpha && belief.beta) {
      // Beta distribution confidence interval (approximation)
      const mean = belief.alpha / (belief.alpha + belief.beta);
      const variance = (belief.alpha * belief.beta) / 
        ((belief.alpha + belief.beta) ** 2 * (belief.alpha + belief.beta + 1));
      const stdError = Math.sqrt(variance);
      
      return {
        lower: Math.max(0, mean - 1.96 * stdError),
        upper: Math.min(1, mean + 1.96 * stdError)
      };
    } else if (belief.mean !== undefined && belief.variance !== undefined) {
      // Gaussian confidence interval
      const stdError = Math.sqrt(belief.variance);
      return {
        lower: belief.mean - 1.96 * stdError,
        upper: belief.mean + 1.96 * stdError
      };
    }
    
    return { lower: 0.1, upper: 0.9 };
  }

  private calculateSamplingMetadata(
    candidates: ActionCandidate[],
    config: ThompsonSamplingConfig
  ) {
    const uncertainties = candidates.map(c => c.uncertainty || 0);
    const sampledValues = candidates.map(c => c.sampledValue || 0);
    
    const avgUncertainty = uncertainties.reduce((sum, u) => sum + u, 0) / uncertainties.length;
    const maxSampled = Math.max(...sampledValues);
    const avgSampled = sampledValues.reduce((sum, v) => sum + v, 0) / sampledValues.length;
    
    return {
      algorithm: config.algorithm,
      temperature: this.getCurrentTemperature(config),
      explorationRate: avgUncertainty,
      confidenceLevel: 1 - avgUncertainty,
      diversityScore: this.calculateDiversityScore(sampledValues)
    };
  }

  private extractContextualFactors(context: Record<string, any>) {
    return {
      conversationStage: context.conversationStage || 'mid',
      culturalContext: context.culturalContext || {},
      timeContext: context.timeContext || 'business_hours',
      urgencyLevel: context.urgencyLevel || 0.5
    };
  }

  private calculateRegretBounds(history: SamplingResult[]): { lower: number; upper: number } {
    // Simplified regret bound calculation
    const sampleSize = history.length;
    if (sampleSize === 0) return { lower: 0, upper: 0 };
    
    const confidence = 0.95;
    const bound = Math.sqrt(2 * Math.log(1 / (1 - confidence)) / sampleSize);
    
    return {
      lower: -bound * sampleSize,
      upper: bound * sampleSize
    };
  }

  private analyzeConvergence(
    experimentId: string,
    variantId: string,
    history: SamplingResult[]
  ) {
    const beliefs = Array.from(this.beliefStates.values())
      .filter(b => b.actionId.startsWith(`${experimentId}_${variantId}_`));
    
    // Calculate belief stability (how much beliefs are changing)
    const beliefStability = beliefs.length > 0 ? 
      beliefs.reduce((sum, b) => sum + (b.confidenceLevel || 0), 0) / beliefs.length : 0;
    
    // Calculate action distribution
    const actionCounts: Record<string, number> = {};
    history.forEach(result => {
      const actionId = result.selectedAction.actionId;
      actionCounts[actionId] = (actionCounts[actionId] || 0) + 1;
    });
    
    const actionDistribution: Record<string, number> = {};
    Object.entries(actionCounts).forEach(([action, count]) => {
      actionDistribution[action] = count / history.length;
    });
    
    // Calculate uncertainty reduction over time
    const uncertaintyReduction = history.length > 10 ? 
      (history[0].samplingMetadata.explorationRate - 
       history[history.length - 1].samplingMetadata.explorationRate) : 0;
    
    return {
      beliefStability,
      actionDistribution,
      uncertaintyReduction
    };
  }

  private analyzeCulturalAdaptation(history: SamplingResult[]): Record<string, number> {
    const culturalResults: Record<string, { total: number; count: number }> = {};
    
    history.forEach(result => {
      Object.entries(result.contextualFactors.culturalContext).forEach(([culture, value]) => {
        if (!culturalResults[culture]) {
          culturalResults[culture] = { total: 0, count: 0 };
        }
        culturalResults[culture].total += value as number;
        culturalResults[culture].count += 1;
      });
    });
    
    const effectiveness: Record<string, number> = {};
    Object.entries(culturalResults).forEach(([culture, data]) => {
      effectiveness[culture] = data.count > 0 ? data.total / data.count : 0;
    });
    
    return effectiveness;
  }

  private generateThompsonSamplingRecommendations(params: {
    explorationRate: number;
    convergenceMetrics: any;
    culturalAdaptationEffectiveness: Record<string, number>;
    sampleSize: number;
  }): string[] {
    const recommendations: string[] = [];
    
    if (params.explorationRate > 0.7) {
      recommendations.push('High exploration rate - consider reducing temperature or increasing confidence threshold');
    } else if (params.explorationRate < 0.2) {
      recommendations.push('Low exploration rate - may be missing better policies, consider increasing exploration');
    }
    
    if (params.convergenceMetrics.beliefStability < 0.6) {
      recommendations.push('Beliefs are not stabilizing - may need more samples or adjusted learning rate');
    }
    
    if (params.sampleSize < 100) {
      recommendations.push('Small sample size - collect more data before making policy decisions');
    }
    
    const avgCulturalEffectiveness = Object.values(params.culturalAdaptationEffectiveness)
      .reduce((sum, eff) => sum + eff, 0) / Object.keys(params.culturalAdaptationEffectiveness).length;
    
    if (avgCulturalEffectiveness < 0.6) {
      recommendations.push('Cultural adaptation effectiveness is low - review cultural parameters');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('Thompson sampling performance appears optimal');
    }
    
    return recommendations;
  }

  // Utility methods

  private extractContextFeatures(context: Record<string, any>, config: ThompsonSamplingConfig): number[] {
    const dim = config.contextualBandits?.featureDimension || 5;
    const features = new Array(dim).fill(0);
    
    // Extract and normalize context features
    const culturalScore = context.culturalAlignment || 0.5;
    const stageScore = context.conversationStage === 'early' ? 1 : 
                     context.conversationStage === 'mid' ? 0.5 : 0;
    const urgencyScore = context.urgencyLevel || 0.5;
    
    features[0] = culturalScore;
    features[1] = stageScore;
    features[2] = urgencyScore;
    features[3] = context.engagementScore || 0.5;
    features[4] = context.timeContext === 'business_hours' ? 1 : 0.5;
    
    return features;
  }

  private createIdentityMatrix(size: number): number[][] {
    const matrix = Array(size).fill(null).map(() => Array(size).fill(0));
    for (let i = 0; i < size; i++) {
      matrix[i][i] = 1;
    }
    return matrix;
  }

  private calculateDiversityScore(values: number[]): number {
    if (values.length <= 1) return 0;
    
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    
    return Math.sqrt(variance);
  }

  private async recordSamplingResult(
    experimentId: string,
    variantId: string,
    conversationId: string,
    result: SamplingResult
  ): Promise<void> {
    const key = `${experimentId}_${variantId}`;
    if (!this.samplingHistory.has(key)) {
      this.samplingHistory.set(key, []);
    }
    
    const history = this.samplingHistory.get(key)!;
    history.push(result);
    
    // Keep only recent history to prevent memory issues
    if (history.length > 1000) {
      history.splice(0, history.length - 1000);
    }
  }

  private async persistBeliefs(experimentId: string, variantId: string): Promise<void> {
    // In production, would persist beliefs to database
    // For now, just log for debugging
    console.log(`Persisting beliefs for experiment ${experimentId}, variant ${variantId}`);
  }
}

export const thompsonSamplingService = new ThompsonSamplingService();