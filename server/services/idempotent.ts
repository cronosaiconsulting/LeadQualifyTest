import { createHash } from "crypto";
import { storage } from "../storage";
import { recordingService } from "./recording";
import type { ConversationMetrics } from "@shared/schema";

export interface ComputationRequest {
  operation: string;
  inputs: any;
  context: {
    conversationId: string;
    traceId?: string;
    timestamp: string;
  };
}

export interface ComputationResult {
  hash: string;
  result: any;
  cached: boolean;
  executionTime: number;
  timestamp: string;
  traceId?: string;
}

export interface CacheEntry {
  hash: string;
  result: any;
  timestamp: string;
  accessCount: number;
  lastAccessed: string;
  metadata: {
    operation: string;
    conversationId: string;
    traceId?: string;
  };
}

export class IdempotentComputeService {
  private cache: Map<string, CacheEntry> = new Map();
  private maxCacheSize = 10000;
  private cacheTTL = 24 * 60 * 60 * 1000; // 24 hours

  async compute<T>(request: ComputationRequest): Promise<ComputationResult> {
    const startTime = Date.now();
    
    // Generate deterministic hash from inputs
    const inputHash = this.computeInputHash(request);
    
    // Check if we have a cached result
    const cached = this.getFromCache(inputHash);
    if (cached) {
      return {
        hash: inputHash,
        result: cached.result,
        cached: true,
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        traceId: request.context.traceId
      };
    }

    // Execute the computation
    let result: T;
    let executionTime: number;

    try {
      const computeStart = Date.now();
      result = await this.executeComputation<T>(request);
      executionTime = Date.now() - computeStart;

      // Store in cache
      this.storeInCache(inputHash, result, request);

      return {
        hash: inputHash,
        result,
        cached: false,
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        traceId: request.context.traceId
      };

    } catch (error) {
      throw new Error(`Computation failed for ${request.operation}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private computeInputHash(request: ComputationRequest): string {
    // Create deterministic hash from operation and normalized inputs
    const normalized = this.normalizeInputs(request.inputs);
    const hashInput = {
      operation: request.operation,
      inputs: normalized
    };
    
    const jsonString = JSON.stringify(hashInput);
    return createHash('sha256').update(jsonString).digest('hex');
  }

  private normalizeInputs(inputs: any): any {
    if (inputs === null || inputs === undefined) {
      return inputs;
    }

    if (typeof inputs !== 'object') {
      return inputs;
    }

    if (Array.isArray(inputs)) {
      return inputs.map(item => this.normalizeInputs(item));
    }

    // Sort object keys and normalize values
    const normalized: any = {};
    Object.keys(inputs).sort().forEach(key => {
      // Skip non-deterministic fields
      if (this.shouldSkipField(key, inputs[key])) {
        return;
      }
      normalized[key] = this.normalizeInputs(inputs[key]);
    });

    return normalized;
  }

  private shouldSkipField(key: string, value: any): boolean {
    // Skip timestamp and other non-deterministic fields for idempotency
    const skipPatterns = [
      /timestamp/i,
      /created_?at/i,
      /updated_?at/i,
      /last_?activity/i,
      /execution_?time/i,
      /trace_?id/i,
      /request_?id/i
    ];

    return skipPatterns.some(pattern => pattern.test(key));
  }

  private getFromCache(hash: string): CacheEntry | null {
    const entry = this.cache.get(hash);
    
    if (!entry) {
      return null;
    }

    // Check if entry is expired
    const age = Date.now() - new Date(entry.timestamp).getTime();
    if (age > this.cacheTTL) {
      this.cache.delete(hash);
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = new Date().toISOString();

    return entry;
  }

  private storeInCache(hash: string, result: any, request: ComputationRequest): void {
    // Clean cache if it's getting too large
    if (this.cache.size >= this.maxCacheSize) {
      this.cleanupCache();
    }

    const entry: CacheEntry = {
      hash,
      result: JSON.parse(JSON.stringify(result)), // Deep copy
      timestamp: new Date().toISOString(),
      accessCount: 1,
      lastAccessed: new Date().toISOString(),
      metadata: {
        operation: request.operation,
        conversationId: request.context.conversationId,
        traceId: request.context.traceId
      }
    };

    this.cache.set(hash, entry);
  }

  private cleanupCache(): void {
    // Remove oldest entries first (LRU-style cleanup)
    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => new Date(a.lastAccessed).getTime() - new Date(b.lastAccessed).getTime());

    // Remove oldest 20% of entries
    const toRemove = Math.floor(entries.length * 0.2);
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }
  }

  private async executeComputation<T>(request: ComputationRequest): Promise<T> {
    // Route to appropriate computation based on operation type
    switch (request.operation) {
      case 'metrics_calculation':
        return this.computeMetrics(request) as Promise<T>;
        
      case 'decision_making':
        return this.computeDecision(request) as Promise<T>;
        
      case 'learning_update':
        return this.computeLearningUpdate(request) as Promise<T>;
        
      default:
        throw new Error(`Unknown operation type: ${request.operation}`);
    }
  }

  private async computeMetrics(request: ComputationRequest): Promise<any> {
    const { metricsService } = await import("./metrics");
    const { conversationId, messages, previousMetrics } = request.inputs;
    
    return await metricsService.calculateMetrics(
      conversationId,
      messages,
      previousMetrics
    );
  }

  private async computeDecision(request: ComputationRequest): Promise<any> {
    const { decisionService } = await import("./decision");
    const { decisionContext } = request.inputs;
    
    return await decisionService.selectOptimalQuestion(decisionContext);
  }

  private async computeLearningUpdate(request: ComputationRequest): Promise<any> {
    const { learningService } = await import("./learning");
    const { learningUpdate } = request.inputs;
    
    return await learningService.updateMetric(learningUpdate);
  }

  // Public utility methods
  getCacheStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    entries: number;
  } {
    const entries = Array.from(this.cache.values());
    const totalAccesses = entries.reduce((sum, entry) => sum + entry.accessCount, 0);
    const cacheHits = entries.reduce((sum, entry) => sum + (entry.accessCount - 1), 0);
    
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      hitRate: totalAccesses > 0 ? cacheHits / totalAccesses : 0,
      entries: this.cache.size
    };
  }

  clearCache(): void {
    this.cache.clear();
  }

  invalidateByConversation(conversationId: string): number {
    const toDelete: string[] = [];
    
    for (const [hash, entry] of this.cache.entries()) {
      if (entry.metadata.conversationId === conversationId) {
        toDelete.push(hash);
      }
    }
    
    toDelete.forEach(hash => this.cache.delete(hash));
    return toDelete.length;
  }

  updateConfig(config: {
    maxCacheSize?: number;
    cacheTTL?: number;
  }): void {
    if (config.maxCacheSize !== undefined) {
      this.maxCacheSize = config.maxCacheSize;
    }
    if (config.cacheTTL !== undefined) {
      this.cacheTTL = config.cacheTTL;
    }
  }
}

export const idempotentCompute = new IdempotentComputeService();