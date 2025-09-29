import type { LearningState, ConversationMetrics, DecisionTrace } from "@shared/schema";
import { storage } from "../storage";

export interface LearningUpdate {
  metricName: string;
  currentValue: number;
  observedOutcome: number; // -1 to 1
  conversationId: string;
}

export interface PatternDetection {
  pattern: string;
  confidence: number;
  characteristics: string[];
  recommendations: string[];
}

export class LearningService {
  private baseLearningRate = 0.3;
  private baseExplorationRate = 0.3;
  private decayFactor = 0.95;

  async updateMetric(update: LearningUpdate): Promise<LearningState> {
    const { metricName, currentValue, observedOutcome, conversationId } = update;
    
    // Get existing learning state
    let learningState = await storage.getLearningState(conversationId, metricName);
    
    if (!learningState) {
      // Create new learning state
      learningState = await storage.saveLearningState({
        conversationId,
        metricName,
        currentValue,
        confidence: 0.5,
        learningRate: this.baseLearningRate,
        explorationRate: this.baseExplorationRate,
        updateCount: 0,
        pattern: null,
        patternConfidence: 0
      });
    }

    // Calculate adaptive learning rate
    const effectiveLearningRate = this.calculateAdaptiveLearningRate(
      learningState.updateCount || 0,
      learningState.confidence || 0.5
    );

    // Calculate prediction error
    const predictionError = observedOutcome - currentValue;
    
    // Update value using weighted average
    const delta = effectiveLearningRate * predictionError;
    const newValue = Math.max(0, Math.min(1, currentValue + delta));
    
    // Update confidence based on prediction accuracy
    const accuracy = 1 - Math.abs(predictionError);
    const confidenceDelta = 0.1 * (accuracy - 0.5); // Increase confidence if accurate, decrease if not
    const newConfidence = Math.max(0.1, Math.min(0.95, (learningState.confidence || 0.5) + confidenceDelta));
    
    // Calculate new exploration rate
    const newExplorationRate = this.calculateExplorationRate(
      learningState.updateCount || 0,
      newConfidence
    );

    // Update learning state
    const updatedState = await storage.saveLearningState({
      conversationId,
      metricName,
      currentValue: newValue,
      confidence: newConfidence,
      learningRate: effectiveLearningRate,
      explorationRate: newExplorationRate,
      updateCount: (learningState.updateCount || 0) + 1,
      pattern: learningState.pattern,
      patternConfidence: learningState.patternConfidence
    });

    return updatedState;
  }

  private calculateAdaptiveLearningRate(updateCount: number, confidence: number): number {
    // Decrease learning rate over time (experience)
    const timeFactor = Math.pow(this.decayFactor, updateCount / 10);
    
    // Increase learning rate when confidence is low (uncertainty)
    const confidenceFactor = 1 + (1 - confidence);
    
    return Math.max(0.05, Math.min(0.5, this.baseLearningRate * timeFactor * confidenceFactor));
  }

  private calculateExplorationRate(updateCount: number, confidence: number): number {
    // Thompson sampling-inspired approach
    const baseFactor = Math.pow(this.decayFactor, updateCount / 5);
    const confidenceFactor = 1 - confidence;
    
    return Math.max(0.05, Math.min(0.4, this.baseExplorationRate * baseFactor * (1 + confidenceFactor)));
  }

  async detectConversationPattern(conversationId: string): Promise<PatternDetection> {
    // Get latest metrics
    const metrics = await storage.getLatestMetrics(conversationId);
    const decisions = await storage.getDecisionTraces(conversationId, 10);
    
    if (!metrics) {
      return {
        pattern: 'unknown',
        confidence: 0,
        characteristics: [],
        recommendations: []
      };
    }

    const patterns = this.analyzePatterns(metrics, decisions);
    return this.selectBestPattern(patterns);
  }

