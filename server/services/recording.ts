import { nanoid } from "nanoid";
import { createHash } from "crypto";
import { storage } from "../storage";
import type { 
  InsertConversationRecording, 
  InsertWebhookRecording, 
  InsertExecutionTrace,
  ConversationRecording,
  WebhookRecording,
  ExecutionTrace 
} from "@shared/schema";

export interface RecordingConfig {
  enabled: boolean;
  piiScrubbing: boolean;
  hashValidation: boolean;
  externalApiCapture: boolean;
  maxWebhookEvents: number;
}

export interface StepContext {
  stepName: string;
  stepOrder: number;
  input: any;
  output: any;
  externalCalls?: ExternalApiCall[];
  executionTimeMs?: number;
  error?: {
    occurred: boolean;
    message?: string;
    stack?: string;
  };
}

export interface ExternalApiCall {
  service: string;
  method: string;
  url?: string;
  requestData?: any;
  responseData?: any;
  duration: number;
  timestamp: string;
  success: boolean;
}

export interface PIIScrubbingRules {
  phoneNumbers: boolean;
  emails: boolean;
  names: boolean;
  addresses: boolean;
  customPatterns: RegExp[];
}

export class RecordingService {
  private config: RecordingConfig;
  private piiRules: PIIScrubbingRules;
  private activeTraceId: string | null = null;
  private currentWebhookRecordingId: string | null = null;
  private stepCounter = 0;

  constructor(config?: Partial<RecordingConfig>) {
    this.config = {
      enabled: true,
      piiScrubbing: true,
      hashValidation: true,
      externalApiCapture: true,
      maxWebhookEvents: 1000,
      ...config
    };

    this.piiRules = {
      phoneNumbers: true,
      emails: true,
      names: true,
      addresses: true,
      customPatterns: [
        /\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/g, // Credit cards
        /\b\d{3}-\d{2}-\d{4}\b/g, // SSN-like patterns
      ]
    };
  }

  async startRecording(
    conversationId: string, 
    recordingName: string, 
    description?: string
  ): Promise<ConversationRecording> {
    if (!this.config.enabled) {
      throw new Error("Recording is disabled");
    }

    // Check if recording already exists
    const existing = await storage.getRecordingByName(recordingName);
    if (existing) {
      throw new Error(`Recording with name '${recordingName}' already exists`);
    }

    const recording = await storage.createRecording({
      conversationId,
      recordingName,
      description,
      status: "active",
      metadata: {
        config: this.config,
        startedAt: new Date().toISOString()
      }
    });

    return recording;
  }

  async recordWebhookEvent(
    recordingId: string,
    webhookData: any,
    conversationState: any
  ): Promise<WebhookRecording> {
    if (!this.config.enabled) {
      throw new Error("Recording is disabled");
    }

    // Generate new trace ID for this webhook event
    this.activeTraceId = `trace_${nanoid()}`;
    this.stepCounter = 0;

    // Calculate processing state hash
    const stateHash = this.calculateHash(conversationState);

    // Get next sequence number
    const existingRecordings = await storage.getWebhookRecordings(recordingId);
    const sequenceNumber = existingRecordings.length + 1;

    // Scrub PII if enabled
    const scrubbedData = this.config.piiScrubbing 
      ? this.scrubPII(webhookData) 
      : null;

    const webhookRecording = await storage.saveWebhookRecording({
      recordingId,
      traceId: this.activeTraceId,
      sequenceNumber,
      webhookData,
      processingStateHash: stateHash,
      piiStatus: this.config.piiScrubbing ? "scrubbed" : "raw",
      scrubbedWebhookData: scrubbedData
    });

    this.currentWebhookRecordingId = webhookRecording.id;
    return webhookRecording;
  }

  async recordExecutionStep(context: StepContext): Promise<ExecutionTrace> {
    if (!this.config.enabled || !this.activeTraceId) {
      throw new Error("No active recording session");
    }

    const inputHash = this.calculateHash(context.input);
    const outputHash = this.calculateHash(context.output);

    const trace = await storage.saveExecutionTrace({
      traceId: this.activeTraceId,
      webhookRecordingId: this.currentWebhookRecordingId,
      stepName: context.stepName,
      stepOrder: context.stepOrder || ++this.stepCounter,
      inputHash,
      outputHash,
      inputData: context.input,
      outputData: context.output,
      isReproducible: true, // Will be validated during replay
      executionTimeMs: context.executionTimeMs,
      externalCalls: context.externalCalls || [],
      errorOccurred: context.error?.occurred || false,
      errorMessage: context.error?.message,
      errorStack: context.error?.stack
    });

    return trace;
  }

