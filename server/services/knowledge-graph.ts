// KnowledgeGraph Service - Self-improving conversation intelligence using Graphology
// Extracts entities and relationships from Spanish conversations to improve decision-making
import Graph from "graphology";
import { NodeEntry, EdgeEntry } from "graphology-types";
import forceAtlas2 from "graphology-layout-forceatlas2";
import betweennessCentrality from "graphology-metrics/centrality/betweenness";
import closenessCentrality from "graphology-metrics/centrality/closeness";
import { density, order, size } from "graphology-metrics/graph";
import { connectedComponents } from "graphology-components";
import { shortestPath } from "graphology-shortest-path";
import { xaiService } from "./xai";
import { storage } from "../storage";
import { nanoid } from "nanoid";
import type { 
  InsertKnowledgeGraphNode, 
  InsertKnowledgeGraphEdge, 
  InsertKnowledgeExtraction,
  InsertGraphAnalytics,
  KnowledgeGraphNode,
  KnowledgeGraphEdge,
  EntityAttributes,
  SimilarCompanyQuery,
  SuccessPatternQuery,
  EntityInsightQuery
} from "@shared/schema";

export interface EntityExtractionResult {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
  confidence: number;
  culturalContext: any;
  extractionQuality: number;
}

export interface ExtractedEntity {
  entityId: string;
  entityType: 'company' | 'person' | 'technology' | 'pain_point' | 'solution' | 'industry' | 'region';
  entityName: string;
  canonicalName: string;
  attributes: EntityAttributes;
  confidence: number;
  source: {
    conversationId: string;
    messageId?: string;
    extractedText: string;
  };
  culturalMarkers: string[];
  regionalIndicators: string[];
}

export interface ExtractedRelationship {
  edgeId: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationshipType: 'works_at' | 'uses_technology' | 'has_budget' | 'needs_solution' | 'competing_with' | 'recommends' | 'previous_experience';
  strength: number;
  confidence: number;
  attributes: Record<string, any>;
  source: {
    conversationId: string;
    extractedText: string;
  };
}

export interface GraphAnalysisResult {
  nodeMetrics: {
    totalNodes: number;
    nodesByType: Record<string, number>;
    topNodesByCentrality: any;
  };
  edgeMetrics: {
    totalEdges: number;
    edgesByType: Record<string, number>;
    averageStrength: number;
  };
  networkMetrics: {
    density: number;
    connectedComponents: number;
    averageDegree: number;
    clusteringCoefficient: number;
  };
  successPatterns: any[];
  emergingPatterns: any[];
  qualityScore: number;
}

export interface ConversationLearningResult {
  entitiesExtracted: number;
  relationshipsExtracted: number;
  patternsIdentified: string[];
  qualityScore: number;
  graphVersionCreated: boolean;
  insights: string[];
}

export class KnowledgeGraphService {
  private graph: Graph;
  private currentVersion: string;
  
  constructor() {
    this.graph = new Graph();
    this.currentVersion = "1.0.0";
    this.initializeGraph();
  }

  /**
   * Initialize the knowledge graph from database state
   */
  async initializeGraph(): Promise<void> {
    try {
      // Load current version
      const currentVersion = await storage.getCurrentKnowledgeGraphVersion();
      if (currentVersion) {
        this.currentVersion = currentVersion.versionId;
        // Reconstruct graph from stored state
        await this.reconstructGraphFromVersion(currentVersion);
      }
    } catch (error) {
      console.error('Error initializing knowledge graph:', error);
    }
  }

  /**
   * Extract entities and relationships from conversation messages using xAI
   */
  async extractKnowledgeFromConversation(
    conversationId: string,
    messages: string[],
    conversationOutcome?: string
  ): Promise<EntityExtractionResult> {
    try {
      // Get conversation context for better extraction
      const conversation = await storage.getConversation(conversationId);
      const metrics = await storage.getLatestMetrics(conversationId);
      
      // Use xAI to extract entities and relationships with LATAM context
      const extractionPrompt = this.buildExtractionPrompt(messages, conversation, metrics);
      
      const extractionResult = await xaiService.extractKnowledgeEntities(
        extractionPrompt,
        conversation?.language || 'es'
      );

      // Process and validate extraction results
      const entities = await this.processExtractedEntities(
        extractionResult.entities,
        conversationId
      );
      
      const relationships = await this.processExtractedRelationships(
        extractionResult.relationships,
        conversationId
      );

      // Calculate cultural context and quality scores
      const culturalContext = await xaiService.analyzeLATAMCulturalContext(
        messages.join('\n'),
        messages
      );

      const extractionQuality = this.calculateExtractionQuality(
        entities,
        relationships,
        culturalContext
      );

      // Save extraction record for quality tracking
      await this.saveExtractionRecord(
        conversationId,
        entities,
        relationships,
        extractionQuality,
        culturalContext
      );

      return {
        entities,
        relationships,
        confidence: extractionResult.confidence,
        culturalContext,
        extractionQuality
      };
    } catch (error) {
      console.error('Error extracting knowledge from conversation:', error);
      throw error;
    }
  }