  private analyzePatterns(metrics: ConversationMetrics, decisions: DecisionTrace[]): PatternDetection[] {
    const patterns: PatternDetection[] = [];

    // Quick Qualifier Pattern
    if ((metrics.engagementScore || 0) > 0.7 && 
        (metrics.budgetSignalStrength || 0) > 0.4 && 
        (metrics.authorityScore || 0) > 0.6) {
      patterns.push({
        pattern: 'quick_qualifier',
        confidence: 0.8,
        characteristics: [
          'High engagement from start',
          'Early budget discussion',
          'Clear decision authority',
          'Direct communication style'
        ],
        recommendations: [
          'Move quickly to proposal phase',
          'Focus on value proposition',
          'Provide detailed pricing options',
          'Schedule follow-up meeting soon'
        ]
      });
    }

    // Technical Explorer Pattern
    if ((metrics.technicalScore || 0) > 0.7 && 
        (metrics.questionRatio || 0) > 0.3 && 
        (metrics.budgetSignalStrength || 0) < 0.3) {
      patterns.push({
        pattern: 'tech_explorer',
        confidence: 0.75,
        characteristics: [
          'High technical sophistication',
          'Many detailed questions',
          'Slow budget progression',
          'Focus on implementation details'
        ],
        recommendations: [
          'Provide technical deep-dives',
          'Share architecture diagrams',
          'Introduce technical team members',
          'Gradually introduce commercial aspects'
        ]
      });
    }

    // Relationship Builder Pattern
    if ((metrics.culturalScore || 0) > 0.6 && 
        (metrics.trustLevel || 0) > 0.6 && 
        (metrics.messageDepthRatio || 0) > 1.0) {
      patterns.push({
        pattern: 'relationship_builder',
        confidence: 0.7,
        characteristics: [
          'Values relationship building',
          'Detailed, personal communication',
          'Cultural sensitivity important',
          'Trust-first approach'
        ],
        recommendations: [
          'Invest time in relationship building',
          'Share team credentials and experience',
          'Provide client references',
          'Respect cultural communication norms'
        ]
      });
    }

    // Price Shopper Pattern
    if ((metrics.budgetSignalStrength || 0) > 0.6 && 
        (metrics.qualificationScore || 0) < 0.4 && 
        decisions.some(d => d.action.includes('budget') || d.action.includes('price'))) {
      patterns.push({
        pattern: 'price_shopper',
        confidence: 0.6,
        characteristics: [
          'Early price focus',
          'Low overall qualification',
          'Limited technical discussion',
          'Comparison shopping behavior'
        ],
        recommendations: [
          'Emphasize value over price',
          'Qualify budget range early',
          'Focus on ROI and business impact',
          'Consider if worth pursuing'
        ]
      });
    }

    // Time Waster Pattern
    if ((metrics.engagementScore || 0) < 0.3 || 
        (metrics.conversationHealthScore || 0) < 0.4 ||
        (metrics.messageCount || 0) > 20 && (metrics.qualificationScore || 0) < 0.3) {
      patterns.push({
        pattern: 'time_waster',
        confidence: 0.5,
        characteristics: [
          'Low engagement',
          'Poor conversation flow',
          'No progress on qualification',
          'Excessive messages without advancement'
        ],
        recommendations: [
          'Set clear next steps',
          'Qualify interest level',
          'Consider conversation timeout',
          'Focus on other prospects'
        ]
      });
    }

    return patterns;
  }

