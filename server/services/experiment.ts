import type { 
  Experiment, InsertExperiment, ExperimentVariant, InsertExperimentVariant,
  ExperimentResult, InsertExperimentResult, User
} from "@shared/schema";
import { storage } from "../storage";
import { shadowDecisionEngine } from "./shadow";

export interface ExperimentConfig {
  name: string;
  description: string;
  experimentType: 'decision_policy' | 'learning_algorithm' | 'cultural_context' | 'budget_detection';
  primaryMetric: string;
  secondaryMetrics?: string[];
  
  // Traffic and duration
  trafficAllocation: number; // 0.0 to 1.0
  plannedDurationDays: number;
  
  // Statistical configuration
  minimumSampleSize: number;
  confidenceLevel: number;
  minimumDetectableEffect: number;
  powerThreshold: number;
  
  // Target population filters
  targetPopulation: {
    conversationStage?: ('early' | 'mid' | 'late')[];
    minMessageCount?: number;
    minQualificationScore?: number;
    regions?: string[];
    industryVerticals?: string[];
  };
  
  // Safety configuration
  emergencyStopConditions: Array<{
    metric: string;
    operator: 'gt' | 'lt' | 'eq';
    threshold: number;
    description: string;
  }>;
  
  // Variants configuration
  variants: Array<{
    name: string;
    isControl: boolean;
    allocation: number; // percentage of experiment traffic
    policyType: 'thompson_sampling' | 'epsilon_greedy' | 'cultural_adapted' | 'budget_focused';
    policyConfig: Record<string, any>;
    learningConfig?: Record<string, any>;
    metricsWeights?: Record<string, number>;
    explorationParams?: Record<string, any>;
    culturalAdaptations?: Record<string, any>;
  }>;
}

export interface ExperimentValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ExperimentStatus {
  experiment: Experiment;
  variants: ExperimentVariant[];
  stats: {
    totalShadowDecisions: number;
    avgExecutionTime: number;
    errorRate: number;
    sampleSizeByVariant: Record<string, number>;
  };
  recentResults?: ExperimentResult[];
  isReadyForAnalysis: boolean;
  emergencyStopTriggered: boolean;
}

export class ExperimentService {
  /**
   * Create a new experiment with validation
   */
  async createExperiment(config: ExperimentConfig, createdBy: string): Promise<Experiment> {
    // Validate experiment configuration
    const validation = this.validateExperimentConfig(config);
    if (!validation.isValid) {
      throw new Error(`Experiment validation failed: ${validation.errors.join(', ')}`);
    }

    // Create experiment
    const experimentData: InsertExperiment = {
      name: config.name,
      description: config.description,
      experimentType: config.experimentType,
      status: 'draft',
      
      // Configuration
      targetPopulation: config.targetPopulation,
      trafficAllocation: config.trafficAllocation,
      minimumSampleSize: config.minimumSampleSize,
      confidenceLevel: config.confidenceLevel,
      powerThreshold: config.powerThreshold,
      plannedDuration: config.plannedDurationDays,
      
      // Statistical configuration
      primaryMetric: config.primaryMetric,
      secondaryMetrics: config.secondaryMetrics || [],
      minimumDetectableEffect: config.minimumDetectableEffect,
      
      // Safety configuration
      resourceLimits: {
        maxConcurrentShadowDecisions: 50,
        maxExecutionTimeMs: 5000,
        maxMemoryMb: 200
      },
      emergencyStopConditions: config.emergencyStopConditions,
      
      createdBy,
      metadata: {
        validationWarnings: validation.warnings,
        configVersion: '1.0.0'
      }
    };

    const experiment = await storage.createExperiment(experimentData);

    // Create variants
    for (const variantConfig of config.variants) {
      await this.createExperimentVariant(experiment.id, variantConfig);
    }

    return experiment;
  }