  /**
   * Update the knowledge graph with new entities and relationships
   */
  async updateKnowledgeGraph(
    entities: ExtractedEntity[],
    relationships: ExtractedRelationship[],
    conversationId: string,
    outcome?: string
  ): Promise<ConversationLearningResult> {
    try {
      let entitiesAdded = 0;
      let relationshipsAdded = 0;
      const insights: string[] = [];

      // Process entities
      for (const entity of entities) {
        const existingNode = await this.findOrCreateEntityNode(entity, conversationId);
        if (existingNode) {
          await this.updateEntityAttributes(existingNode, entity, outcome);
          entitiesAdded++;
        }
      }

      // Process relationships
      for (const relationship of relationships) {
        const existingEdge = await this.findOrCreateRelationshipEdge(relationship, conversationId);
        if (existingEdge) {
          await this.updateRelationshipStrength(existingEdge, relationship, outcome);
          relationshipsAdded++;
        }
      }

      // Identify new patterns based on outcome
      const patternsIdentified = await this.identifySuccessPatterns(
        entities,
        relationships,
        outcome
      );

      // Calculate overall quality score
      const qualityScore = await this.calculateGraphQuality();

      // Create new graph version if significant changes
      const shouldCreateVersion = entitiesAdded > 2 || relationshipsAdded > 3;
      let graphVersionCreated = false;
      
      if (shouldCreateVersion) {
        await this.createGraphVersion(
          `Conversation ${conversationId} learning`,
          'conversation_complete',
          conversationId
        );
        graphVersionCreated = true;
      }

      // Update in-memory graph
      await this.syncGraphWithDatabase();

      return {
        entitiesExtracted: entitiesAdded,
        relationshipsExtracted: relationshipsAdded,
        patternsIdentified,
        qualityScore,
        graphVersionCreated,
        insights
      };
    } catch (error) {
      console.error('Error updating knowledge graph:', error);
      throw error;
    }
  }

  /**
   * Find similar companies based on entity attributes and relationship patterns
   */
  async findSimilarCompanies(query: SimilarCompanyQuery): Promise<{
    companies: KnowledgeGraphNode[];
    similarityScores: number[];
    reasoning: string[];
  }> {
    try {
      const targetEntity = await storage.getKnowledgeGraphNode(query.entityId);
      if (!targetEntity || targetEntity.entityType !== 'company') {
        throw new Error('Target entity not found or not a company');
      }

      // Get all company nodes
      const allCompanies = await storage.getKnowledgeGraphNodes('company', 1000);
      
      // Calculate similarity scores using graph algorithms and attributes
      const similarities = await Promise.all(
        allCompanies
          .filter(company => company.entityId !== query.entityId)
          .map(async (company) => {
            const score = await this.calculateCompanySimilarity(
              targetEntity,
              company,
              query.similarityThreshold
            );
            return { company, score };
          })
      );

      // Filter and sort by similarity
      const filteredSimilarities = similarities
        .filter(item => item.score >= query.similarityThreshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, query.limit || 10);

      const companies = filteredSimilarities.map(item => item.company);
      const similarityScores = filteredSimilarities.map(item => item.score);
      
      // Generate reasoning for similarity
      const reasoning = await this.generateSimilarityReasoning(
        targetEntity,
        companies,
        similarityScores
      );

      return {
        companies,
        similarityScores,
        reasoning
      };
    } catch (error) {
      console.error('Error finding similar companies:', error);
      throw error;
    }
  }

