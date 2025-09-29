import type { 
  PropensityScore, ShadowDecision, ShadowMetrics, Experiment,
  ExperimentVariant, ConversationMetrics, DecisionTrace
} from "@shared/schema";
import { storage } from "../storage";

export interface IPSEstimate {
  estimate: number;
  variance: number;
  confidenceInterval: { lower: number; upper: number };
  effectiveN: number; // Effective sample size after reweighting
  truncationRate: number; // Percentage of samples truncated
  isReliable: boolean;
  validationNotes: string[];
}

export interface IPSComparison {
  metric: string;
  productionValue: number;
  shadowValue: IPSEstimate;
  lift: number; // (shadow - production) / production
  significance: {
    pValue: number;
    isSignificant: boolean;
    confidenceLevel: number;
  };
}

export interface IPSAnalysisResult {
  experimentId: string;
  variantId: string;
  sampleSize: number;
  timeRange: { start: Date; end: Date };
  
  // Primary metric analysis
  primaryMetric: IPSComparison;
  secondaryMetrics: IPSComparison[];
  
  // IPS quality metrics
  propensityScoreDistribution: {
    mean: number;
    median: number;
    min: number;
    max: number;
    q25: number;
    q75: number;
  };
  
  // Overlap diagnostics
  overlapDiagnostics: {
    minPropensity: number;
    maxPropensity: number;
    truncationThreshold: number;
    supportOverlap: number; // 0-1 measure of overlap
  };
  
  // Variance and bias analysis
  varianceAnalysis: {
    rawVariance: number;
    truncatedVariance: number;
    varianceReductionFactor: number;
  };
  
  // Overall assessment
  assessment: {
    reliability: 'high' | 'medium' | 'low';
    recommendation: string;
    limitations: string[];
  };
}

export interface TruncationConfig {
  method: 'percentile' | 'threshold' | 'adaptive';
  lowerBound?: number; // For threshold method
  upperBound?: number; // For threshold method
  percentile?: number; // For percentile method (e.g., 0.05 for 5th percentile)
  adaptiveAlpha?: number; // For adaptive method
}

export class IPSEvaluationService {
  private defaultTruncationConfig: TruncationConfig = {
    method: 'percentile',
    percentile: 0.05 // Truncate at 5th and 95th percentiles
  };

  /**
   * Estimate performance of a shadow policy using IPS
   */
  async estimatePolicyPerformance(
    experimentId: string,
    variantId: string,
    metric: string,
    truncationConfig?: TruncationConfig
  ): Promise<IPSEstimate> {
    const config = truncationConfig || this.defaultTruncationConfig;
    
    // Get shadow decisions and propensity scores
    const shadowDecisions = await storage.getShadowDecisions(undefined, experimentId);
    const variantDecisions = shadowDecisions.filter(d => d.variantId === variantId);
    
    if (variantDecisions.length === 0) {
      throw new Error('No shadow decisions found for variant');
    }

    // Get propensity scores
    const propensityScores = await this.getPropensityScoresForDecisions(variantDecisions);
    
    // Get outcome values for the metric
    const outcomes = await this.getOutcomeValues(variantDecisions, metric);
    
    // Combine data for IPS calculation
    const ipsData = this.combineIPSData(variantDecisions, propensityScores, outcomes);
    
    // Apply truncation
    const truncatedData = this.applyTruncation(ipsData, config);
    
    // Calculate IPS estimate
    const estimate = this.calculateIPSEstimate(truncatedData);
    
    // Calculate confidence interval
    const confidenceInterval = this.calculateConfidenceInterval(truncatedData, estimate.estimate, estimate.variance);
    
    // Assess reliability
    const reliability = this.assessReliability(truncatedData, estimate);
    
    return {
      estimate: estimate.estimate,
      variance: estimate.variance,
      confidenceInterval,
      effectiveN: estimate.effectiveN,
      truncationRate: (ipsData.length - truncatedData.length) / ipsData.length,
      isReliable: reliability.isReliable,
      validationNotes: reliability.notes
    };
  }

