import { nanoid } from "nanoid";
import { recordingService } from "./recording";

export interface TraceContext {
  traceId: string;
  parentId?: string;
  operation: string;
  conversationId: string;
  startTime: number;
  metadata: Record<string, any>;
}

export interface SpanContext {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'pending' | 'success' | 'error';
  tags: Record<string, any>;
  logs: LogEntry[];
  errors: ErrorEntry[];
}

export interface LogEntry {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: any;
}

export interface ErrorEntry {
  timestamp: number;
  error: string;
  stack?: string;
  recoverable: boolean;
}

export class TracingService {
  private activeTraces: Map<string, TraceContext> = new Map();
  private activeSpans: Map<string, SpanContext> = new Map();
  private enableStructuredLogging = true;
  private enableRecording = true;
  private latencyHistograms: Map<string, number[]> = new Map();
  private errorCounts: Map<string, number> = new Map();

  startTrace(
    operation: string,
    conversationId: string,
    metadata: Record<string, any> = {}
  ): string {
    const traceId = `trace_${nanoid()}`;
    
    const trace: TraceContext = {
      traceId,
      operation,
      conversationId,
      startTime: Date.now(),
      metadata: {
        ...metadata,
        startedAt: new Date().toISOString()
      }
    };

    this.activeTraces.set(traceId, trace);

    if (this.enableStructuredLogging) {
      this.log('info', 'trace_started', {
        traceId,
        operation,
        conversationId,
        metadata
      });
    }

    return traceId;
  }

  startSpan(
    traceId: string,
    operationName: string,
    parentSpanId?: string,
    tags: Record<string, any> = {}
  ): string {
    const spanId = `span_${nanoid()}`;
    
    const span: SpanContext = {
      spanId,
      traceId,
      parentSpanId,
      operationName,
      startTime: Date.now(),
      status: 'pending',
      tags: {
        ...tags,
        startedAt: new Date().toISOString()
      },
      logs: [],
      errors: []
    };

    this.activeSpans.set(spanId, span);

    if (this.enableStructuredLogging) {
      this.log('debug', 'span_started', {
        spanId,
        traceId,
        operationName,
        parentSpanId,
        tags
      });
    }

    return spanId;
  }

  finishSpan(
    spanId: string,
    status: 'success' | 'error' = 'success',
    result?: any,
    error?: Error
  ): SpanContext | null {
    const span = this.activeSpans.get(spanId);
    if (!span) {
      this.log('warn', 'span_not_found', { spanId });
      return null;
    }

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = status;

    if (result) {
      span.tags.result = result;
    }

    if (error) {
      span.errors.push({
        timestamp: Date.now(),
        error: error.message,
        stack: error.stack,
        recoverable: false
      });
    }

    // Record execution step if recording is active
    if (this.enableRecording && recordingService.isRecordingActive()) {
      recordingService.recordExecutionStep({
        stepName: span.operationName,
        stepOrder: 0, // Will be set by recording service
        input: span.tags.input || {},
        output: result || {},
        executionTimeMs: span.duration,
        error: error ? {
          occurred: true,
          message: error.message,
          stack: error.stack
        } : undefined,
        externalCalls: span.tags.externalCalls || []
      }).catch(err => {
        this.log('error', 'recording_failed', {
          spanId,
          error: err.message
        });
      });
    }

    this.activeSpans.delete(spanId);

    if (this.enableStructuredLogging) {
      this.log(status === 'error' ? 'error' : 'info', 'span_finished', {
        spanId,
        traceId: span.traceId,
        operationName: span.operationName,
        duration: span.duration,
        status,
        error: error?.message
      });
    }

    return span;
  }

  finishTrace(traceId: string): TraceContext | null {
    const trace = this.activeTraces.get(traceId);
    if (!trace) {
      this.log('warn', 'trace_not_found', { traceId });
      return null;
    }

    // Finish any remaining spans for this trace
    const remainingSpans = Array.from(this.activeSpans.values())
      .filter(span => span.traceId === traceId);

    remainingSpans.forEach(span => {
      this.finishSpan(span.spanId, 'success');
    });

    this.activeTraces.delete(traceId);

    if (this.enableStructuredLogging) {
      this.log('info', 'trace_finished', {
        traceId,
        operation: trace.operation,
        conversationId: trace.conversationId,
        duration: Date.now() - trace.startTime,
        spansProcessed: remainingSpans.length
      });
    }

    return trace;
  }

  addSpanLog(
    spanId: string,
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    data?: any
  ): void {
    const span = this.activeSpans.get(spanId);
    if (!span) {
      this.log('warn', 'span_not_found_for_log', { spanId, message });
      return;
    }

    span.logs.push({
      timestamp: Date.now(),
      level,
      message,
      data
    });

    if (this.enableStructuredLogging) {
      this.log(level, 'span_log', {
        spanId,
        traceId: span.traceId,
        message,
        data
      });
    }
  }

  addSpanTag(spanId: string, key: string, value: any): void {
    const span = this.activeSpans.get(spanId);
    if (span) {
      span.tags[key] = value;
    }
  }

  getActiveTrace(traceId: string): TraceContext | undefined {
    return this.activeTraces.get(traceId);
  }

  getActiveSpan(spanId: string): SpanContext | undefined {
    return this.activeSpans.get(spanId);
  }

  getCurrentTraceId(): string | null {
    // Get the most recent trace ID (simple implementation)
    const traces = Array.from(this.activeTraces.values());
    if (traces.length === 0) return null;
    
    return traces[traces.length - 1].traceId;
  }

