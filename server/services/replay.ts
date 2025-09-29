import { recordingService } from "./recording";
import { storage } from "../storage";
import { metricsService } from "./metrics";
import { decisionService } from "./decision";
import { learningService } from "./learning";
import { whatsappService } from "./whatsapp";
import { createHash } from "crypto";
import type { 
  ConversationRecording,
  WebhookRecording,
  ExecutionTrace,
  ReplayExecution,
  InsertReplayExecution,
  InsertTraceValidation,
  TraceValidation,
  ConversationMetrics,
  Message
} from "@shared/schema";

export interface ReplayConfig {
  skipExternalAPIs: boolean;
  validateHashes: boolean;
  strictMode: boolean; // Fail on any discrepancy
  timeoutMs: number;
  maxRetries: number;
  logLevel: 'minimal' | 'detailed' | 'verbose';
}

export interface ReplayResult {
  success: boolean;
  reproducibilityRate: number;
  totalSteps: number;
  reproducibleSteps: number;
  hashMismatches: HashMismatch[];
  validationResults: ValidationResult[];
  errors: ReplayError[];
  executionTime: number;
}

export interface HashMismatch {
  stepName: string;
  originalHash: string;
  replayHash: string;
  difference: any;
  severity: 'minor' | 'major' | 'critical';
}

export interface ValidationResult {
  stepName: string;
  validationType: string;
  isValid: boolean;
  confidence: number;
  details: any;
}

export interface ReplayError {
  stepName: string;
  error: string;
  stack?: string;
  recoverable: boolean;
}

export class ReplayEngine {
  private config: ReplayConfig;
  private currentReplayId: string | null = null;
  private originalTraces: Map<string, ExecutionTrace[]> = new Map();
  private replayTraces: Map<string, any[]> = new Map();

  constructor(config?: Partial<ReplayConfig>) {
    this.config = {
      skipExternalAPIs: true,
      validateHashes: true,
      strictMode: false,
      timeoutMs: 30000,
      maxRetries: 3,
      logLevel: 'detailed',
      ...config
    };
  }

  async replayRecording(
    recordingId: string,
    config?: Partial<ReplayConfig>
  ): Promise<ReplayResult> {
    const replayConfig = { ...this.config, ...config };
    const startTime = Date.now();

    // Create replay execution record
    const replayExecution = await storage.createReplayExecution({
      recordingId,
      executionType: 'full_replay',
      status: 'running',
      replayConfig
    });

    this.currentReplayId = replayExecution.id;

    try {
      // Get recording and webhook events
      const recording = await storage.getRecording(recordingId);
      if (!recording) {
        throw new Error(`Recording ${recordingId} not found`);
      }

      const webhookEvents = await storage.getWebhookRecordings(recordingId);
      if (webhookEvents.length === 0) {
        throw new Error(`No webhook events found for recording ${recordingId}`);
      }

      let totalSteps = 0;
      let reproducibleSteps = 0;
      const hashMismatches: HashMismatch[] = [];
      const validationResults: ValidationResult[] = [];
      const errors: ReplayError[] = [];

      // Replay each webhook event
      for (const webhookEvent of webhookEvents) {
        try {
          const stepResult = await this.replayWebhookEvent(
            webhookEvent,
            replayConfig
          );

          totalSteps += stepResult.totalSteps;
          reproducibleSteps += stepResult.reproducibleSteps;
          hashMismatches.push(...stepResult.hashMismatches);
          validationResults.push(...stepResult.validationResults);
          errors.push(...stepResult.errors);

        } catch (error) {
          errors.push({
            stepName: `webhook_${webhookEvent.sequenceNumber}`,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            recoverable: false
          });
        }
      }

      const reproducibilityRate = totalSteps > 0 ? reproducibleSteps / totalSteps : 0;
      const executionTime = Date.now() - startTime;

      // Update replay execution
      await storage.updateReplayExecution(replayExecution.id, {
        status: 'completed',
        completedAt: new Date(),
        totalSteps,
        reproducibleSteps,
        reproducibilityRate,
        hashMismatches,
        resultsSummary: {
          reproducibilityRate,
          totalValidations: validationResults.length,
          validValidations: validationResults.filter(v => v.isValid).length,
          errorCount: errors.length,
          executionTime
        }
      });

      return {
        success: reproducibilityRate >= 0.95, // 95% threshold
        reproducibilityRate,
        totalSteps,
        reproducibleSteps,
        hashMismatches,
        validationResults,
        errors,
        executionTime
      };

    } catch (error) {
      // Update replay execution as failed
      await storage.updateReplayExecution(replayExecution.id, {
        status: 'failed',
        completedAt: new Date(),
        resultsSummary: {
          error: error instanceof Error ? error.message : String(error)
        }
      });

      throw error;
    } finally {
      this.currentReplayId = null;
      this.originalTraces.clear();
      this.replayTraces.clear();
    }
  }