  /**
   * Create an experiment variant
   */
  async createExperimentVariant(
    experimentId: string,
    variantConfig: ExperimentConfig['variants'][0]
  ): Promise<ExperimentVariant> {
    const variantData: InsertExperimentVariant = {
      experimentId,
      name: variantConfig.name,
      isControl: variantConfig.isControl,
      allocation: variantConfig.allocation,
      
      policyType: variantConfig.policyType,
      policyConfig: variantConfig.policyConfig,
      learningConfig: variantConfig.learningConfig || {},
      metricsWeights: variantConfig.metricsWeights || {},
      explorationParams: variantConfig.explorationParams || {},
      culturalAdaptations: variantConfig.culturalAdaptations || {},
      
      isActive: true,
      currentSampleSize: 0
    };

    return await storage.createExperimentVariant(variantData);
  }

  /**
   * Start an experiment
   */
  async startExperiment(experimentId: string, userId: string): Promise<Experiment> {
    const experiment = await storage.getExperiment(experimentId);
    if (!experiment) {
      throw new Error('Experiment not found');
    }

    if (experiment.status !== 'draft') {
      throw new Error(`Cannot start experiment in ${experiment.status} status`);
    }

    // Validate experiment is ready to start
    const variants = await storage.getExperimentVariants(experimentId);
    if (variants.length === 0) {
      throw new Error('Experiment must have at least one variant');
    }

    // Check allocation totals to 100%
    const totalAllocation = variants.reduce((sum, v) => sum + (v.allocation || 0), 0);
    if (Math.abs(totalAllocation - 1.0) > 0.01) {
      throw new Error(`Variant allocations must sum to 100% (current: ${totalAllocation * 100}%)`);
    }

    // Start experiment
    const updatedExperiment = await storage.updateExperiment(experimentId, {
      status: 'running',
      startedAt: new Date(),
      metadata: {
        ...experiment.metadata,
        startedBy: userId,
        startTimestamp: new Date().toISOString()
      }
    });

    console.log(`Experiment ${experiment.name} started by user ${userId}`);
    return updatedExperiment;
  }

  /**
   * Pause an experiment
   */
  async pauseExperiment(experimentId: string, userId: string, reason?: string): Promise<Experiment> {
    const experiment = await storage.getExperiment(experimentId);
    if (!experiment) {
      throw new Error('Experiment not found');
    }

    if (experiment.status !== 'running') {
      throw new Error(`Cannot pause experiment in ${experiment.status} status`);
    }

    return await storage.updateExperiment(experimentId, {
      status: 'paused',
      metadata: {
        ...experiment.metadata,
        pausedBy: userId,
        pauseTimestamp: new Date().toISOString(),
        pauseReason: reason || 'Manual pause'
      }
    });
  }

  /**
   * Stop an experiment permanently
   */
  async stopExperiment(experimentId: string, userId: string, reason?: string): Promise<Experiment> {
    const experiment = await storage.getExperiment(experimentId);
    if (!experiment) {
      throw new Error('Experiment not found');
    }

    if (!['running', 'paused'].includes(experiment.status || '')) {
      throw new Error(`Cannot stop experiment in ${experiment.status} status`);
    }

    return await storage.updateExperiment(experimentId, {
      status: 'completed',
      endedAt: new Date(),
      metadata: {
        ...experiment.metadata,
        stoppedBy: userId,
        stopTimestamp: new Date().toISOString(),
        stopReason: reason || 'Manual stop'
      }
    });
  }

  /**
   * Get experiment status with comprehensive metrics
   */
  async getExperimentStatus(experimentId: string): Promise<ExperimentStatus> {
    const experiment = await storage.getExperiment(experimentId);
    if (!experiment) {
      throw new Error('Experiment not found');
    }

    const variants = await storage.getExperimentVariants(experimentId);
    const stats = await storage.getExperimentStats(experimentId);
    const recentResults = await storage.getLatestExperimentResults(experimentId);

    // Check if experiment is ready for analysis
    const isReadyForAnalysis = this.checkIfReadyForAnalysis(experiment, stats);

    // Check emergency stop conditions
    const emergencyStopTriggered = await this.checkEmergencyStopConditions(experiment, stats);

    return {
      experiment,
      variants,
      stats,
      recentResults,
      isReadyForAnalysis,
      emergencyStopTriggered
    };
  }