  private selectBestPattern(patterns: PatternDetection[]): PatternDetection {
    if (patterns.length === 0) {
      return {
        pattern: 'exploring',
        confidence: 0.3,
        characteristics: ['Insufficient data for pattern detection'],
        recommendations: ['Continue gathering information']
      };
    }

    // Return pattern with highest confidence
    return patterns.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );
  }

  async calculateUtilityScore(
    action: string,
    currentState: ConversationMetrics,
    explorationBonus: number = 0
  ): Promise<number> {
    // Multi-objective utility function
    const weights = {
      informationGain: 0.3,
      engagementMaintenance: 0.2,
      qualificationProgress: 0.3,
      trustBuilding: 0.2
    };

    // Information gain potential
    const informationGain = this.calculateInformationGain(action, currentState);
    
    // Engagement impact (negative if likely to reduce engagement)
    const engagementImpact = this.calculateEngagementImpact(action, currentState);
    
    // Qualification progression value
    const qualificationValue = this.calculateQualificationValue(action, currentState);
    
    // Trust building potential
    const trustImpact = this.calculateTrustImpact(action, currentState);

    const baseUtility = 
      weights.informationGain * informationGain +
      weights.engagementMaintenance * engagementImpact +
      weights.qualificationProgress * qualificationValue +
      weights.trustBuilding * trustImpact;

    // Add exploration bonus
    const totalUtility = baseUtility + explorationBonus;

    // Apply penalties
    const penalizedUtility = this.applyPenalties(totalUtility, action, currentState);

    return Math.max(0, Math.min(1, penalizedUtility));
  }

  private calculateInformationGain(action: string, state: ConversationMetrics): number {
    // Higher gain for exploring unknown areas
    const gapWeights = {
      budget: 1 - (state.budgetSignalStrength || 0),
      authority: 1 - (state.authorityScore || 0),
      need: 1 - (state.needIntensity || 0),
      technical: 1 - (state.technicalScore || 0),
      timeline: 1 - (state.timelineUrgency || 0)
    };

    // Map actions to dimensions they explore
    const actionMappings: Record<string, keyof typeof gapWeights> = {
      'ask_budget_range': 'budget',
      'explore_authority': 'authority',
      'understand_needs': 'need',
      'technical_requirements': 'technical',
      'timeline_discussion': 'timeline'
    };

    const dimension = actionMappings[action];
    return dimension ? gapWeights[dimension] : 0.3;
  }

  private calculateEngagementImpact(action: string, state: ConversationMetrics): number {
    const currentEngagement = state.engagementScore || 0;
    const frustration = state.frustrationLevel || 0;
    
    // Budget questions can be sensitive if engagement is low
    if (action.includes('budget') && currentEngagement < 0.5) {
      return 0.3;
    }
    
    // Technical questions are good for high-tech prospects
    if (action.includes('technical') && (state.technicalScore || 0) > 0.6) {
      return 0.8;
    }
    
    // Avoid complex questions if frustration is high
    if (frustration > 0.7) {
      return action.includes('clarify') ? 0.8 : 0.4;
    }
    
    return 0.6; // Default neutral impact
  }

  private calculateQualificationValue(action: string, state: ConversationMetrics): number {
    const messageCount = state.messageCount || 0;
    
    // Higher value for qualification-advancing questions later in conversation
    if (messageCount > 10) {
      if (action.includes('budget') || action.includes('authority') || action.includes('timeline')) {
        return 0.8;
      }
    }
    
    // Need assessment is always valuable
    if (action.includes('need') || action.includes('pain')) {
      return 0.7;
    }
    
    return 0.4;
  }

  private calculateTrustImpact(action: string, state: ConversationMetrics): number {
    const currentTrust = state.trustLevel || 0;
    const formalityIndex = state.formalityIndex || 0.5;
    
    // Relationship-building questions are good for formal cultures
    if (action.includes('relationship') || action.includes('team')) {
      return formalityIndex > 0.6 ? 0.8 : 0.5;
    }
    
    // Avoid pushing too hard if trust is low
    if (currentTrust < 0.4 && action.includes('close')) {
      return 0.2;
    }
    
    return 0.5;
  }

  private applyPenalties(utility: number, action: string, state: ConversationMetrics): number {
    let penalizedUtility = utility;
    
    // Fatigue penalty for long conversations
    const messageCount = state.messageCount || 0;
    if (messageCount > 20) {
      penalizedUtility *= 0.8;
    }
    
    // Frustration penalty
    const frustration = state.frustrationLevel || 0;
    if (frustration > 0.5) {
      penalizedUtility *= (1 - frustration * 0.5);
    }
    
    // Repetition penalty (would need conversation history)
    // This would check if similar questions were asked recently
    
    return penalizedUtility;
  }

  async getExplorationRate(conversationId: string): Promise<number> {
    const allStates = await storage.getAllLearningStates(conversationId);
    
    if (allStates.length === 0) {
      return this.baseExplorationRate;
    }
    
    // Calculate average exploration rate across all metrics
    const avgExploration = allStates.reduce((sum, state) => 
      sum + (state.explorationRate || this.baseExplorationRate), 0
    ) / allStates.length;
    
    return avgExploration;
  }

  async updatePatternConfidence(
    conversationId: string,
    pattern: string,
    outcome: number
  ): Promise<void> {
    // Update pattern confidence based on conversation outcomes
    const allStates = await storage.getAllLearningStates(conversationId);
    
    for (const state of allStates) {
      if (state.pattern === pattern) {
        const newConfidence = Math.max(0, Math.min(1, 
          (state.patternConfidence || 0.5) + 0.1 * outcome
        ));
        
        await storage.saveLearningState({
          conversationId: state.conversationId!,
          metricName: state.metricName,
          currentValue: state.currentValue || 0,
          confidence: state.confidence || 0.5,
          learningRate: state.learningRate || this.baseLearningRate,
          explorationRate: state.explorationRate || this.baseExplorationRate,
          updateCount: state.updateCount || 0,
          pattern: pattern,
          patternConfidence: newConfidence
        });
      }
    }
  }
}

export const learningService = new LearningService();