  /**
   * Compare shadow policy performance to production baseline
   */
  async compareToProduction(
    experimentId: string,
    variantId: string,
    metrics: string[],
    confidenceLevel: number = 0.95
  ): Promise<IPSAnalysisResult> {
    const experiment = await storage.getExperiment(experimentId);
    if (!experiment) {
      throw new Error('Experiment not found');
    }

    const variant = await storage.getExperimentVariant(variantId);
    if (!variant) {
      throw new Error('Variant not found');
    }

    // Get shadow decisions
    const shadowDecisions = await storage.getShadowDecisions(undefined, experimentId);
    const variantDecisions = shadowDecisions.filter(d => d.variantId === variantId);
    
    if (variantDecisions.length === 0) {
      throw new Error('No shadow decisions found for variant');
    }

    // Get time range
    const timeRange = {
      start: new Date(Math.min(...variantDecisions.map(d => new Date(d.timestamp).getTime()))),
      end: new Date(Math.max(...variantDecisions.map(d => new Date(d.timestamp).getTime())))
    };

    // Get production baseline for the same period
    const productionBaseline = await this.getProductionBaseline(metrics, timeRange);
    
    // Calculate primary metric comparison
    const primaryMetric = await this.calculateMetricComparison(
      experimentId,
      variantId,
      experiment.primaryMetric,
      productionBaseline[experiment.primaryMetric],
      confidenceLevel
    );

    // Calculate secondary metrics comparisons
    const secondaryMetrics = await Promise.all(
      (experiment.secondaryMetrics as string[] || []).map(metric =>
        this.calculateMetricComparison(
          experimentId,
          variantId,
          metric,
          productionBaseline[metric],
          confidenceLevel
        )
      )
    );

    // Calculate propensity score distribution
    const propensityScores = await this.getPropensityScoresForDecisions(variantDecisions);
    const propensityValues = propensityScores.map(p => p.propensityScore);
    const propensityScoreDistribution = this.calculateDistributionStats(propensityValues);

    // Calculate overlap diagnostics
    const overlapDiagnostics = this.calculateOverlapDiagnostics(propensityValues);

    // Calculate variance analysis
    const varianceAnalysis = await this.calculateVarianceAnalysis(variantDecisions, propensityScores);

    // Overall assessment
    const assessment = this.assessOverallReliability({
      sampleSize: variantDecisions.length,
      propensityDistribution: propensityScoreDistribution,
      overlapDiagnostics,
      varianceAnalysis,
      primaryMetric
    });

    return {
      experimentId,
      variantId,
      sampleSize: variantDecisions.length,
      timeRange,
      primaryMetric,
      secondaryMetrics,
      propensityScoreDistribution,
      overlapDiagnostics,
      varianceAnalysis,
      assessment
    };
  }

  /**
   * Batch analyze multiple variants
   */
  async batchAnalyzeVariants(
    experimentId: string,
    metrics: string[],
    confidenceLevel: number = 0.95
  ): Promise<Record<string, IPSAnalysisResult>> {
    const variants = await storage.getExperimentVariants(experimentId);
    const results: Record<string, IPSAnalysisResult> = {};

    for (const variant of variants) {
      try {
        results[variant.id] = await this.compareToProduction(
          experimentId,
          variant.id,
          metrics,
          confidenceLevel
        );
      } catch (error) {
        console.error(`Failed to analyze variant ${variant.name}:`, error);
        // Continue with other variants
      }
    }

    return results;
  }

