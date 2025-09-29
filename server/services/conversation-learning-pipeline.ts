// Conversation Learning Pipeline - Processes completed conversations to extract knowledge
// and continuously improve the knowledge graph for better decision-making
import { knowledgeGraphService } from "./knowledge-graph";
import { xaiService } from "./xai";
import { storage } from "../storage";
import type { 
  Conversation, 
  Message, 
  ConversationMetrics,
  KnowledgeExtraction 
} from "@shared/schema";
import { nanoid } from "nanoid";

export interface ConversationAnalysisResult {
  conversationId: string;
  extractionId: string;
  entitiesExtracted: number;
  relationshipsFound: number;
  patternsIdentified: string[];
  qualityScore: number;
  processingTimeMs: number;
  outcome: 'qualified' | 'unqualified' | 'in_progress';
  insights: string[];
  graphUpdates: {
    nodesUpdated: number;
    edgesCreated: number;
    patternsReinforced: number;
  };
}

export interface PipelineConfig {
  processNewConversations: boolean;
  processUpdatedConversations: boolean;
  minConversationLength: number;
  qualityThreshold: number;
  batchSize: number;
  maxProcessingTimeMs: number;
}

export class ConversationLearningPipeline {
  private isProcessing = false;
  private config: PipelineConfig = {
    processNewConversations: true,
    processUpdatedConversations: true,
    minConversationLength: 3, // Minimum messages to process
    qualityThreshold: 0.6, // Minimum confidence to accept extractions
    batchSize: 10, // Process 10 conversations at a time
    maxProcessingTimeMs: 30000 // 30 second timeout per conversation
  };

  /**
   * Process a single conversation for knowledge extraction
   */
  async processConversation(conversationId: string): Promise<ConversationAnalysisResult> {
    const startTime = Date.now();
    const extractionId = nanoid();

    try {
      // Get conversation data
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      const messages = await storage.getMessages(conversationId);
      const metrics = await storage.getLatestMetrics(conversationId);

      // Skip if conversation too short
      if (messages.length < this.config.minConversationLength) {
        return this.createSkippedResult(conversationId, extractionId, 'Too short', startTime);
      }

      // Extract knowledge from conversation
      const messageContents = messages.map(m => m.content);
      const extractionResult = await knowledgeGraphService.extractKnowledgeFromConversation(
        conversationId,
        messageContents
      );

      // Process and validate extractions
      const validatedExtractions = await this.validateExtractions(
        extractionResult,
        conversation,
        messages,
        metrics
      );

      // Update knowledge graph with validated extractions
      const graphUpdates = await this.updateKnowledgeGraph(
        validatedExtractions,
        conversation,
        metrics
      );

      // Analyze conversation patterns
      const patterns = await this.identifyConversationPatterns(
        conversation,
        messages,
        metrics,
        extractionResult
      );

      // Determine conversation outcome
      const outcome = this.determineConversationOutcome(conversation, metrics);

      // Store extraction record
      await this.storeExtractionRecord(
        extractionId,
        conversationId,
        extractionResult,
        validatedExtractions,
        patterns,
        outcome
      );

      // Update graph analytics
      await this.updateGraphAnalytics(patterns, graphUpdates, outcome);

      const processingTimeMs = Date.now() - startTime;

      return {
        conversationId,
        extractionId,
        entitiesExtracted: validatedExtractions.entities.length,
        relationshipsFound: validatedExtractions.relationships.length,
        patternsIdentified: patterns,
        qualityScore: validatedExtractions.qualityScore,
        processingTimeMs,
        outcome,
        insights: validatedExtractions.insights,
        graphUpdates: {
          nodesUpdated: graphUpdates.nodesUpdated,
          edgesCreated: graphUpdates.edgesCreated,
          patternsReinforced: graphUpdates.patternsReinforced
        }
      };

    } catch (error) {
      console.error(`Error processing conversation ${conversationId}:`, error);
      return this.createErrorResult(conversationId, extractionId, (error as Error).message, startTime);
    }
  }