  async finishRecording(): Promise<void> {
    this.activeTraceId = null;
    this.currentWebhookRecordingId = null;
    this.stepCounter = 0;
  }

  private calculateHash(data: any): string {
    if (!this.config.hashValidation) {
      return "hash_disabled";
    }

    // Create deterministic hash by sorting object keys
    const normalized = this.normalizeForHash(data);
    const jsonString = JSON.stringify(normalized);
    return createHash('sha256').update(jsonString).digest('hex');
  }

  private normalizeForHash(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.normalizeForHash(item));
    }

    // Sort object keys for consistent hashing
    const sorted: any = {};
    Object.keys(obj).sort().forEach(key => {
      // Skip timestamp fields and other non-deterministic data
      if (this.shouldSkipForHash(key, obj[key])) {
        return;
      }
      sorted[key] = this.normalizeForHash(obj[key]);
    });

    return sorted;
  }

  private shouldSkipForHash(key: string, value: any): boolean {
    // Skip timestamp and other non-deterministic fields
    const skipPatterns = [
      /timestamp/i,
      /created_?at/i,
      /updated_?at/i,
      /last_?activity/i,
      /duration/i,
      /execution_?time/i,
      /random/i,
      /uuid/i,
      /id$/i // Skip fields ending in 'id'
    ];

    return skipPatterns.some(pattern => pattern.test(key)) ||
           (typeof value === 'string' && value.includes('timestamp'));
  }

  scrubPII(data: any): any {
    if (!this.config.piiScrubbing) {
      return data;
    }

    const scrubbed = JSON.parse(JSON.stringify(data));
    return this.scrubPIIRecursive(scrubbed);
  }

  private scrubPIIRecursive(obj: any): any {
    if (typeof obj === 'string') {
      return this.scrubStringPII(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.scrubPIIRecursive(item));
    }

    if (typeof obj === 'object' && obj !== null) {
      const scrubbed: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Scrub key names that might contain PII
        if (this.isPIIField(key)) {
          scrubbed[key] = this.maskValue(value);
        } else {
          scrubbed[key] = this.scrubPIIRecursive(value);
        }
      }
      return scrubbed;
    }

    return obj;
  }

  private scrubStringPII(text: string): string {
    let scrubbed = text;

    if (this.piiRules.phoneNumbers) {
      // Phone numbers
      scrubbed = scrubbed.replace(
        /(\+?[\d\s\-\(\)]{10,})/g, 
        (match) => `[PHONE:${match.slice(0, 3)}***]`
      );
    }

    if (this.piiRules.emails) {
      // Email addresses
      scrubbed = scrubbed.replace(
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        (match) => `[EMAIL:${match.split('@')[0].slice(0, 2)}***@${match.split('@')[1]}]`
      );
    }

    // Custom patterns
    this.piiRules.customPatterns.forEach(pattern => {
      scrubbed = scrubbed.replace(pattern, '[REDACTED]');
    });

    return scrubbed;
  }

  private isPIIField(fieldName: string): boolean {
    const piiFields = [
      'name', 'contact_name', 'phone', 'email', 'address', 
      'whatsapp_id', 'contact_phone', 'full_name', 'first_name', 
      'last_name', 'profile_name'
    ];
    
    return piiFields.some(field => 
      fieldName.toLowerCase().includes(field.toLowerCase())
    );
  }

  private maskValue(value: any): string {
    if (typeof value === 'string') {
      return value.length > 3 
        ? `${value.slice(0, 2)}***${value.slice(-1)}`
        : '[MASKED]';
    }
    return '[MASKED]';
  }

  // Utility methods for external API call recording
  recordApiCall(call: ExternalApiCall): void {
    // This would be used by other services to record API calls
    // Implementation would depend on how services want to integrate
  }

  isRecordingActive(): boolean {
    return this.config.enabled && this.activeTraceId !== null;
  }

  getCurrentTraceId(): string | null {
    return this.activeTraceId;
  }

  updateConfig(newConfig: Partial<RecordingConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

export const recordingService = new RecordingService();