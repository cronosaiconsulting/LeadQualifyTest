import type { 
  RegretAnalysis, InsertRegretAnalysis, ShadowDecision, ShadowMetrics,
  DecisionTrace, ConversationMetrics, Experiment, ExperimentVariant
} from "@shared/schema";
import { storage } from "../storage";
import { ipsEvaluationService } from "./ips";

export interface RegretMetrics {
  instantaneousRegret: number; // Immediate regret at decision time
  observedRegret?: number; // Regret based on actual outcomes (when available)
  cumulativeRegret: number; // Running total of regret
  normalizedRegret: number; // Regret normalized by expected value range
  
  // Confidence bounds
  regretLowerBound: number;
  regretUpperBound: number;
  confidenceLevel: number;
  
  // Context information
  decisionTimestamp: Date;
  conversationStage: string;
  confidenceScore: number;
}

export interface RegretAnalysisReport {
  experimentId: string;
  variantId: string;
  timeRange: { start: Date; end: Date };
  
  // Aggregate regret metrics
  totalRegret: number;
  averageRegret: number;
  medianRegret: number;
  regretStandardDeviation: number;
  
  // Regret bounds and statistical measures
  cumulativeRegretBounds: {
    lower: number;
    upper: number;
    confidenceLevel: number;
  };
  
  // Regret distribution analysis
  regretDistribution: {
    percentile10: number;
    percentile25: number;
    percentile75: number;
    percentile90: number;
    percentile95: number;
    percentile99: number;
  };
  
  // Time-series analysis
  regretOverTime: Array<{
    timestamp: Date;
    cumulativeRegret: number;
    instantaneousRegret: number;
    regretRate: number; // Regret per decision
  }>;
  
  // Breakdown by conversation characteristics
  regretByStage: Record<string, {
    averageRegret: number;
    sampleSize: number;
    significance: number;
  }>;
  
  regretByContext: Record<string, {
    averageRegret: number;
    sampleSize: number;
    culturalFactors?: Record<string, number>;
  }>;
  
  // Expected value analysis
  expectedValueAnalysis: {
    productionExpectedValue: number;
    shadowExpectedValue: number;
    potentialLift: number;
    liftSignificance: number;
  };
  
  // Recommendations
  assessment: {
    overallRegretLevel: 'low' | 'medium' | 'high';
    recommendedAction: string;
    keyInsights: string[];
    limitations: string[];
  };
}

export interface RegretComparisonResult {
  variantComparison: Array<{
    variantId: string;
    variantName: string;
    totalRegret: number;
    averageRegret: number;
    regretRank: number;
    isStatisticallyBetter: boolean;
    confidenceLevel: number;
  }>;
  
  bestVariant: {
    variantId: string;
    variantName: string;
    regretAdvantage: number;
    confidenceLevel: number;
  };
  
  worstVariant: {
    variantId: string;
    variantName: string;
    regretDisadvantage: number;
  };
}

export class RegretAnalysisService {
  /**
   * Calculate regret for a specific shadow decision
   */
  async calculateDecisionRegret(
    shadowDecisionId: string,
    productionDecisionValue?: number
  ): Promise<RegretMetrics> {
    const shadowDecision = await storage.getShadowDecision(shadowDecisionId);
    if (!shadowDecision) {
      throw new Error('Shadow decision not found');
    }

    const shadowMetrics = await storage.getShadowMetrics(shadowDecisionId);
    if (!shadowMetrics) {
      throw new Error('Shadow metrics not found');
    }

    // Get production decision for comparison
    const productionTrace = await this.getProductionDecisionTrace(
      shadowDecision.conversationId,
      shadowDecision.timestamp
    );

    const productionValue = productionDecisionValue || 
      (productionTrace ? await this.extractProductionValue(productionTrace) : 0);

    // Calculate instantaneous regret
    const shadowValue = shadowMetrics.shadowExpectedValue || 0;
    const instantaneousRegret = shadowValue - productionValue;

    // Get previous cumulative regret for this conversation
    const previousRegret = await this.getPreviousCumulativeRegret(
      shadowDecision.conversationId,
      shadowDecision.experimentId,
      shadowDecision.timestamp
    );

    const cumulativeRegret = previousRegret + instantaneousRegret;

    // Calculate normalized regret (relative to value range)
    const valueRange = await this.getExpectedValueRange(shadowDecision.experimentId);
    const normalizedRegret = valueRange > 0 ? instantaneousRegret / valueRange : 0;

    // Calculate confidence bounds
    const confidenceBounds = this.calculateRegretBounds(
      instantaneousRegret,
      shadowMetrics,
      productionTrace
    );

    // Get observed regret if outcome is available
    const observedRegret = await this.calculateObservedRegret(shadowDecision);

    return {
      instantaneousRegret,
      observedRegret,
      cumulativeRegret,
      normalizedRegret,
      regretLowerBound: confidenceBounds.lower,
      regretUpperBound: confidenceBounds.upper,
      confidenceLevel: 0.95,
      decisionTimestamp: new Date(shadowDecision.timestamp),
      conversationStage: shadowDecision.conversationStage || 'unknown',
      confidenceScore: shadowMetrics.confidenceScore || 0
    };
  }