  /**
   * Identify success patterns for specific industries or contexts
   */
  async identifySuccessPatterns(
    entities: ExtractedEntity[],
    relationships: ExtractedRelationship[],
    outcome?: string
  ): Promise<string[]> {
    try {
      const patterns: string[] = [];

      // Analyze entity combinations that lead to success
      if (outcome === 'qualified') {
        // Look for technology + budget + authority patterns
        const hastech = entities.some(e => e.entityType === 'technology');
        const hasBudget = relationships.some(r => r.relationshipType === 'has_budget');
        const hasAuthority = entities.some(e => e.attributes.budget_authority === true);

        if (hastech && hasBudget && hasAuthority) {
          patterns.push('tech_budget_authority_combination');
        }

        // Look for pain point + solution patterns
        const painPoints = entities.filter(e => e.entityType === 'pain_point');
        const solutions = entities.filter(e => e.entityType === 'solution');
        
        if (painPoints.length > 0 && solutions.length > 0) {
          patterns.push('pain_point_solution_alignment');
        }
      }

      // Analyze relationship patterns
      const strongRelationships = relationships.filter(r => r.strength > 0.7);
      if (strongRelationships.length >= 3) {
        patterns.push('strong_relationship_network');
      }

      return patterns;
    } catch (error) {
      console.error('Error identifying success patterns:', error);
      return [];
    }
  }

  /**
   * Get comprehensive insights about an entity including relationships and success metrics
   */
  async getEntityInsights(query: EntityInsightQuery): Promise<{
    entity: KnowledgeGraphNode;
    relationships: KnowledgeGraphEdge[];
    successMetrics: any;
    conversationHistory: string[];
    pathsToSuccess: any[];
  }> {
    try {
      const entity = await storage.getKnowledgeGraphNode(query.entityId);
      if (!entity) {
        throw new Error('Entity not found');
      }

      // Get all relationships for this entity
      const relationships = await storage.getKnowledgeGraphEdges(
        query.entityId,
        undefined,
        undefined
      );

      // Calculate success metrics
      const successMetrics = await this.calculateEntitySuccessMetrics(
        entity,
        relationships,
        query.timeRange
      );

      // Get conversation history
      const conversationHistory = await this.getEntityConversationHistory(
        entity,
        query.timeRange
      );

      // Find paths to successful outcomes using graph algorithms
      const pathsToSuccess = await this.findPathsToSuccess(entity);

      return {
        entity,
        relationships,
        successMetrics,
        conversationHistory,
        pathsToSuccess
      };
    } catch (error) {
      console.error('Error getting entity insights:', error);
      throw error;
    }
  }

  /**
   * Perform graph analysis and generate insights
   */
  async performGraphAnalysis(): Promise<GraphAnalysisResult> {
    try {
      // Ensure graph is synced with database
      await this.syncGraphWithDatabase();

      // Calculate network metrics
      const networkMetrics = {
        density: density(this.graph),
        connectedComponents: connectedComponents(this.graph).length,
        averageDegree: this.graph.order > 0 ? this.graph.size / this.graph.order : 0,
        clusteringCoefficient: this.calculateClusteringCoefficient()
      };

      // Calculate centrality metrics
      const betweenness = betweennessCentrality(this.graph);
      const closeness = closenessCentrality(this.graph);

      // Get top nodes by centrality
      const topNodesByCentrality = this.getTopNodesByCentrality(betweenness, closeness);

      // Analyze node and edge distributions
      const nodesByType = await this.getNodeDistributionByType();
      const edgesByType = await this.getEdgeDistributionByType();

      // Identify success and failure patterns
      const successPatterns = await this.identifyGraphSuccessPatterns();
      const emergingPatterns = await this.identifyEmergingPatterns();

      // Calculate overall quality score
      const qualityScore = await this.calculateGraphQuality();

      const result: GraphAnalysisResult = {
        nodeMetrics: {
          totalNodes: this.graph.order,
          nodesByType,
          topNodesByCentrality
        },
        edgeMetrics: {
          totalEdges: this.graph.size,
          edgesByType,
          averageStrength: await this.calculateAverageEdgeStrength()
        },
        networkMetrics,
        successPatterns,
        emergingPatterns,
        qualityScore
      };

      // Save analytics to database
      await this.saveGraphAnalytics(result);

      return result;
    } catch (error) {
      console.error('Error performing graph analysis:', error);
      throw error;
    }
  }