  /**
   * Validate IPS assumptions and data quality
   */
  async validateIPSAssumptions(experimentId: string, variantId: string): Promise<{
    violations: Array<{
      assumption: string;
      severity: 'warning' | 'error';
      description: string;
      impact: string;
    }>;
    overallValidity: 'valid' | 'questionable' | 'invalid';
    recommendations: string[];
  }> {
    const violations = [];
    const recommendations = [];

    const shadowDecisions = await storage.getShadowDecisions(undefined, experimentId);
    const variantDecisions = shadowDecisions.filter(d => d.variantId === variantId);
    const propensityScores = await this.getPropensityScoresForDecisions(variantDecisions);

    // Check positivity assumption (overlap)
    const propensityValues = propensityScores.map(p => p.propensityScore);
    const minPropensity = Math.min(...propensityValues);
    const supportOverlap = this.calculateSupportOverlap(propensityValues);

    if (minPropensity < 0.01) {
      violations.push({
        assumption: 'Positivity',
        severity: 'error',
        description: `Minimum propensity score is very low (${minPropensity.toFixed(4)})`,
        impact: 'High variance in IPS estimates; may lead to unreliable results'
      });
      recommendations.push('Consider more restrictive truncation or larger sample size');
    }

    if (supportOverlap < 0.8) {
      violations.push({
        assumption: 'Positivity',
        severity: 'warning',
        description: `Limited support overlap (${(supportOverlap * 100).toFixed(1)}%)`,
        impact: 'IPS estimates may not generalize well'
      });
    }

    // Check unconfoundedness (no unmeasured confounders)
    const contextFeatures = propensityScores.map(p => Object.keys(p.contextFeatures || {}).length);
    const avgFeatures = contextFeatures.reduce((sum, n) => sum + n, 0) / contextFeatures.length;

    if (avgFeatures < 5) {
      violations.push({
        assumption: 'Unconfoundedness',
        severity: 'warning',
        description: `Limited context features captured (avg: ${avgFeatures.toFixed(1)})`,
        impact: 'May have unmeasured confounders affecting propensity estimation'
      });
      recommendations.push('Capture more context features for propensity modeling');
    }

    // Check propensity model quality
    const lowConfidenceScores = propensityScores.filter(p => (p.modelConfidence || 0) < 0.7).length;
    const lowConfidenceRate = lowConfidenceScores / propensityScores.length;

    if (lowConfidenceRate > 0.3) {
      violations.push({
        assumption: 'Propensity Model Quality',
        severity: 'warning',
        description: `High rate of low-confidence propensity scores (${(lowConfidenceRate * 100).toFixed(1)}%)`,
        impact: 'Propensity model may be misspecified'
      });
      recommendations.push('Improve propensity model or collect better features');
    }

    // Check sample size adequacy
    if (variantDecisions.length < 100) {
      violations.push({
        assumption: 'Sample Size',
        severity: 'error',
        description: `Very small sample size (${variantDecisions.length})`,
        impact: 'Insufficient power for reliable IPS estimation'
      });
      recommendations.push('Collect more data before drawing conclusions');
    } else if (variantDecisions.length < 500) {
      violations.push({
        assumption: 'Sample Size',
        severity: 'warning',
        description: `Small sample size (${variantDecisions.length})`,
        impact: 'Limited statistical power'
      });
    }

    // Check variance inflation
    const varianceInflationFactor = this.calculateVarianceInflationFactor(propensityValues);
    if (varianceInflationFactor > 10) {
      violations.push({
        assumption: 'Variance Control',
        severity: 'error',
        description: `High variance inflation (factor: ${varianceInflationFactor.toFixed(1)})`,
        impact: 'IPS estimates will have very high variance'
      });
      recommendations.push('Apply more aggressive truncation');
    }

    // Determine overall validity
    let overallValidity: 'valid' | 'questionable' | 'invalid' = 'valid';
    if (violations.some(v => v.severity === 'error')) {
      overallValidity = 'invalid';
    } else if (violations.length > 0) {
      overallValidity = 'questionable';
    }

    if (recommendations.length === 0) {
      recommendations.push('IPS assumptions appear to be satisfied');
    }

    return {
      violations,
      overallValidity,
      recommendations
    };
  }

  // Private helper methods

  private async getPropensityScoresForDecisions(
    shadowDecisions: ShadowDecision[]
  ): Promise<PropensityScore[]> {
    const propensityScores: PropensityScore[] = [];
    
    for (const decision of shadowDecisions) {
      const scores = await storage.getPropensityScores(decision.experimentId, decision.conversationId);
      const matchingScore = scores.find(s => 
        s.variantId === decision.variantId &&
        Math.abs(new Date(s.timestamp).getTime() - new Date(decision.timestamp).getTime()) < 60000 // Within 1 minute
      );
      
      if (matchingScore) {
        propensityScores.push(matchingScore);
      }
    }
    
    return propensityScores;
  }

  private async getOutcomeValues(
    shadowDecisions: ShadowDecision[],
    metric: string
  ): Promise<number[]> {
    const outcomes: number[] = [];
    
    for (const decision of shadowDecisions) {
      const shadowMetrics = await storage.getShadowMetrics(decision.id);
      if (shadowMetrics) {
        let value = 0;
        
        switch (metric) {
          case 'qualification_score':
            value = shadowMetrics.shadowQualificationScore || 0;
            break;
          case 'expected_value':
            value = shadowMetrics.shadowExpectedValue || 0;
            break;
          case 'advance_probability':
            value = shadowMetrics.shadowAdvanceProbability || 0;
            break;
          case 'engagement_score':
            value = shadowMetrics.shadowEngagementScore || 0;
            break;
          default:
            value = 0;
        }
        
        outcomes.push(value);
      } else {
        outcomes.push(0); // Default value if metrics not found
      }
    }
    
    return outcomes;
  }