  /**
   * Perform comprehensive regret analysis for an experiment variant
   */
  async analyzeExperimentRegret(
    experimentId: string,
    variantId: string,
    timeRange?: { start: Date; end: Date }
  ): Promise<RegretAnalysisReport> {
    // Get shadow decisions for the variant
    const shadowDecisions = await storage.getShadowDecisions(undefined, experimentId);
    const variantDecisions = shadowDecisions.filter(d => d.variantId === variantId);

    if (variantDecisions.length === 0) {
      throw new Error('No shadow decisions found for variant');
    }

    // Filter by time range if provided
    let filteredDecisions = variantDecisions;
    if (timeRange) {
      filteredDecisions = variantDecisions.filter(d => {
        const timestamp = new Date(d.timestamp);
        return timestamp >= timeRange.start && timestamp <= timeRange.end;
      });
    }

    const actualTimeRange = {
      start: new Date(Math.min(...filteredDecisions.map(d => new Date(d.timestamp).getTime()))),
      end: new Date(Math.max(...filteredDecisions.map(d => new Date(d.timestamp).getTime())))
    };

    // Calculate regret for each decision
    const regretMetrics = await Promise.all(
      filteredDecisions.map(decision => this.calculateDecisionRegret(decision.id))
    );

    // Aggregate regret statistics
    const instantaneousRegrets = regretMetrics.map(r => r.instantaneousRegret);
    const totalRegret = instantaneousRegrets.reduce((sum, r) => sum + r, 0);
    const averageRegret = totalRegret / instantaneousRegrets.length;
    const medianRegret = this.calculateMedian(instantaneousRegrets);
    const regretStandardDeviation = this.calculateStandardDeviation(instantaneousRegrets);

    // Calculate cumulative regret bounds
    const cumulativeRegretBounds = this.calculateCumulativeRegretBounds(regretMetrics);

    // Calculate regret distribution
    const regretDistribution = this.calculateRegretDistribution(instantaneousRegrets);

    // Generate time series analysis
    const regretOverTime = this.generateRegretTimeSeries(regretMetrics);

    // Analyze regret by conversation stage
    const regretByStage = this.analyzeRegretByStage(regretMetrics);

    // Analyze regret by context
    const regretByContext = await this.analyzeRegretByContext(filteredDecisions, regretMetrics);

    // Expected value analysis
    const expectedValueAnalysis = await this.analyzeExpectedValueLift(
      experimentId,
      variantId,
      filteredDecisions
    );

    // Generate assessment and recommendations
    const assessment = this.generateRegretAssessment({
      totalRegret,
      averageRegret,
      regretStandardDeviation,
      expectedValueAnalysis,
      sampleSize: filteredDecisions.length
    });

    return {
      experimentId,
      variantId,
      timeRange: actualTimeRange,
      totalRegret,
      averageRegret,
      medianRegret,
      regretStandardDeviation,
      cumulativeRegretBounds,
      regretDistribution,
      regretOverTime,
      regretByStage,
      regretByContext,
      expectedValueAnalysis,
      assessment
    };
  }