  /**
   * Generate context for reasoning decisions using graph insights
   */
  async getGraphContextForReasoning(
    conversationId: string,
    entities: string[],
    decisionType: string
  ): Promise<{
    similarSuccessfulConversations: any[];
    relevantPatterns: string[];
    entityRecommendations: any[];
    graphConfidence: number;
  }> {
    try {
      // Find similar successful conversations based on entities
      const similarConversations = await this.findSimilarSuccessfulConversations(
        entities,
        decisionType
      );

      // Get relevant success patterns
      const relevantPatterns = await this.getRelevantSuccessPatterns(
        entities,
        decisionType
      );

      // Generate entity-based recommendations
      const entityRecommendations = await this.generateEntityRecommendations(
        entities,
        conversationId
      );

      // Calculate confidence in graph-based insights
      const graphConfidence = await this.calculateGraphContextConfidence(
        entities,
        similarConversations.length
      );

      return {
        similarSuccessfulConversations: similarConversations,
        relevantPatterns,
        entityRecommendations,
        graphConfidence
      };
    } catch (error) {
      console.error('Error getting graph context for reasoning:', error);
      return {
        similarSuccessfulConversations: [],
        relevantPatterns: [],
        entityRecommendations: [],
        graphConfidence: 0
      };
    }
  }

  // Private helper methods

  private buildExtractionPrompt(
    messages: string[],
    conversation: any,
    metrics: any
  ): string {
    return `Extract entities and relationships from this Spanish LATAM business conversation.

Conversation Context:
- Company: ${conversation?.company || 'Unknown'}
- Industry: ${conversation?.industryVertical || 'Unknown'}
- Region: ${conversation?.region || 'ES'}
- Qualification Score: ${metrics?.qualificationScore || 0}

Messages:
${messages.join('\n---\n')}

Extract:
1. ENTITIES (company, person, technology, pain_point, solution, industry, region)
2. RELATIONSHIPS (works_at, uses_technology, has_budget, needs_solution, competing_with)
3. ATTRIBUTES (company size, budget range, authority level, technical sophistication)
4. CULTURAL MARKERS (formality, communication style, regional indicators)

Focus on business-relevant information that helps with lead qualification.
Provide confidence scores and cultural context for LATAM market.`;
  }

  private async processExtractedEntities(
    rawEntities: any[],
    conversationId: string
  ): Promise<ExtractedEntity[]> {
    return rawEntities.map(entity => ({
      entityId: `${entity.type}_${this.normalizeEntityName(entity.name)}`,
      entityType: entity.type,
      entityName: entity.name,
      canonicalName: this.normalizeEntityName(entity.name),
      attributes: entity.attributes || {},
      confidence: entity.confidence || 0.5,
      source: {
        conversationId,
        extractedText: entity.sourceText || ''
      },
      culturalMarkers: entity.culturalMarkers || [],
      regionalIndicators: entity.regionalIndicators || []
    }));
  }

  private async processExtractedRelationships(
    rawRelationships: any[],
    conversationId: string
  ): Promise<ExtractedRelationship[]> {
    return rawRelationships.map(rel => ({
      edgeId: `${rel.source}_${rel.type}_${rel.target}`,
      sourceEntityId: rel.source,
      targetEntityId: rel.target,
      relationshipType: rel.type,
      strength: rel.strength || 0.5,
      confidence: rel.confidence || 0.5,
      attributes: rel.attributes || {},
      source: {
        conversationId,
        extractedText: rel.sourceText || ''
      }
    }));
  }