  private async replayWebhookEvent(
    webhookEvent: WebhookRecording,
    config: ReplayConfig
  ): Promise<{
    totalSteps: number;
    reproducibleSteps: number;
    hashMismatches: HashMismatch[];
    validationResults: ValidationResult[];
    errors: ReplayError[];
  }> {
    // Get original execution traces for this webhook
    const originalTraces = await storage.getExecutionTraces(webhookEvent.traceId);
    this.originalTraces.set(webhookEvent.traceId, originalTraces);

    const hashMismatches: HashMismatch[] = [];
    const validationResults: ValidationResult[] = [];
    const errors: ReplayError[] = [];
    let reproducibleSteps = 0;

    // Replay each step
    for (const originalTrace of originalTraces) {
      try {
        const replayResult = await this.replayExecutionStep(
          originalTrace,
          webhookEvent,
          config
        );

        if (replayResult.isReproducible) {
          reproducibleSteps++;
        } else {
          hashMismatches.push(replayResult.hashMismatch!);
        }

        validationResults.push(...replayResult.validations);

        // Save validation results
        for (const validation of replayResult.validations) {
          await storage.saveTraceValidation({
            replayExecutionId: this.currentReplayId!,
            stepName: originalTrace.stepName,
            validationType: validation.validationType,
            isValid: validation.isValid,
            confidence: validation.confidence,
            originalValue: validation.details.original,
            replayValue: validation.details.replay,
            difference: validation.details.difference,
            validationMethod: 'automated_replay',
            notes: validation.details.notes
          });
        }

      } catch (error) {
        errors.push({
          stepName: originalTrace.stepName,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          recoverable: true
        });
      }
    }

    return {
      totalSteps: originalTraces.length,
      reproducibleSteps,
      hashMismatches,
      validationResults,
      errors
    };
  }