  /**
   * Compare regret across multiple variants
   */
  async compareVariantRegret(
    experimentId: string,
    variantIds?: string[],
    timeRange?: { start: Date; end: Date }
  ): Promise<RegretComparisonResult> {
    // Get all variants if not specified
    let targetVariants = variantIds;
    if (!targetVariants) {
      const allVariants = await storage.getExperimentVariants(experimentId);
      targetVariants = allVariants.map(v => v.id);
    }

    // Analyze each variant
    const variantAnalyses = await Promise.all(
      targetVariants.map(async (variantId) => {
        try {
          const analysis = await this.analyzeExperimentRegret(experimentId, variantId, timeRange);
          const variant = await storage.getExperimentVariant(variantId);
          return {
            variantId,
            variantName: variant?.name || 'Unknown',
            analysis
          };
        } catch (error) {
          console.error(`Failed to analyze variant ${variantId}:`, error);
          return null;
        }
      })
    );

    const validAnalyses = variantAnalyses.filter(a => a !== null);

    if (validAnalyses.length === 0) {
      throw new Error('No valid variant analyses available');
    }

    // Sort by average regret (lower is better)
    const sortedVariants = validAnalyses.sort((a, b) => a!.analysis.averageRegret - b!.analysis.averageRegret);

    // Calculate statistical significance between variants
    const variantComparison = await Promise.all(
      sortedVariants.map(async (variant, index) => {
        const isStatisticallyBetter = index > 0 ? 
          await this.testStatisticalSignificance(
            sortedVariants[0]!.analysis,
            variant!.analysis
          ) : true;

        return {
          variantId: variant!.variantId,
          variantName: variant!.variantName,
          totalRegret: variant!.analysis.totalRegret,
          averageRegret: variant!.analysis.averageRegret,
          regretRank: index + 1,
          isStatisticallyBetter,
          confidenceLevel: 0.95
        };
      })
    );

    const bestVariant = sortedVariants[0]!;
    const worstVariant = sortedVariants[sortedVariants.length - 1]!;

    return {
      variantComparison,
      bestVariant: {
        variantId: bestVariant.variantId,
        variantName: bestVariant.variantName,
        regretAdvantage: worstVariant.analysis.averageRegret - bestVariant.analysis.averageRegret,
        confidenceLevel: 0.95
      },
      worstVariant: {
        variantId: worstVariant.variantId,
        variantName: worstVariant.variantName,
        regretDisadvantage: worstVariant.analysis.averageRegret - bestVariant.analysis.averageRegret
      }
    };
  }

  /**
   * Calculate regret bounds for early stopping decisions
   */
  async calculateRegretBounds(
    experimentId: string,
    variantId: string,
    confidenceLevel: number = 0.95,
    timeHorizon?: number
  ): Promise<{
    lowerBound: number;
    upperBound: number;
    currentRegret: number;
    projectedRegret: number;
    stopRecommendation: 'continue' | 'stop_winning' | 'stop_losing';
  }> {
    const analysis = await this.analyzeExperimentRegret(experimentId, variantId);
    
    // Calculate concentration bounds (using Hoeffding's inequality)
    const n = analysis.regretOverTime.length;
    const alpha = 1 - confidenceLevel;
    const hoeffdingBound = Math.sqrt(-Math.log(alpha / 2) / (2 * n));
    
    const currentRegret = analysis.totalRegret;
    const averageRegret = analysis.averageRegret;
    
    const lowerBound = currentRegret - (hoeffdingBound * n * analysis.regretStandardDeviation);
    const upperBound = currentRegret + (hoeffdingBound * n * analysis.regretStandardDeviation);
    
    // Project future regret if time horizon is specified
    let projectedRegret = currentRegret;
    if (timeHorizon && timeHorizon > n) {
      const remainingDecisions = timeHorizon - n;
      projectedRegret = currentRegret + (remainingDecisions * averageRegret);
    }
    
    // Determine stopping recommendation
    let stopRecommendation: 'continue' | 'stop_winning' | 'stop_losing' = 'continue';
    
    if (upperBound < -1000) { // Significant positive regret (shadow is much better)
      stopRecommendation = 'stop_winning';
    } else if (lowerBound > 1000) { // Significant negative regret (shadow is much worse)
      stopRecommendation = 'stop_losing';
    }
    
    return {
      lowerBound,
      upperBound,
      currentRegret,
      projectedRegret,
      stopRecommendation
    };
  }

  /**
   * Save regret analysis to storage
   */
  async saveRegretAnalysis(
    conversationId: string,
    experimentId: string,
    variantId: string,
    regretMetrics: RegretMetrics
  ): Promise<RegretAnalysis> {
    const regretData: InsertRegretAnalysis = {
      conversationId,
      experimentId,
      variantId,
      
      instantaneousRegret: regretMetrics.instantaneousRegret,
      cumulativeRegret: regretMetrics.cumulativeRegret,
      normalizedRegret: regretMetrics.normalizedRegret,
      observedRegret: regretMetrics.observedRegret,
      
      regretLowerBound: regretMetrics.regretLowerBound,
      regretUpperBound: regretMetrics.regretUpperBound,
      confidenceLevel: regretMetrics.confidenceLevel,
      
      decisionTimestamp: regretMetrics.decisionTimestamp,
      conversationStage: regretMetrics.conversationStage,
      confidenceScore: regretMetrics.confidenceScore,
      
      timestamp: new Date(),
      
      metadata: {
        analysisVersion: '1.0.0',
        calculationMethod: 'instantaneous_regret',
        culturalContext: {} // Would be populated with actual cultural context
      }
    };

    return await storage.saveRegretAnalysis(regretData);
  }