  private normalizeEntityName(name: string): string {
    return name.toLowerCase()
      .replace(/[áàäâ]/g, 'a')
      .replace(/[éèëê]/g, 'e')
      .replace(/[íìïî]/g, 'i')
      .replace(/[óòöô]/g, 'o')
      .replace(/[úùüû]/g, 'u')
      .replace(/ñ/g, 'n')
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  private calculateExtractionQuality(
    entities: ExtractedEntity[],
    relationships: ExtractedRelationship[],
    culturalContext: any
  ): number {
    let score = 0.5; // Base score

    // Higher score for more entities and relationships
    score += Math.min(entities.length * 0.05, 0.2);
    score += Math.min(relationships.length * 0.1, 0.3);

    // Higher score for high-confidence extractions
    const avgEntityConfidence = entities.reduce((sum, e) => sum + e.confidence, 0) / entities.length;
    const avgRelConfidence = relationships.reduce((sum, r) => sum + r.confidence, 0) / relationships.length;
    score += (avgEntityConfidence * 0.2) + (avgRelConfidence * 0.2);

    // Cultural context bonus
    if (culturalContext && culturalContext.formalityLevel > 0.5) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  // Additional helper methods would continue here...
  // This is a comprehensive service that would need many more private methods
  // for graph operations, similarity calculations, pattern recognition, etc.

  private async saveExtractionRecord(
    conversationId: string,
    entities: ExtractedEntity[],
    relationships: ExtractedRelationship[],
    quality: number,
    culturalContext: any
  ): Promise<void> {
    const extraction: InsertKnowledgeExtraction = {
      conversationId,
      extractorType: 'xai_grok',
      extractorVersion: '1.0.0',
      entitiesExtracted: entities,
      relationshipsExtracted: relationships,
      extractionConfidence: quality,
      entityAccuracy: 0, // Will be updated after validation
      relationshipAccuracy: 0, // Will be updated after validation
      status: 'pending'
    };

    await storage.saveKnowledgeExtraction(extraction);
  }

  private async findOrCreateEntityNode(
    entity: ExtractedEntity,
    conversationId: string
  ): Promise<KnowledgeGraphNode | null> {
    try {
      let existingNode = await storage.getKnowledgeGraphNode(entity.entityId);
      
      if (!existingNode) {
        const newNode: InsertKnowledgeGraphNode = {
          entityId: entity.entityId,
          entityType: entity.entityType,
          entityName: entity.entityName,
          canonicalName: entity.canonicalName,
          attributes: entity.attributes,
          confidence: entity.confidence,
          firstMentionedIn: conversationId,
          lastUpdatedFrom: conversationId,
          culturalMarkers: entity.culturalMarkers,
          regionalIndicators: entity.regionalIndicators
        };
        
        existingNode = await storage.saveKnowledgeGraphNode(newNode);
      } else {
        // Update existing node
        await storage.updateKnowledgeGraphNode(entity.entityId, {
          lastUpdatedFrom: conversationId,
          extractionCount: (existingNode.extractionCount || 0) + 1,
          attributes: { ...existingNode.attributes, ...entity.attributes }
        });
      }
      
      return existingNode;
    } catch (error) {
      console.error('Error creating/finding entity node:', error);
      return null;
    }
  }

  private async findOrCreateRelationshipEdge(
    relationship: ExtractedRelationship,
    conversationId: string
  ): Promise<KnowledgeGraphEdge | null> {
    try {
      let existingEdge = await storage.getKnowledgeGraphEdge(relationship.edgeId);
      
      if (!existingEdge) {
        const newEdge: InsertKnowledgeGraphEdge = {
          edgeId: relationship.edgeId,
          sourceEntityId: relationship.sourceEntityId,
          targetEntityId: relationship.targetEntityId,
          relationshipType: relationship.relationshipType,
          relationshipAttributes: relationship.attributes,
          strength: relationship.strength,
          confidence: relationship.confidence,
          extractedFrom: [conversationId],
          firstObserved: conversationId,
          lastObserved: conversationId
        };
        
        existingEdge = await storage.saveKnowledgeGraphEdge(newEdge);
      } else {
        // Update existing edge
        const extractedFrom = Array.isArray(existingEdge.extractedFrom) 
          ? [...existingEdge.extractedFrom, conversationId]
          : [conversationId];
          
        await storage.updateKnowledgeGraphEdge(relationship.edgeId, {
          lastObserved: conversationId,
          observationCount: (existingEdge.observationCount || 0) + 1,
          extractedFrom: extractedFrom,
          strength: Math.max(existingEdge.strength || 0, relationship.strength)
        });
      }
      
      return existingEdge;
    } catch (error) {
      console.error('Error creating/finding relationship edge:', error);
      return null;
    }
  }

  private async syncGraphWithDatabase(): Promise<void> {
    // Implementation to sync in-memory graph with database state
    // This would load all nodes and edges from database into the Graphology instance
  }

  private async calculateGraphQuality(): Promise<number> {
    // Calculate overall graph quality based on various metrics
    return 0.8; // Placeholder
  }

  private async createGraphVersion(
    description: string,
    triggerEvent: string,
    conversationId?: string
  ): Promise<void> {
    // Create a new version snapshot of the graph
  }

  // Additional private methods for graph analysis, similarity calculation,
  // pattern recognition, etc. would be implemented here...
}

// Export singleton instance
export const knowledgeGraphService = new KnowledgeGraphService();