  private async replayExecutionStep(
    originalTrace: ExecutionTrace,
    webhookEvent: WebhookRecording,
    config: ReplayConfig
  ): Promise<{
    isReproducible: boolean;
    hashMismatch?: HashMismatch;
    validations: ValidationResult[];
  }> {
    const validations: ValidationResult[] = [];

    // Simulate the step execution based on step name
    let replayOutput: any;
    let replayHash: string;

    try {
      switch (originalTrace.stepName) {
        case 'webhook_parse':
          replayOutput = await this.replayWebhookParse(
            originalTrace.inputData,
            config
          );
          break;

        case 'metrics_calc':
          replayOutput = await this.replayMetricsCalculation(
            originalTrace.inputData,
            config
          );
          break;

        case 'decision_make':
          replayOutput = await this.replayDecisionMaking(
            originalTrace.inputData,
            config
          );
          break;

        case 'response_send':
          replayOutput = await this.replayResponseSending(
            originalTrace.inputData,
            config
          );
          break;

        case 'learning_update':
          replayOutput = await this.replayLearningUpdate(
            originalTrace.inputData,
            config
          );
          break;

        default:
          throw new Error(`Unknown step type: ${originalTrace.stepName}`);
      }

      // Calculate hash of replay output
      replayHash = this.calculateDeterministicHash(replayOutput);

      // Validate hash matching
      const hashMatches = replayHash === originalTrace.outputHash;
      
      validations.push({
        stepName: originalTrace.stepName,
        validationType: 'hash_match',
        isValid: hashMatches,
        confidence: 1.0,
        details: {
          original: originalTrace.outputHash,
          replay: replayHash,
          difference: hashMatches ? null : this.calculateDifference(
            originalTrace.outputData,
            replayOutput
          ),
          notes: hashMatches ? 'Hash match successful' : 'Hash mismatch detected'
        }
      });

      // Semantic validation (compare actual values)
      const semanticValidation = this.validateSemantic(
        originalTrace.outputData,
        replayOutput,
        originalTrace.stepName
      );
      validations.push(semanticValidation);

      return {
        isReproducible: hashMatches,
        hashMismatch: hashMatches ? undefined : {
          stepName: originalTrace.stepName,
          originalHash: originalTrace.outputHash,
          replayHash,
          difference: this.calculateDifference(originalTrace.outputData, replayOutput),
          severity: this.determineSeverity(originalTrace.stepName, originalTrace.outputData, replayOutput)
        },
        validations
      };

    } catch (error) {
      validations.push({
        stepName: originalTrace.stepName,
        validationType: 'execution_error',
        isValid: false,
        confidence: 0.0,
        details: {
          original: originalTrace.outputData,
          replay: null,
          difference: null,
          notes: `Execution failed: ${error instanceof Error ? error.message : String(error)}`
        }
      });

      return {
        isReproducible: false,
        hashMismatch: {
          stepName: originalTrace.stepName,
          originalHash: originalTrace.outputHash,
          replayHash: 'execution_failed',
          difference: { error: error instanceof Error ? error.message : String(error) },
          severity: 'critical'
        },
        validations
      };
    }
  }

  private async replayWebhookParse(inputData: any, config: ReplayConfig): Promise<any> {
    // Replay webhook parsing step
    const message = whatsappService.parseWebhookMessage(inputData.webhookData);
    return { message, parsed: true };
  }

  private async replayMetricsCalculation(inputData: any, config: ReplayConfig): Promise<any> {
    // Replay metrics calculation step
    const { conversationId, messages, previousMetrics } = inputData;
    
    const result = await metricsService.calculateMetrics(
      conversationId,
      messages,
      previousMetrics
    );
    
    return result;
  }

  private async replayDecisionMaking(inputData: any, config: ReplayConfig): Promise<any> {
    // Replay decision making step
    const { decisionContext } = inputData;
    
    const selectedQuestion = await decisionService.selectOptimalQuestion(decisionContext);
    
    return { selectedQuestion };
  }

  private async replayResponseSending(inputData: any, config: ReplayConfig): Promise<any> {
    if (config.skipExternalAPIs) {
      // Simulate response sending without actual API call
      return { sent: true, simulated: true };
    }
    
    // Actually send (for non-production replay)
    const { to, message } = inputData;
    const sent = await whatsappService.sendMessage(to, message);
    return { sent };
  }

  private async replayLearningUpdate(inputData: any, config: ReplayConfig): Promise<any> {
    // Replay learning update step
    const { learningUpdate } = inputData;
    
    const updatedState = await learningService.updateMetric(learningUpdate);
    
    return { updatedState };
  }

  private calculateDeterministicHash(data: any): string {
    // Use same hash calculation as recording service
    if (recordingService && typeof recordingService['calculateHash'] === 'function') {
      return (recordingService as any).calculateHash(data);
    }
    return createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }

  private validateSemantic(original: any, replay: any, stepName: string): ValidationResult {
    // Perform semantic validation based on step type
    let isValid = true;
    let confidence = 1.0;
    let details: any = {};

    switch (stepName) {
      case 'metrics_calc':
        isValid = this.validateMetricsEquivalence(original, replay);
        confidence = isValid ? 1.0 : 0.5;
        details = {
          original: original,
          replay: replay,
          difference: isValid ? null : this.calculateDifference(original, replay),
          notes: isValid ? 'Metrics calculation reproduced exactly' : 'Minor metric variations detected'
        };
        break;

      case 'decision_make':
        isValid = this.validateDecisionEquivalence(original, replay);
        confidence = isValid ? 1.0 : 0.3;
        details = {
          original: original.selectedQuestion?.question?.questionText,
          replay: replay.selectedQuestion?.question?.questionText,
          difference: isValid ? null : 'Different question selected',
          notes: isValid ? 'Same decision made' : 'Decision diverged'
        };
        break;

      default:
        // Generic deep equality check
        isValid = JSON.stringify(original) === JSON.stringify(replay);
        confidence = isValid ? 1.0 : 0.8;
        details = {
          original,
          replay,
          difference: isValid ? null : this.calculateDifference(original, replay),
          notes: isValid ? 'Perfect match' : 'Some differences detected'
        };
    }

    return {
      stepName,
      validationType: 'semantic_equivalence',
      isValid,
      confidence,
      details
    };
  }

  private validateMetricsEquivalence(original: any, replay: any): boolean {
    // Allow small floating point differences in metrics
    const threshold = 0.001;
    
    if (!original?.metrics || !replay?.metrics) {
      return false;
    }

    const originalMetrics = original.metrics;
    const replayMetrics = replay.metrics;

    // Check all numeric metrics within threshold
    for (const key in originalMetrics) {
      const origValue = originalMetrics[key];
      const replayValue = replayMetrics[key];

      if (typeof origValue === 'number' && typeof replayValue === 'number') {
        if (Math.abs(origValue - replayValue) > threshold) {
          return false;
        }
      } else if (origValue !== replayValue) {
        return false;
      }
    }

    return true;
  }

  private validateDecisionEquivalence(original: any, replay: any): boolean {
    return original?.selectedQuestion?.question?.questionText === 
           replay?.selectedQuestion?.question?.questionText;
  }

  private calculateDifference(original: any, replay: any): any {
    // Simple difference calculation for debugging
    if (typeof original !== typeof replay) {
      return { typeChange: { from: typeof original, to: typeof replay } };
    }

    if (typeof original === 'object' && original !== null) {
      const diff: any = {};
      const allKeys = new Set([...Object.keys(original), ...Object.keys(replay)]);
      
      for (const key of allKeys) {
        if (original[key] !== replay[key]) {
          diff[key] = { original: original[key], replay: replay[key] };
        }
      }
      
      return Object.keys(diff).length > 0 ? diff : null;
    }

    return original !== replay ? { original, replay } : null;
  }

  private determineSeverity(stepName: string, original: any, replay: any): 'minor' | 'major' | 'critical' {
    // Determine severity of differences based on step type and magnitude
    if (stepName === 'decision_make') {
      return 'major'; // Different decisions are always major
    }

    if (stepName === 'metrics_calc') {
      // Check if metric differences are significant
      const diff = this.calculateDifference(original, replay);
      if (diff && Object.keys(diff).length > 5) {
        return 'major';
      }
      return 'minor';
    }

    return 'minor';
  }

  // Public utility methods
  async getReplayResult(replayExecutionId: string): Promise<ReplayExecution | undefined> {
    return await storage.getReplayExecution(replayExecutionId);
  }

  async getValidationResults(replayExecutionId: string): Promise<TraceValidation[]> {
    return await storage.getTraceValidations(replayExecutionId);
  }

  updateConfig(newConfig: Partial<ReplayConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

export const replayEngine = new ReplayEngine();