  // Private helper methods

  private async getProductionDecisionTrace(
    conversationId: string,
    timestamp: Date
  ): Promise<DecisionTrace | undefined> {
    // Get decision traces around the timestamp
    // This is a simplified version - in practice would need more sophisticated matching
    const traces = await storage.getDecisionTraces(conversationId);
    
    // Find the closest production decision
    return traces.find(trace => {
      const traceTime = new Date(trace.timestamp);
      const timeDiff = Math.abs(traceTime.getTime() - timestamp.getTime());
      return timeDiff < 60000; // Within 1 minute
    });
  }

  private async extractProductionValue(trace: DecisionTrace): Promise<number> {
    // Extract expected value from production decision
    // This would parse the decision metadata to get the expected value
    const metadata = trace.metadata as any;
    return metadata?.expectedValue || metadata?.qualificationScore * 10000 || 0;
  }

  private async getPreviousCumulativeRegret(
    conversationId: string,
    experimentId: string,
    timestamp: Date
  ): Promise<number> {
    const previousAnalyses = await storage.getRegretAnalysis(conversationId, experimentId);
    
    // Find the most recent analysis before this timestamp
    const relevantAnalyses = previousAnalyses.filter(analysis =>
      new Date(analysis.timestamp) < timestamp
    );

    if (relevantAnalyses.length === 0) {
      return 0;
    }

    // Sort by timestamp and get the latest
    relevantAnalyses.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return relevantAnalyses[0].cumulativeRegret || 0;
  }

  private async getExpectedValueRange(experimentId: string): Promise<number> {
    // Get the expected value range for normalization
    // This would typically be based on historical data or experiment configuration
    return 20000; // Example: $20,000 range for consulting deals
  }

  private calculateRegretBounds(
    regret: number,
    shadowMetrics: ShadowMetrics,
    productionTrace?: DecisionTrace
  ): { lower: number; upper: number } {
    // Calculate confidence bounds based on uncertainty in both shadow and production estimates
    const shadowUncertainty = (shadowMetrics.confidenceScore || 0.5) * 1000; // Example calculation
    const productionUncertainty = productionTrace ? 500 : 1000; // Higher uncertainty if no production trace
    
    const totalUncertainty = Math.sqrt(shadowUncertainty * shadowUncertainty + productionUncertainty * productionUncertainty);
    
    return {
      lower: regret - 1.96 * totalUncertainty, // 95% confidence interval
      upper: regret + 1.96 * totalUncertainty
    };
  }

  private async calculateObservedRegret(shadowDecision: ShadowDecision): Promise<number | undefined> {
    // Calculate regret based on actual observed outcomes
    // This would require waiting for conversation outcomes to be available
    
    // For now, return undefined as observed outcomes may not be available yet
    return undefined;
  }

  private calculateMedian(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    return n % 2 === 0 ? (sorted[n/2 - 1] + sorted[n/2]) / 2 : sorted[Math.floor(n/2)];
  }