  /**
   * Process multiple conversations in batch
   */
  async processBatch(conversationIds: string[]): Promise<ConversationAnalysisResult[]> {
    if (this.isProcessing) {
      throw new Error('Pipeline is already processing');
    }

    this.isProcessing = true;
    const results: ConversationAnalysisResult[] = [];

    try {
      // Process in smaller batches to prevent overwhelming the system
      for (let i = 0; i < conversationIds.length; i += this.config.batchSize) {
        const batch = conversationIds.slice(i, i + this.config.batchSize);
        
        // Process batch in parallel with timeout
        const batchPromises = batch.map(async (id) => {
          return Promise.race([
            this.processConversation(id),
            new Promise<ConversationAnalysisResult>((_, reject) => 
              setTimeout(() => reject(new Error('Processing timeout')), this.config.maxProcessingTimeMs)
            )
          ]);
        });

        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            results.push(this.createErrorResult(
              batch[index], 
              nanoid(), 
              result.reason.message, 
              Date.now()
            ));
          }
        });

        // Small delay between batches to prevent overloading
        if (i + this.config.batchSize < conversationIds.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      return results;

    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process all eligible conversations for learning
   */
  async processAllEligibleConversations(): Promise<{
    processed: number;
    successful: number;
    failed: number;
    skipped: number;
    totalProcessingTimeMs: number;
  }> {
    const startTime = Date.now();

    // Get conversations that need processing
    const eligibleConversations = await this.getEligibleConversations();
    
    if (eligibleConversations.length === 0) {
      return {
        processed: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        totalProcessingTimeMs: Date.now() - startTime
      };
    }

    // Process in batches
    const results = await this.processBatch(eligibleConversations);

    // Aggregate results
    const stats = results.reduce((acc, result) => {
      acc.processed++;
      if (result.qualityScore > 0) {
        acc.successful++;
      } else if (result.insights.includes('skipped')) {
        acc.skipped++;
      } else {
        acc.failed++;
      }
      return acc;
    }, { processed: 0, successful: 0, failed: 0, skipped: 0 });

    return {
      ...stats,
      totalProcessingTimeMs: Date.now() - startTime
    };
  }

  /**
   * Validate extracted knowledge for quality
   */
  private async validateExtractions(
    extractionResult: any,
    conversation: Conversation,
    messages: Message[],
    metrics: ConversationMetrics | undefined
  ): Promise<any> {
    // Filter entities by confidence threshold
    const validEntities = extractionResult.entities.filter(
      (entity: any) => entity.confidence >= this.config.qualityThreshold
    );

    // Filter relationships by confidence threshold
    const validRelationships = extractionResult.relationships.filter(
      (rel: any) => rel.confidence >= this.config.qualityThreshold
    );

    // Calculate overall quality score
    const qualityScore = this.calculateQualityScore(
      validEntities,
      validRelationships,
      extractionResult,
      conversation,
      messages
    );

    // Generate insights
    const insights = this.generateExtractionInsights(
      validEntities,
      validRelationships,
      conversation,
      metrics
    );

    return {
      entities: validEntities,
      relationships: validRelationships,
      qualityScore,
      insights,
      originalExtraction: extractionResult
    };
  }

  /**
   * Update knowledge graph with validated extractions
   */
  private async updateKnowledgeGraph(
    validatedExtractions: any,
    conversation: Conversation,
    metrics: ConversationMetrics | undefined
  ): Promise<{ nodesUpdated: number; edgesCreated: number; patternsReinforced: number }> {
    // Use the public updateKnowledgeGraph method from KnowledgeGraphService
    const outcome = this.determineConversationOutcome(conversation, metrics);
    
    const result = await knowledgeGraphService.updateKnowledgeGraph(
      validatedExtractions.entities,
      validatedExtractions.relationships,
      conversation.id,
      outcome
    );

    return {
      nodesUpdated: result.entitiesExtracted,
      edgesCreated: result.relationshipsExtracted,
      patternsReinforced: result.patternsIdentified.length
    };
  }

  /**
   * Identify conversation patterns for learning
   */
  private async identifyConversationPatterns(
    conversation: Conversation,
    messages: Message[],
    metrics: ConversationMetrics | undefined,
    extractionResult: any
  ): Promise<string[]> {
    const patterns: string[] = [];

    // Analyze conversation flow patterns
    const messageTypes = messages.map(m => m.direction || 'unknown').join('-');
    patterns.push(`flow:${messageTypes.substring(0, 20)}`);

    // Analyze entity patterns
    const entityTypes = extractionResult.entities.map((e: any) => e.entityType);
    const uniqueEntityTypes = Array.from(new Set(entityTypes));
    if (uniqueEntityTypes.length > 0) {
      patterns.push(`entities:${uniqueEntityTypes.join(',')}`);
    }

    // Analyze qualification patterns
    if (metrics?.qualificationScore && metrics.qualificationScore > 0.7) {
      patterns.push('high-qualification');
    }

    // Analyze engagement patterns
    if (metrics?.engagementScore && metrics.engagementScore > 0.7) {
      patterns.push('high-engagement');
    }

    // Analyze conversation length patterns
    if (messages.length > 10) {
      patterns.push('extended-conversation');
    }

    // Analyze Spanish/LATAM cultural patterns
    const spanishIndicators = messages.some(m => 
      m.content?.includes('gracias') || 
      m.content?.includes('empresa') ||
      m.content?.includes('negocio')
    );
    if (spanishIndicators) {
      patterns.push('spanish-latam');
    }

    return patterns;
  }

  /**
   * Determine conversation outcome for pattern reinforcement
   */
  private determineConversationOutcome(
    conversation: Conversation,
    metrics: ConversationMetrics | ConversationMetrics[] | undefined
  ): 'qualified' | 'unqualified' | 'in_progress' {
    if (conversation.status === 'completed') {
      const latestMetrics = Array.isArray(metrics) ? metrics[metrics.length - 1] : metrics;
      if (latestMetrics?.qualificationScore && latestMetrics.qualificationScore > 0.7) {
        return 'qualified';
      }
      return 'unqualified';
    }
    return 'in_progress';
  }

  /**
   * Get conversations eligible for processing
   */
  private async getEligibleConversations(): Promise<string[]> {
    // Get conversations that haven't been processed or have been updated since last processing
    const conversations = await storage.getActiveConversations(); // Get active conversations for processing
    
    const eligible: string[] = [];
    
    for (const conv of conversations) {
      // Check if already processed
      const existingExtractions = await storage.getKnowledgeExtractions(conv.id);
      
      if (existingExtractions.length === 0 && this.config.processNewConversations) {
        eligible.push(conv.id);
      } else if (existingExtractions.length > 0 && this.config.processUpdatedConversations) {
        // Check if conversation has been updated since last extraction
        const lastExtraction = existingExtractions[0];
        if (conv.lastActivity && lastExtraction.timestamp && 
            conv.lastActivity > lastExtraction.timestamp) {
          eligible.push(conv.id);
        }
      }
    }
    
    return eligible;
  }

  /**
   * Store extraction record for auditing and quality tracking
   */
  private async storeExtractionRecord(
    extractionId: string,
    conversationId: string,
    extractionResult: any,
    validatedExtractions: any,
    patterns: string[],
    outcome: string
  ): Promise<void> {
    const extraction = {
      id: extractionId,
      conversationId,
      extractedData: {
        entities: validatedExtractions.entities,
        relationships: validatedExtractions.relationships,
        patterns,
        outcome
      },
      confidence: validatedExtractions.qualityScore,
      status: validatedExtractions.qualityScore >= this.config.qualityThreshold ? 'accepted' : 'rejected',
      timestamp: new Date(),
      processingVersion: '2.0.0',
      validationResults: {
        entitiesValidated: validatedExtractions.entities.length,
        relationshipsValidated: validatedExtractions.relationships.length,
        qualityThreshold: this.config.qualityThreshold,
        overallScore: validatedExtractions.qualityScore
      }
    };

    await storage.saveKnowledgeExtraction(extraction);
  }

  /**
   * Update graph analytics with processing results
   */
  private async updateGraphAnalytics(
    patterns: string[],
    graphUpdates: any,
    outcome: string
  ): Promise<void> {
    const analytics = {
      analysisType: 'conversation_learning',
      metrics: {
        patternsIdentified: patterns.length,
        nodesUpdated: graphUpdates.nodesUpdated,
        edgesCreated: graphUpdates.edgesCreated,
        patternsReinforced: graphUpdates.patternsReinforced,
        outcome
      },
      insights: patterns,
      confidence: 0.8,
      timestamp: new Date()
    };

    await storage.saveGraphAnalytics(analytics);
  }

  /**
   * Calculate quality score for extracted knowledge
   */
  private calculateQualityScore(
    entities: any[],
    relationships: any[],
    extractionResult: any,
    conversation: Conversation,
    messages: Message[]
  ): number {
    let score = 0;

    // Base score from entity confidence
    if (entities.length > 0) {
      const avgEntityConfidence = entities.reduce((sum, e) => sum + e.confidence, 0) / entities.length;
      score += avgEntityConfidence * 0.4;
    }

    // Relationship confidence
    if (relationships.length > 0) {
      const avgRelConfidence = relationships.reduce((sum, r) => sum + r.confidence, 0) / relationships.length;
      score += avgRelConfidence * 0.3;
    }

    // Conversation completeness
    if (messages.length >= 5) {
      score += 0.2;
    }

    // Business relevance (entities that indicate business value)
    const businessEntities = entities.filter(e => 
      ['company', 'technology', 'budget', 'timeline'].includes(e.entityType)
    );
    if (businessEntities.length > 0) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Generate insights from extraction results
   */
  private generateExtractionInsights(
    entities: any[],
    relationships: any[],
    conversation: Conversation,
    metrics: ConversationMetrics | undefined
  ): string[] {
    const insights: string[] = [];

    if (entities.length === 0) {
      insights.push('No high-confidence entities extracted');
    } else {
      insights.push(`Extracted ${entities.length} high-confidence entities`);
    }

    if (relationships.length > 0) {
      insights.push(`Found ${relationships.length} entity relationships`);
    }

    const businessEntities = entities.filter(e => 
      ['company', 'technology', 'budget'].includes(e.entityType)
    );
    if (businessEntities.length > 0) {
      insights.push(`Identified ${businessEntities.length} business-relevant entities`);
    }

    if (metrics?.qualificationScore && metrics.qualificationScore > 0.7) {
      insights.push('High qualification score supports knowledge extraction');
    }

    return insights;
  }

  /**
   * Create result for skipped conversations
   */
  private createSkippedResult(
    conversationId: string,
    extractionId: string,
    reason: string,
    startTime: number
  ): ConversationAnalysisResult {
    return {
      conversationId,
      extractionId,
      entitiesExtracted: 0,
      relationshipsFound: 0,
      patternsIdentified: [],
      qualityScore: 0,
      processingTimeMs: Date.now() - startTime,
      outcome: 'in_progress',
      insights: [`skipped: ${reason}`],
      graphUpdates: {
        nodesUpdated: 0,
        edgesCreated: 0,
        patternsReinforced: 0
      }
    };
  }

  /**
   * Create result for error cases
   */
  private createErrorResult(
    conversationId: string,
    extractionId: string,
    error: string,
    startTime: number
  ): ConversationAnalysisResult {
    return {
      conversationId,
      extractionId,
      entitiesExtracted: 0,
      relationshipsFound: 0,
      patternsIdentified: [],
      qualityScore: 0,
      processingTimeMs: Date.now() - startTime,
      outcome: 'in_progress',
      insights: [`error: ${error}`],
      graphUpdates: {
        nodesUpdated: 0,
        edgesCreated: 0,
        patternsReinforced: 0
      }
    };
  }

  /**
   * Update pipeline configuration
   */
  updateConfig(newConfig: Partial<PipelineConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current pipeline status
   */
  getStatus(): { isProcessing: boolean; config: PipelineConfig } {
    return {
      isProcessing: this.isProcessing,
      config: this.config
    };
  }
}

// Export singleton instance
export const conversationLearningPipeline = new ConversationLearningPipeline();