  /**
   * Get all experiments with filtering
   */
  async getExperiments(filters?: {
    status?: string;
    experimentType?: string;
    createdBy?: string;
  }): Promise<Experiment[]> {
    // For now, get all experiments and filter in memory
    // In production, this would be done at the database level
    const allExperiments = await storage.getActiveExperiments();
    
    if (!filters) return allExperiments;

    return allExperiments.filter(exp => {
      if (filters.status && exp.status !== filters.status) return false;
      if (filters.experimentType && exp.experimentType !== filters.experimentType) return false;
      if (filters.createdBy && exp.createdBy !== filters.createdBy) return false;
      return true;
    });
  }

  /**
   * Monitor experiment performance and safety
   */
  async monitorExperiment(experimentId: string): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    issues: Array<{ severity: 'warning' | 'error'; message: string; metric?: string; value?: number }>;
    recommendations: string[];
  }> {
    const experiment = await storage.getExperiment(experimentId);
    if (!experiment) {
      throw new Error('Experiment not found');
    }

    const stats = await storage.getExperimentStats(experimentId);
    const issues: Array<{ severity: 'warning' | 'error'; message: string; metric?: string; value?: number }> = [];
    const recommendations: string[] = [];

    // Check error rate
    if (stats.errorRate > 0.1) {
      issues.push({
        severity: 'error',
        message: `High error rate detected: ${(stats.errorRate * 100).toFixed(1)}%`,
        metric: 'error_rate',
        value: stats.errorRate
      });
      recommendations.push('Review shadow decision engine logs for error patterns');
    } else if (stats.errorRate > 0.05) {
      issues.push({
        severity: 'warning',
        message: `Elevated error rate: ${(stats.errorRate * 100).toFixed(1)}%`,
        metric: 'error_rate',
        value: stats.errorRate
      });
    }

    // Check execution time
    if (stats.avgExecutionTime > 3000) {
      issues.push({
        severity: 'warning',
        message: `High average execution time: ${stats.avgExecutionTime.toFixed(0)}ms`,
        metric: 'execution_time',
        value: stats.avgExecutionTime
      });
      recommendations.push('Consider optimizing shadow policy algorithms');
    }

    // Check sample size balance
    const variants = await storage.getExperimentVariants(experimentId);
    for (const variant of variants) {
      const expectedSamples = stats.totalShadowDecisions * (variant.allocation || 0);
      const actualSamples = stats.sampleSizeByVariant[variant.id] || 0;
      const deviation = Math.abs(actualSamples - expectedSamples) / expectedSamples;
      
      if (deviation > 0.2) {
        issues.push({
          severity: 'warning',
          message: `Sample allocation deviation for variant ${variant.name}: ${(deviation * 100).toFixed(1)}%`,
          metric: 'sample_balance',
          value: deviation
        });
      }
    }

    // Check minimum sample size
    if (stats.totalShadowDecisions < (experiment.minimumSampleSize || 100)) {
      recommendations.push(`Need ${((experiment.minimumSampleSize || 100) - stats.totalShadowDecisions)} more samples for statistical significance`);
    }

    // Check emergency stop conditions
    const emergencyStop = await this.checkEmergencyStopConditions(experiment, stats);
    if (emergencyStop) {
      issues.push({
        severity: 'error',
        message: 'Emergency stop condition triggered',
        metric: 'emergency_stop'
      });
      recommendations.push('Review emergency stop conditions and consider stopping experiment');
    }

    // Determine overall status
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (issues.some(i => i.severity === 'error')) {
      status = 'critical';
    } else if (issues.length > 0) {
      status = 'warning';
    }

    return { status, issues, recommendations };
  }

  /**
   * Validate experiment configuration
   */
  private validateExperimentConfig(config: ExperimentConfig): ExperimentValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic validation
    if (!config.name?.trim()) {
      errors.push('Experiment name is required');
    }

    if (!config.description?.trim()) {
      errors.push('Experiment description is required');
    }

    if (!config.primaryMetric) {
      errors.push('Primary metric is required');
    }

    // Traffic allocation validation
    if (config.trafficAllocation <= 0 || config.trafficAllocation > 1) {
      errors.push('Traffic allocation must be between 0 and 1');
    }

    if (config.trafficAllocation > 0.5) {
      warnings.push('High traffic allocation (>50%) may affect production performance');
    }

    // Duration validation
    if (config.plannedDurationDays < 7) {
      warnings.push('Short experiment duration (<7 days) may not provide reliable results');
    }

    if (config.plannedDurationDays > 90) {
      warnings.push('Long experiment duration (>90 days) may be affected by external changes');
    }

    // Statistical configuration validation
    if (config.minimumSampleSize < 100) {
      warnings.push('Low minimum sample size (<100) may reduce statistical power');
    }

    if (config.confidenceLevel < 0.9 || config.confidenceLevel > 0.99) {
      errors.push('Confidence level must be between 0.9 and 0.99');
    }

    if (config.minimumDetectableEffect < 0.01 || config.minimumDetectableEffect > 0.5) {
      errors.push('Minimum detectable effect must be between 0.01 and 0.5');
    }

    // Variants validation
    if (!config.variants || config.variants.length === 0) {
      errors.push('At least one variant is required');
    }

    if (config.variants) {
      const controlVariants = config.variants.filter(v => v.isControl);
      if (controlVariants.length !== 1) {
        errors.push('Exactly one control variant is required');
      }

      const totalAllocation = config.variants.reduce((sum, v) => sum + v.allocation, 0);
      if (Math.abs(totalAllocation - 1.0) > 0.01) {
        errors.push('Variant allocations must sum to 100%');
      }

      // Validate each variant
      config.variants.forEach((variant, index) => {
        if (!variant.name?.trim()) {
          errors.push(`Variant ${index + 1} name is required`);
        }

        if (variant.allocation <= 0 || variant.allocation > 1) {
          errors.push(`Variant ${variant.name} allocation must be between 0 and 1`);
        }

        if (!variant.policyType) {
          errors.push(`Variant ${variant.name} policy type is required`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Check if experiment is ready for statistical analysis
   */
  private checkIfReadyForAnalysis(experiment: Experiment, stats: any): boolean {
    // Check minimum sample size
    if (stats.totalShadowDecisions < (experiment.minimumSampleSize || 100)) {
      return false;
    }

    // Check experiment has been running for minimum duration
    if (experiment.startedAt) {
      const daysSinceStart = (Date.now() - new Date(experiment.startedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceStart < 7) { // Minimum 7 days
        return false;
      }
    }

    // Check error rate is acceptable
    if (stats.errorRate > 0.1) {
      return false;
    }

    return true;
  }

  /**
   * Check emergency stop conditions
   */
  private async checkEmergencyStopConditions(experiment: Experiment, stats: any): Promise<boolean> {
    const conditions = experiment.emergencyStopConditions as Array<{
      metric: string;
      operator: 'gt' | 'lt' | 'eq';
      threshold: number;
      description: string;
    }>;

    if (!conditions || conditions.length === 0) return false;

    for (const condition of conditions) {
      let value: number;
      
      switch (condition.metric) {
        case 'error_rate':
          value = stats.errorRate;
          break;
        case 'avg_execution_time':
          value = stats.avgExecutionTime;
          break;
        case 'total_decisions':
          value = stats.totalShadowDecisions;
          break;
        default:
          continue; // Skip unknown metrics
      }

      let conditionMet = false;
      switch (condition.operator) {
        case 'gt':
          conditionMet = value > condition.threshold;
          break;
        case 'lt':
          conditionMet = value < condition.threshold;
          break;
        case 'eq':
          conditionMet = Math.abs(value - condition.threshold) < 0.001;
          break;
      }

      if (conditionMet) {
        console.warn(`Emergency stop condition triggered: ${condition.description} (${value} ${condition.operator} ${condition.threshold})`);
        return true;
      }
    }

    return false;
  }
}

export const experimentService = new ExperimentService();