  private combineIPSData(
    decisions: ShadowDecision[],
    propensityScores: PropensityScore[],
    outcomes: number[]
  ): Array<{ decision: ShadowDecision; propensityScore: number; outcome: number }> {
    const combined = [];
    
    for (let i = 0; i < decisions.length; i++) {
      const matchingPropensity = propensityScores.find(p =>
        p.conversationId === decisions[i].conversationId &&
        p.variantId === decisions[i].variantId
      );
      
      if (matchingPropensity && i < outcomes.length) {
        combined.push({
          decision: decisions[i],
          propensityScore: matchingPropensity.propensityScore,
          outcome: outcomes[i]
        });
      }
    }
    
    return combined;
  }

  private applyTruncation(
    data: Array<{ decision: ShadowDecision; propensityScore: number; outcome: number }>,
    config: TruncationConfig
  ): Array<{ decision: ShadowDecision; propensityScore: number; outcome: number; weight: number }> {
    const propensityValues = data.map(d => d.propensityScore);
    let lowerBound = 0;
    let upperBound = Infinity;

    switch (config.method) {
      case 'threshold':
        lowerBound = config.lowerBound || 0.01;
        upperBound = config.upperBound || 10;
        break;
        
      case 'percentile':
        const percentile = config.percentile || 0.05;
        const sorted = [...propensityValues].sort((a, b) => a - b);
        lowerBound = sorted[Math.floor(sorted.length * percentile)];
        upperBound = sorted[Math.floor(sorted.length * (1 - percentile))];
        break;
        
      case 'adaptive':
        const alpha = config.adaptiveAlpha || 0.05;
        const mean = propensityValues.reduce((sum, v) => sum + v, 0) / propensityValues.length;
        const variance = propensityValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / propensityValues.length;
        const stdDev = Math.sqrt(variance);
        lowerBound = Math.max(0.001, mean - 2 * stdDev);
        upperBound = mean + 2 * stdDev;
        break;
    }

    return data
      .filter(d => d.propensityScore >= lowerBound && d.propensityScore <= upperBound)
      .map(d => ({
        ...d,
        weight: 1 / d.propensityScore // IPS weight
      }));
  }

  private calculateIPSEstimate(
    data: Array<{ decision: ShadowDecision; propensityScore: number; outcome: number; weight: number }>
  ): { estimate: number; variance: number; effectiveN: number } {
    if (data.length === 0) {
      return { estimate: 0, variance: 0, effectiveN: 0 };
    }

    // IPS estimate: sum of weighted outcomes / sum of weights
    const weightedOutcomes = data.map(d => d.outcome * d.weight);
    const weights = data.map(d => d.weight);
    
    const sumWeightedOutcomes = weightedOutcomes.reduce((sum, w) => sum + w, 0);
    const sumWeights = weights.reduce((sum, w) => sum + w, 0);
    
    const estimate = sumWeights > 0 ? sumWeightedOutcomes / sumWeights : 0;

    // Variance calculation for IPS estimator
    const n = data.length;
    const weightedResiduals = data.map(d => Math.pow((d.outcome - estimate) * d.weight, 2));
    const sumWeightedResiduals = weightedResiduals.reduce((sum, r) => sum + r, 0);
    const variance = n > 1 ? sumWeightedResiduals / (n * Math.pow(sumWeights / n, 2)) : 0;

    // Effective sample size (accounts for weight variability)
    const sumSquaredWeights = weights.reduce((sum, w) => sum + w * w, 0);
    const effectiveN = sumWeights > 0 ? Math.pow(sumWeights, 2) / sumSquaredWeights : 0;

    return { estimate, variance, effectiveN };
  }