  private calculateStandardDeviation(values: number[]): number {
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  private calculateCumulativeRegretBounds(regretMetrics: RegretMetrics[]): {
    lower: number;
    upper: number;
    confidenceLevel: number;
  } {
    const cumulativeRegrets = regretMetrics.map(r => r.cumulativeRegret);
    const finalRegret = cumulativeRegrets[cumulativeRegrets.length - 1] || 0;
    
    // Simple bound calculation - in practice would use more sophisticated methods
    const regretVariance = this.calculateStandardDeviation(cumulativeRegrets.map(r => r - finalRegret));
    const bound = 1.96 * regretVariance * Math.sqrt(regretMetrics.length);
    
    return {
      lower: finalRegret - bound,
      upper: finalRegret + bound,
      confidenceLevel: 0.95
    };
  }

  private calculateRegretDistribution(regrets: number[]): {
    percentile10: number;
    percentile25: number;
    percentile75: number;
    percentile90: number;
    percentile95: number;
    percentile99: number;
  } {
    const sorted = [...regrets].sort((a, b) => a - b);
    const n = sorted.length;
    
    return {
      percentile10: sorted[Math.floor(n * 0.10)],
      percentile25: sorted[Math.floor(n * 0.25)],
      percentile75: sorted[Math.floor(n * 0.75)],
      percentile90: sorted[Math.floor(n * 0.90)],
      percentile95: sorted[Math.floor(n * 0.95)],
      percentile99: sorted[Math.floor(n * 0.99)]
    };
  }

  private generateRegretTimeSeries(regretMetrics: RegretMetrics[]): Array<{
    timestamp: Date;
    cumulativeRegret: number;
    instantaneousRegret: number;
    regretRate: number;
  }> {
    // Sort by timestamp
    const sorted = regretMetrics.sort((a, b) => 
      a.decisionTimestamp.getTime() - b.decisionTimestamp.getTime()
    );

    return sorted.map((metric, index) => ({
      timestamp: metric.decisionTimestamp,
      cumulativeRegret: metric.cumulativeRegret,
      instantaneousRegret: metric.instantaneousRegret,
      regretRate: index > 0 ? metric.cumulativeRegret / (index + 1) : metric.instantaneousRegret
    }));
  }

  private analyzeRegretByStage(regretMetrics: RegretMetrics[]): Record<string, {
    averageRegret: number;
    sampleSize: number;
    significance: number;
  }> {
    const stageGroups = regretMetrics.reduce((groups, metric) => {
      const stage = metric.conversationStage;
      if (!groups[stage]) {
        groups[stage] = [];
      }
      groups[stage].push(metric.instantaneousRegret);
      return groups;
    }, {} as Record<string, number[]>);

    const result: Record<string, { averageRegret: number; sampleSize: number; significance: number }> = {};
    
    for (const [stage, regrets] of Object.entries(stageGroups)) {
      const averageRegret = regrets.reduce((sum, r) => sum + r, 0) / regrets.length;
      const sampleSize = regrets.length;
      
      // Simple significance test (would use proper statistical test in practice)
      const significance = sampleSize >= 30 ? 0.95 : Math.min(0.9, 0.5 + (sampleSize / 60));
      
      result[stage] = { averageRegret, sampleSize, significance };
    }

    return result;
  }

  private async analyzeRegretByContext(
    shadowDecisions: ShadowDecision[],
    regretMetrics: RegretMetrics[]
  ): Promise<Record<string, {
    averageRegret: number;
    sampleSize: number;
    culturalFactors?: Record<string, number>;
  }>> {
    // Group by context (simplified - would be more sophisticated in practice)
    const contextGroups: Record<string, { regrets: number[]; culturalFactors: Record<string, number> }> = {};
    
    shadowDecisions.forEach((decision, index) => {
      if (index < regretMetrics.length) {
        const context = decision.shadowContext as any;
        const contextKey = context?.region || 'unknown';
        
        if (!contextGroups[contextKey]) {
          contextGroups[contextKey] = { regrets: [], culturalFactors: {} };
        }
        
        contextGroups[contextKey].regrets.push(regretMetrics[index].instantaneousRegret);
        
        // Aggregate cultural factors
        if (context?.culturalFactors) {
          Object.entries(context.culturalFactors).forEach(([factor, value]) => {
            if (!contextGroups[contextKey].culturalFactors[factor]) {
              contextGroups[contextKey].culturalFactors[factor] = 0;
            }
            contextGroups[contextKey].culturalFactors[factor] += value as number;
          });
        }
      }
    });

    const result: Record<string, { averageRegret: number; sampleSize: number; culturalFactors?: Record<string, number> }> = {};
    
    for (const [context, data] of Object.entries(contextGroups)) {
      const averageRegret = data.regrets.reduce((sum, r) => sum + r, 0) / data.regrets.length;
      const sampleSize = data.regrets.length;
      
      // Average cultural factors
      const culturalFactors: Record<string, number> = {};
      Object.entries(data.culturalFactors).forEach(([factor, total]) => {
        culturalFactors[factor] = total / sampleSize;
      });
      
      result[context] = { averageRegret, sampleSize, culturalFactors };
    }

    return result;
  }

  private async analyzeExpectedValueLift(
    experimentId: string,
    variantId: string,
    shadowDecisions: ShadowDecision[]
  ): Promise<{
    productionExpectedValue: number;
    shadowExpectedValue: number;
    potentialLift: number;
    liftSignificance: number;
  }> {
    // Calculate average expected values
    let productionTotal = 0;
    let shadowTotal = 0;
    let validCount = 0;

    for (const decision of shadowDecisions) {
      const shadowMetrics = await storage.getShadowMetrics(decision.id);
      if (shadowMetrics) {
        shadowTotal += shadowMetrics.shadowExpectedValue || 0;
        
        // Get corresponding production value (simplified)
        const productionTrace = await this.getProductionDecisionTrace(
          decision.conversationId,
          new Date(decision.timestamp)
        );
        const productionValue = productionTrace ? await this.extractProductionValue(productionTrace) : 8000; // Default
        productionTotal += productionValue;
        
        validCount++;
      }
    }

    const productionExpectedValue = validCount > 0 ? productionTotal / validCount : 0;
    const shadowExpectedValue = validCount > 0 ? shadowTotal / validCount : 0;
    const potentialLift = productionExpectedValue > 0 ? 
      (shadowExpectedValue - productionExpectedValue) / productionExpectedValue : 0;

    // Simple significance calculation (would use proper statistical test)
    const liftSignificance = validCount >= 30 ? 0.95 : Math.min(0.9, 0.5 + (validCount / 60));

    return {
      productionExpectedValue,
      shadowExpectedValue,
      potentialLift,
      liftSignificance
    };
  }

  private generateRegretAssessment(params: {
    totalRegret: number;
    averageRegret: number;
    regretStandardDeviation: number;
    expectedValueAnalysis: any;
    sampleSize: number;
  }): {
    overallRegretLevel: 'low' | 'medium' | 'high';
    recommendedAction: string;
    keyInsights: string[];
    limitations: string[];
  } {
    const { totalRegret, averageRegret, expectedValueAnalysis, sampleSize } = params;
    
    // Determine regret level
    let overallRegretLevel: 'low' | 'medium' | 'high';
    if (Math.abs(averageRegret) < 500) {
      overallRegretLevel = 'low';
    } else if (Math.abs(averageRegret) < 2000) {
      overallRegretLevel = 'medium';
    } else {
      overallRegretLevel = 'high';
    }

    // Generate recommendations
    let recommendedAction: string;
    if (averageRegret < -1000) {
      recommendedAction = 'Consider implementing this shadow policy - significant potential value increase';
    } else if (averageRegret > 1000) {
      recommendedAction = 'Current production policy appears superior - investigate shadow policy issues';
    } else {
      recommendedAction = 'Continue monitoring - regret levels are within acceptable range';
    }

    // Generate insights
    const keyInsights: string[] = [];
    if (expectedValueAnalysis.potentialLift > 0.1) {
      keyInsights.push(`Shadow policy shows ${(expectedValueAnalysis.potentialLift * 100).toFixed(1)}% potential lift in expected value`);
    }
    if (Math.abs(totalRegret) > 10000) {
      keyInsights.push(`Cumulative regret of $${Math.abs(totalRegret).toFixed(0)} suggests significant policy difference`);
    }
    if (overallRegretLevel === 'low') {
      keyInsights.push('Low regret indicates policies perform similarly - may not justify switching');
    }

    // Identify limitations
    const limitations: string[] = [];
    if (sampleSize < 100) {
      limitations.push('Small sample size limits statistical confidence');
    }
    if (expectedValueAnalysis.liftSignificance < 0.8) {
      limitations.push('Expected value lift has low statistical significance');
    }
    limitations.push('Regret analysis based on estimated rather than observed outcomes');

    return {
      overallRegretLevel,
      recommendedAction,
      keyInsights,
      limitations
    };
  }

  private async testStatisticalSignificance(
    analysis1: RegretAnalysisReport,
    analysis2: RegretAnalysisReport
  ): Promise<boolean> {
    // Simplified statistical test - would use proper hypothesis testing in practice
    const meanDiff = Math.abs(analysis1.averageRegret - analysis2.averageRegret);
    const pooledStdDev = Math.sqrt(
      (Math.pow(analysis1.regretStandardDeviation, 2) + Math.pow(analysis2.regretStandardDeviation, 2)) / 2
    );
    
    const effectSize = pooledStdDev > 0 ? meanDiff / pooledStdDev : 0;
    
    // Cohen's d > 0.5 indicates medium effect size
    return effectSize > 0.5;
  }
}

export const regretAnalysisService = new RegretAnalysisService();