  // Utility methods for tracing function executions
  async traceFunction<T>(
    traceId: string,
    operationName: string,
    fn: () => Promise<T>,
    input?: any,
    parentSpanId?: string
  ): Promise<T> {
    const spanId = this.startSpan(traceId, operationName, parentSpanId, { input });
    
    try {
      const result = await fn();
      this.finishSpan(spanId, 'success', result);
      return result;
    } catch (error) {
      this.finishSpan(spanId, 'error', undefined, error as Error);
      throw error;
    }
  }

  traceFunctionSync<T>(
    traceId: string,
    operationName: string,
    fn: () => T,
    input?: any,
    parentSpanId?: string
  ): T {
    const spanId = this.startSpan(traceId, operationName, parentSpanId, { input });
    
    try {
      const result = fn();
      this.finishSpan(spanId, 'success', result);
      return result;
    } catch (error) {
      this.finishSpan(spanId, 'error', undefined, error as Error);
      throw error;
    }
  }

  // Structured logging
  private log(
    level: 'debug' | 'info' | 'warn' | 'error',
    event: string,
    data: any
  ): void {
    if (!this.enableStructuredLogging) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      data,
      service: 'replay-harness'
    };

    // In production, this would go to a proper logging system
    console.log(JSON.stringify(logEntry));
  }

  // Configuration
  enableLogging(enabled: boolean): void {
    this.enableStructuredLogging = enabled;
  }

  enableRecordingIntegration(enabled: boolean): void {
    this.enableRecording = enabled;
  }

  // Cleanup
  cleanup(): void {
    this.activeTraces.clear();
    this.activeSpans.clear();
  }

  // Enhanced logging with PII scrubbing
  logStructured(level: 'debug' | 'info' | 'warn' | 'error', event: string, data: any): void {
    if (!this.enableStructuredLogging) return;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      data: this.scrubSensitiveData(data)
    };
    
    console.log(JSON.stringify(logEntry));
  }

  // PII scrubbing functionality
  scrubSensitiveData(data: any): any {
    if (!data || typeof data !== 'object') return data;
    
    const scrubbed = JSON.parse(JSON.stringify(data));
    
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'authorization', 'auth', 'phone', 'email', 'whatsappId'];
    const phoneRegex = /\+?[1-9]\d{1,14}/g;
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    
    const scrubObject = (obj: any, path = ''): any => {
      if (Array.isArray(obj)) {
        return obj.map((item, index) => scrubObject(item, `${path}[${index}]`));
      }
      
      if (obj && typeof obj === 'object') {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
          const lowerKey = key.toLowerCase();
          if (sensitiveKeys.some(sensitiveKey => lowerKey.includes(sensitiveKey))) {
            result[key] = '[REDACTED]';
          } else if (typeof value === 'string') {
            let scrubbedValue = value;
            scrubbedValue = scrubbedValue.replace(phoneRegex, '[PHONE_REDACTED]');
            scrubbedValue = scrubbedValue.replace(emailRegex, '[EMAIL_REDACTED]');
            result[key] = scrubbedValue;
          } else {
            result[key] = scrubObject(value, `${path}.${key}`);
          }
        }
        return result;
      }
      
      return obj;
    };
    
    return scrubObject(scrubbed);
  }

  // Performance monitoring
  recordLatency(method: string, path: string, duration: number): void {
    const key = `${method}_${path}`;
    
    if (!this.latencyHistograms.has(key)) {
      this.latencyHistograms.set(key, []);
    }
    
    const histogram = this.latencyHistograms.get(key)!;
    histogram.push(duration);
    
    // Keep only last 1000 measurements to prevent memory leaks
    if (histogram.length > 1000) {
      histogram.shift();
    }
    
    // Log slow requests (> 2000ms)
    if (duration > 2000) {
      this.logStructured('warn', 'slow_request_detected', {
        method,
        path,
        duration,
        threshold: 2000
      });
    }
  }

  // Error correlation tracking
  recordError(method: string, path: string, error: Error, traceId?: string): void {
    const key = `${method}_${path}`;
    const currentCount = this.errorCounts.get(key) || 0;
    this.errorCounts.set(key, currentCount + 1);
    
    this.logStructured('error', 'request_error', {
      method,
      path,
      error: error.message,
      stack: error.stack,
      traceId,
      errorCount: currentCount + 1
    });
  }

  // Performance statistics
  getLatencyStats(method?: string, path?: string): any {
    const results: any = {};
    
    for (const [key, histogram] of this.latencyHistograms.entries()) {
      if (method && path && key !== `${method}_${path}`) continue;
      if (method && !path && !key.startsWith(method)) continue;
      
      if (histogram.length === 0) continue;
      
      const sorted = [...histogram].sort((a, b) => a - b);
      results[key] = {
        count: histogram.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        avg: sorted.reduce((a, b) => a + b, 0) / sorted.length,
        p50: sorted[Math.floor(sorted.length * 0.5)],
        p95: sorted[Math.floor(sorted.length * 0.95)],
        p99: sorted[Math.floor(sorted.length * 0.99)]
      };
    }
    
    return results;
  }

  // Error statistics
  getErrorStats(): any {
    const results: any = {};
    for (const [key, count] of this.errorCounts.entries()) {
      results[key] = { errorCount: count };
    }
    return results;
  }

  // Stats
  getStats(): {
    activeTraces: number;
    activeSpans: number;
    totalProcessed: number;
    latencyEndpoints: number;
    errorEndpoints: number;
  } {
    return {
      activeTraces: this.activeTraces.size,
      activeSpans: this.activeSpans.size,
      totalProcessed: 0, // Would track this in production
      latencyEndpoints: this.latencyHistograms.size,
      errorEndpoints: this.errorCounts.size
    };
  }
}

export const tracingService = new TracingService();