  private calculateConfidenceInterval(
    data: Array<{ decision: ShadowDecision; propensityScore: number; outcome: number; weight: number }>,
    estimate: number,
    variance: number,
    confidenceLevel: number = 0.95
  ): { lower: number; upper: number } {
    if (data.length === 0 || variance === 0) {
      return { lower: estimate, upper: estimate };
    }

    const alpha = 1 - confidenceLevel;
    const zScore = this.getZScore(1 - alpha / 2);
    const standardError = Math.sqrt(variance);
    const margin = zScore * standardError;

    return {
      lower: estimate - margin,
      upper: estimate + margin
    };
  }

  private assessReliability(
    data: Array<{ decision: ShadowDecision; propensityScore: number; outcome: number; weight: number }>,
    estimate: { estimate: number; variance: number; effectiveN: number }
  ): { isReliable: boolean; notes: string[] } {
    const notes: string[] = [];
    let isReliable = true;

    // Check effective sample size
    if (estimate.effectiveN < 30) {
      notes.push(`Low effective sample size (${estimate.effectiveN.toFixed(1)})`);
      isReliable = false;
    }

    // Check variance
    if (estimate.variance > 1) {
      notes.push(`High variance (${estimate.variance.toFixed(3)})`);
      isReliable = false;
    }

    // Check weight distribution
    const weights = data.map(d => d.weight);
    const maxWeight = Math.max(...weights);
    const meanWeight = weights.reduce((sum, w) => sum + w, 0) / weights.length;
    
    if (maxWeight > 10 * meanWeight) {
      notes.push('High weight concentration may lead to unstable estimates');
      isReliable = false;
    }

    if (notes.length === 0) {
      notes.push('IPS estimate appears reliable');
    }

    return { isReliable, notes };
  }

  private async getProductionBaseline(
    metrics: string[],
    timeRange: { start: Date; end: Date }
  ): Promise<Record<string, number>> {
    // Get production metrics for the same time period
    const baseline: Record<string, number> = {};
    
    // This would query actual production metrics - simplified for now
    for (const metric of metrics) {
      switch (metric) {
        case 'qualification_score':
          baseline[metric] = 0.6; // Example baseline
          break;
        case 'expected_value':
          baseline[metric] = 8000; // Example baseline
          break;
        case 'advance_probability':
          baseline[metric] = 0.45; // Example baseline
          break;
        default:
          baseline[metric] = 0.5;
      }
    }
    
    return baseline;
  }

  private async calculateMetricComparison(
    experimentId: string,
    variantId: string,
    metric: string,
    productionValue: number,
    confidenceLevel: number
  ): Promise<IPSComparison> {
    const shadowEstimate = await this.estimatePolicyPerformance(experimentId, variantId, metric);
    const lift = productionValue > 0 ? (shadowEstimate.estimate - productionValue) / productionValue : 0;
    
    // Simplified significance test
    const standardError = Math.sqrt(shadowEstimate.variance);
    const zScore = Math.abs(shadowEstimate.estimate - productionValue) / standardError;
    const pValue = 2 * (1 - this.normalCDF(zScore)); // Two-tailed test
    
    return {
      metric,
      productionValue,
      shadowValue: shadowEstimate,
      lift,
      significance: {
        pValue,
        isSignificant: pValue < (1 - confidenceLevel),
        confidenceLevel
      }
    };
  }

  private calculateDistributionStats(values: number[]): {
    mean: number;
    median: number;
    min: number;
    max: number;
    q25: number;
    q75: number;
  } {
    if (values.length === 0) {
      return { mean: 0, median: 0, min: 0, max: 0, q25: 0, q75: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    
    return {
      mean: values.reduce((sum, v) => sum + v, 0) / n,
      median: n % 2 === 0 ? (sorted[n/2 - 1] + sorted[n/2]) / 2 : sorted[Math.floor(n/2)],
      min: sorted[0],
      max: sorted[n - 1],
      q25: sorted[Math.floor(n * 0.25)],
      q75: sorted[Math.floor(n * 0.75)]
    };
  }

  private calculateOverlapDiagnostics(propensityValues: number[]): {
    minPropensity: number;
    maxPropensity: number;
    truncationThreshold: number;
    supportOverlap: number;
  } {
    const sorted = [...propensityValues].sort((a, b) => a - b);
    const n = sorted.length;
    
    return {
      minPropensity: sorted[0],
      maxPropensity: sorted[n - 1],
      truncationThreshold: sorted[Math.floor(n * 0.05)], // 5th percentile
      supportOverlap: this.calculateSupportOverlap(propensityValues)
    };
  }

  private calculateSupportOverlap(propensityValues: number[]): number {
    // Simplified overlap calculation - in practice would be more sophisticated
    const minPropensity = Math.min(...propensityValues);
    const maxPropensity = Math.max(...propensityValues);
    
    // Measure how much of the propensity range has reasonable support
    const reasonableMin = 0.05;
    const reasonableMax = 0.95;
    
    const overlapMin = Math.max(minPropensity, reasonableMin);
    const overlapMax = Math.min(maxPropensity, reasonableMax);
    
    return Math.max(0, (overlapMax - overlapMin) / (reasonableMax - reasonableMin));
  }

  private async calculateVarianceAnalysis(
    shadowDecisions: ShadowDecision[],
    propensityScores: PropensityScore[]
  ): Promise<{
    rawVariance: number;
    truncatedVariance: number;
    varianceReductionFactor: number;
  }> {
    // Simplified variance analysis
    const weights = propensityScores.map(p => 1 / p.propensityScore);
    const rawVariance = this.calculateVariance(weights);
    
    // Apply truncation and recalculate
    const truncatedWeights = weights.filter(w => w >= 1 && w <= 20); // Simple truncation
    const truncatedVariance = this.calculateVariance(truncatedWeights);
    
    const varianceReductionFactor = rawVariance > 0 ? truncatedVariance / rawVariance : 1;
    
    return {
      rawVariance,
      truncatedVariance,
      varianceReductionFactor
    };
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    return values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  }

  private calculateVarianceInflationFactor(propensityValues: number[]): number {
    const weights = propensityValues.map(p => 1 / p);
    const meanWeight = weights.reduce((sum, w) => sum + w, 0) / weights.length;
    const weightVariance = this.calculateVariance(weights);
    
    return 1 + (weightVariance / Math.pow(meanWeight, 2));
  }

  private assessOverallReliability(params: {
    sampleSize: number;
    propensityDistribution: any;
    overlapDiagnostics: any;
    varianceAnalysis: any;
    primaryMetric: IPSComparison;
  }): {
    reliability: 'high' | 'medium' | 'low';
    recommendation: string;
    limitations: string[];
  } {
    const limitations: string[] = [];
    let score = 1.0;

    // Sample size check
    if (params.sampleSize < 100) {
      score *= 0.3;
      limitations.push('Very small sample size limits reliability');
    } else if (params.sampleSize < 500) {
      score *= 0.7;
      limitations.push('Small sample size may affect precision');
    }

    // Overlap check
    if (params.overlapDiagnostics.supportOverlap < 0.6) {
      score *= 0.5;
      limitations.push('Limited support overlap between policies');
    }

    // Variance check
    if (params.varianceAnalysis.varianceReductionFactor > 1.5) {
      score *= 0.8;
      limitations.push('High variance in IPS weights');
    }

    // Primary metric reliability
    if (!params.primaryMetric.shadowValue.isReliable) {
      score *= 0.6;
      limitations.push('Primary metric estimate flagged as unreliable');
    }

    let reliability: 'high' | 'medium' | 'low';
    let recommendation: string;

    if (score >= 0.8) {
      reliability = 'high';
      recommendation = 'IPS estimates are reliable and can be used for decision making';
    } else if (score >= 0.5) {
      reliability = 'medium';
      recommendation = 'IPS estimates are moderately reliable but should be interpreted cautiously';
    } else {
      reliability = 'low';
      recommendation = 'IPS estimates have low reliability and should not be used for critical decisions';
    }

    if (limitations.length === 0) {
      limitations.push('No major limitations detected');
    }

    return { reliability, recommendation, limitations };
  }

  // Statistical utility functions
  private getZScore(probability: number): number {
    // Approximation of inverse normal CDF for common confidence levels
    if (probability >= 0.975) return 1.96;
    if (probability >= 0.95) return 1.645;
    if (probability >= 0.90) return 1.28;
    return 1.0; // Default fallback
  }

  private normalCDF(z: number): number {
    // Approximation of standard normal CDF
    return 0.5 * (1 + this.erf(z / Math.sqrt(2)));
  }

  private erf(x: number): number {
    // Approximation of error function
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;

    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }
}

export const ipsEvaluationService = new IPSEvaluationService();