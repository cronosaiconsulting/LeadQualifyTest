import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { metricsService } from "./services/metrics";
import { learningService } from "./services/learning";
import { decisionService } from "./services/decision";
import { whatsappService } from "./services/whatsapp";
import { websocketService } from "./services/websocket";
import { xaiService } from "./services/xai";
import { reasoningService } from "./services/reasoning";
import { knowledgeGraphService } from "./services/knowledge-graph";
import { conversationLearningPipeline } from "./services/conversation-learning-pipeline";
import { 
  insertConversationSchema, 
  insertMessageSchema,
  insertQuestionBankSchema,
  insertReasoningTraceSchema,
  type SituationAwarenessState 
} from "@shared/schema";
import { registerReplayRoutes } from "./routes/replay";
import { z } from "zod";
import { tracingService } from "./services/tracing";
import { experimentService } from "./services/experiment";
import { shadowDecisionEngine } from "./services/shadow";
import { ipsEvaluationService } from "./services/ips";
import { regretAnalysisService } from "./services/regret";
import { thompsonSamplingService } from "./services/thompson-sampling";
import { policyVariantService } from "./services/policy-variants";
import { safetyService } from "./services/safety";

// Knowledge Graph API Validation Schemas
const knowledgeGraphStatsQuerySchema = z.object({
  includeAnalytics: z.string().optional().transform(val => val === 'true')
});

const knowledgeGraphDataQuerySchema = z.object({
  entityType: z.string().optional(),
  minConfidence: z.string().optional().transform(val => val ? parseFloat(val) : 0.6),
  limit: z.string().optional().transform(val => val ? parseInt(val) : 100),
  includeEdges: z.string().optional().transform(val => val !== 'false')
});

const similarCompaniesParamsSchema = z.object({
  entityId: z.string().min(1)
});

const similarCompaniesQuerySchema = z.object({
  industryFilter: z.string().optional(),
  limit: z.string().optional().transform(val => val ? parseInt(val) : 10),
  minConfidence: z.string().optional().transform(val => val ? parseFloat(val) : 0.6)
});

const successPatternsParamsSchema = z.object({
  industry: z.string().min(1)
});

const successPatternsQuerySchema = z.object({
  outcomeType: z.string().optional().default('qualified'),
  minConfidence: z.string().optional().transform(val => val ? parseFloat(val) : 0.7),
  limit: z.string().optional().transform(val => val ? parseInt(val) : 20)
});

const entityInsightsParamsSchema = z.object({
  entityId: z.string().min(1)
});

const entityInsightsQuerySchema = z.object({
  includeRelationships: z.string().optional().transform(val => val !== 'false'),
  includeHistory: z.string().optional().transform(val => val !== 'false')
});

const knowledgeUpdateBodySchema = z.object({
  entityUpdates: z.array(z.object({
    entityId: z.string(),
    entityName: z.string().optional(),
    attributes: z.record(z.any()).optional(),
    confidence: z.number().min(0).max(1).optional()
  })).optional(),
  relationshipUpdates: z.array(z.object({
    sourceEntityId: z.string(),
    targetEntityId: z.string(),
    relationshipType: z.string(),
    confidence: z.number().min(0).max(1).optional()
  })).optional(),
  patternUpdates: z.array(z.object({
    patternType: z.string(),
    entities: z.array(z.string()),
    successRate: z.number().min(0).max(1)
  })).optional()
});

const processConversationBodySchema = z.object({
  conversationId: z.string().min(1),
  forceReprocessing: z.boolean().optional().default(false),
  extractionOptions: z.object({
    includeRelationships: z.boolean().optional().default(true),
    includeCulturalContext: z.boolean().optional().default(true),
    qualityThreshold: z.number().min(0).max(1).optional().default(0.6)
  }).optional()
});

const processBatchBodySchema = z.object({
  conversationIds: z.array(z.string().min(1)).min(1).max(50),
  batchOptions: z.object({
    maxConcurrency: z.number().min(1).max(10).optional().default(3),
    qualityThreshold: z.number().min(0).max(1).optional().default(0.6),
    skipExisting: z.boolean().optional().default(true)
  }).optional()
});

const graphAnalyticsQuerySchema = z.object({
  analysisType: z.string().optional(),
  limit: z.string().optional().transform(val => val ? parseInt(val) : 10)
});

// Helper functions for SLO calculations
function calculateAvailability(errorStats: any): number {
  const totalRequests = Object.values(errorStats).reduce((sum: number, stat: any) => sum + (stat.errorCount || 0), 0);
  const totalErrors = Object.values(errorStats).reduce((sum: number, stat: any) => sum + (stat.errorCount || 0), 0);
  if (totalRequests === 0) return 100;
  return ((totalRequests - totalErrors) / totalRequests) * 100;
}

function calculateP95Latency(latencyStats: any): number {
  const p95Values = Object.values(latencyStats).map((stat: any) => stat.p95 || 0);
  if (p95Values.length === 0) return 0;
  return Math.max(...p95Values);
}

function calculateErrorRate(errorStats: any, latencyStats: any): number {
  const totalErrors = Object.values(errorStats).reduce((sum: number, stat: any) => sum + (stat.errorCount || 0), 0);
  const totalRequests = Object.values(latencyStats).reduce((sum: number, stat: any) => sum + (stat.count || 0), 0);
  if (totalRequests === 0) return 0;
  return (totalErrors / totalRequests) * 100;
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Initialize WebSocket service
  websocketService.initialize(httpServer);
  
  // Register replay harness routes
  registerReplayRoutes(app);

  // WhatsApp Webhook Verification
  app.get('/api/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && whatsappService.verifyWebhook(token as string)) {
      res.status(200).send(challenge);
    } else {
      res.status(403).send('Verification failed');
    }
  });

  // WhatsApp Webhook Handler
  app.post('/api/webhook', async (req, res) => {
    try {
      const message = whatsappService.parseWebhookMessage(req.body);
      
      if (!message) {
        return res.status(200).send('No message parsed');
      }

      // Get or create conversation
      let conversation = await storage.getConversationByWhatsAppId(message.from);
      
      if (!conversation) {
        const contactInfo = await whatsappService.getContactInfo(message.from);
        conversation = await storage.createConversation({
          whatsappId: message.from,
          contactName: contactInfo?.name || contactInfo?.profileName || 'Unknown Contact',
          contactPhone: whatsappService.formatPhoneNumber(message.from),
          company: null,
          status: 'active',
          language: 'es',
          region: 'ES'
        });
      }

      // Save incoming message
      const savedMessage = await storage.addMessage({
        conversationId: conversation.id,
        whatsappMessageId: message.id,
        direction: 'incoming',
        content: message.content,
        messageType: message.type,
        metadata: message.metadata
      });

      // Mark message as read
      await whatsappService.markAsRead(message.id);

      // Get conversation history for metrics calculation
      const messages = await storage.getMessages(conversation.id, 50);
      const previousMetrics = await storage.getLatestMetrics(conversation.id);

      // Calculate updated metrics
      const metricsResult = await metricsService.calculateMetrics(
        conversation.id,
        messages,
        previousMetrics || undefined
      );

      // Save metrics
      await storage.saveMetrics(metricsResult.metrics);

      // Create situation awareness state
      const situationState = metricsService.createSituationAwarenessState(
        conversation.id,
        { ...metricsResult.metrics, id: 'temp', timestamp: new Date(), version: null }
      );

      // Get decision context
      const conversationStage = decisionService.getConversationStage(
        messages.length,
        metricsResult.metrics.qualificationScore || 0
      );

      const decisionContext = {
        conversationId: conversation.id,
        currentState: situationState,
        messageHistory: messages.filter(m => m.direction === 'incoming').slice(-10).map(m => m.content),
        previousQuestions: messages.filter(m => m.direction === 'outgoing').slice(-5).map(m => m.content),
        conversationStage
      };

      // Select optimal response
      const selectedQuestion = await decisionService.selectOptimalQuestion(decisionContext);

      if (selectedQuestion) {
        // Record decision
        const decisionTrace = await decisionService.recordDecision(
          conversation.id,
          selectedQuestion,
          decisionContext
        );

        // Send response via WhatsApp
        const sent = await whatsappService.sendMessage(
          conversation.whatsappId,
          selectedQuestion.question.questionText
        );

        if (sent) {
          // Save outgoing message
          await storage.addMessage({
            conversationId: conversation.id,
            whatsappMessageId: null,
            direction: 'outgoing',
            content: selectedQuestion.question.questionText,
            messageType: 'text',
            metadata: { questionId: selectedQuestion.question.id, decisionTraceId: decisionTrace.id }
          });

          // Update question usage stats
          if (selectedQuestion.question.id !== 'ai-suggested') {
            await storage.updateQuestionUsage(selectedQuestion.question.id);
          }
        }

        // Broadcast updates via WebSocket
        await websocketService.broadcastMetricsUpdate(conversation.id);
        await websocketService.broadcastDecisionUpdate(decisionTrace);
        await websocketService.broadcastConversationUpdate(conversation.id);
      }

      res.status(200).send('Message processed');
    } catch (error) {
      console.error('Webhook processing error:', error);
      res.status(500).send('Processing failed');
    }
  });

  // API Routes
  
  // System metrics
  app.get('/api/system/metrics', async (req, res) => {
    const start = Date.now();
    try {
      const traceId = (req as any).traceId;
      
      // Start span for metrics calculation
      const spanId = tracingService.startSpan(traceId, 'get_system_metrics');
      
      const metrics = await storage.getSystemMetrics();
      const duration = Date.now() - start;
      
      // Log slow metrics requests
      if (duration > 1000) {
        tracingService.logStructured('warn', 'slow_metrics_request', {
          traceId,
          spanId,
          duration,
          threshold: 1000
        });
      }
      
      tracingService.finishSpan(spanId, 'success', metrics);
      res.json(metrics);
    } catch (error) {
      const duration = Date.now() - start;
      tracingService.recordError('GET', '/api/system/metrics', error as Error, (req as any).traceId);
      tracingService.logStructured('error', 'metrics_request_failed', {
        duration,
        error: (error as Error).message
      });
      res.status(500).json({ error: 'Failed to fetch system metrics' });
    }
  });

  app.get('/api/system/metrics/comparison', async (req, res) => {
    const start = Date.now();
    try {
      const traceId = (req as any).traceId;
      const spanId = tracingService.startSpan(traceId, 'get_metrics_comparison');
      
      const window = parseInt(req.query.window as string) || 30;
      const comparison = await storage.getSystemMetricsComparison(window);
      const duration = Date.now() - start;
      
      // This endpoint was showing latency spikes - investigate
      if (duration > 2000) {
        tracingService.logStructured('error', 'critical_latency_spike', {
          traceId,
          spanId,
          duration,
          threshold: 2000,
          window,
          endpoint: '/api/system/metrics/comparison'
        });
      } else if (duration > 500) {
        tracingService.logStructured('warn', 'elevated_latency', {
          traceId,
          spanId,
          duration,
          threshold: 500,
          window
        });
      }
      
      tracingService.finishSpan(spanId, 'success', comparison);
      res.json(comparison);
    } catch (error) {
      const duration = Date.now() - start;
      tracingService.recordError('GET', '/api/system/metrics/comparison', error as Error, (req as any).traceId);
      console.error('Comparison endpoint error:', error);
      res.status(500).json({ error: 'Failed to fetch metrics comparison' });
    }
  });

  // Conversations
  app.get('/api/conversations', async (req, res) => {
    try {
      const conversations = await storage.getActiveConversations();
      
      // Enhance with metrics
      const enhanced = await Promise.all(conversations.map(async (conv) => {
        const metrics = await storage.getLatestMetrics(conv.id);
        const lastMessage = await storage.getLatestMessage(conv.id);
        
        return {
          ...conv,
          latestMetrics: metrics,
          lastMessage: lastMessage?.content.substring(0, 200),
          lastMessageTime: lastMessage?.timestamp
        };
      }));

      res.json(enhanced);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch conversations' });
    }
  });

  app.get('/api/conversations/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const conversation = await storage.getConversation(id);
      
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      const metrics = await storage.getLatestMetrics(id);
      const messages = await storage.getMessages(id, 100);
      const decisionTraces = await storage.getDecisionTraces(id, 20);
      const learningStates = await storage.getAllLearningStates(id);

      let situationState = null;
      if (metrics) {
        situationState = metricsService.createSituationAwarenessState(id, metrics);
      }

      res.json({
        conversation,
        metrics,
        situationState,
        messages: messages.reverse(),
        decisionTraces,
        learningStates
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch conversation details' });
    }
  });

  app.post('/api/conversations', async (req, res) => {
    try {
      const validatedData = insertConversationSchema.parse(req.body);
      const conversation = await storage.createConversation(validatedData);
      res.status(201).json(conversation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid conversation data', details: error.errors });
      } else {
        res.status(500).json({ error: 'Failed to create conversation' });
      }
    }
  });

  // Messages
  app.get('/api/conversations/:id/messages', async (req, res) => {
    try {
      const { id } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const messages = await storage.getMessages(id, limit);
      res.json(messages.reverse());
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  app.post('/api/conversations/:id/messages', async (req, res) => {
    try {
      const { id } = req.params;
      const messageData = { ...req.body, conversationId: id };
      const validatedData = insertMessageSchema.parse(messageData);
      
      const message = await storage.addMessage(validatedData);
      
      // If outgoing message, send via WhatsApp
      if (validatedData.direction === 'outgoing') {
        const conversation = await storage.getConversation(id);
        if (conversation) {
          await whatsappService.sendMessage(conversation.whatsappId, validatedData.content);
        }
      }
      
      res.status(201).json(message);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid message data', details: error.errors });
      } else {
        res.status(500).json({ error: 'Failed to send message' });
      }
    }
  });

  // Metrics
  app.get('/api/conversations/:id/metrics', async (req, res) => {
    try {
      const { id } = req.params;
      const hours = parseInt(req.query.hours as string) || 24;
      
      const metrics = await storage.getMetricsHistory(id, hours);
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch metrics history' });
    }
  });

  app.get('/api/conversations/:id/metrics/latest', async (req, res) => {
    try {
      const { id } = req.params;
      const metrics = await storage.getLatestMetrics(id);
      
      if (!metrics) {
        return res.status(404).json({ error: 'No metrics found' });
      }

      const situationState = metricsService.createSituationAwarenessState(id, metrics);
      res.json({ metrics, situationState });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch latest metrics' });
    }
  });

  // Recalculate metrics manually
  app.post('/api/conversations/:id/metrics/recalculate', async (req, res) => {
    try {
      const { id } = req.params;
      const messages = await storage.getMessages(id, 100);
      const previousMetrics = await storage.getLatestMetrics(id);

      const metricsResult = await metricsService.calculateMetrics(id, messages, previousMetrics || undefined);
      const savedMetrics = await storage.saveMetrics(metricsResult.metrics);

      await websocketService.broadcastMetricsUpdate(id);

      res.json({ metrics: savedMetrics, explanations: metricsResult.explanations });
    } catch (error) {
      res.status(500).json({ error: 'Failed to recalculate metrics' });
    }
  });

  // Simulate conversation with Grok AI
  app.post('/api/conversations/:id/simulate', async (req, res) => {
    try {
      const { id } = req.params;
      const { scenario = 'spanish_b2b_consulting', messageCount = 8, dealSize = 10000 } = req.body;
      
      const conversation = await storage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      // Generate simulated conversation using xAI Grok
      const simulationResult = await xaiService.simulateConversation({
        conversationId: id,
        scenario,
        messageCount,
        dealSize,
        language: conversation.language || 'es',
        region: conversation.region || 'ES'
      });

      if (simulationResult.success) {
        // Process each simulated message through the normal pipeline
        for (const message of simulationResult.messages) {
          // Save the message
          const savedMessage = await storage.addMessage({
            conversationId: id,
            whatsappMessageId: null,
            direction: message.direction,
            content: message.content,
            messageType: 'text',
            metadata: { simulated: true, scenario }
          });

          // If it's an incoming message, trigger the AI response pipeline
          if (message.direction === 'incoming') {
            const messages = await storage.getMessages(id, 50);
            const previousMetrics = await storage.getLatestMetrics(id);

            // Calculate updated metrics
            const metricsResult = await metricsService.calculateMetrics(id, messages, previousMetrics || undefined);
            await storage.saveMetrics(metricsResult.metrics);

            // Create situation awareness state
            const situationState = metricsService.createSituationAwarenessState(id, { 
              ...metricsResult.metrics, 
              id: 'temp', 
              timestamp: new Date(), 
              version: null 
            });

            // Get decision context and select response
            const conversationStage = decisionService.getConversationStage(
              messages.length,
              metricsResult.metrics.qualificationScore || 0
            );

            const decisionContext = {
              conversationId: id,
              currentState: situationState,
              messageHistory: messages.filter(m => m.direction === 'incoming').slice(-10).map(m => m.content),
              previousQuestions: messages.filter(m => m.direction === 'outgoing').slice(-5).map(m => m.content),
              conversationStage
            };

            const selectedQuestion = await decisionService.selectOptimalQuestion(decisionContext);

            if (selectedQuestion) {
              // Record decision
              const decisionTrace = await decisionService.recordDecision(id, selectedQuestion, decisionContext);

              // Save AI response
              await storage.addMessage({
                conversationId: id,
                whatsappMessageId: null,
                direction: 'outgoing',
                content: selectedQuestion.question.questionText,
                messageType: 'text',
                metadata: { 
                  simulated: true, 
                  questionId: selectedQuestion.question.id, 
                  decisionTraceId: decisionTrace.id 
                }
              });

              // Broadcast updates
              await websocketService.broadcastMetricsUpdate(id);
              await websocketService.broadcastDecisionUpdate(decisionTrace);
            }
          }

          // Add small delay between messages for realism
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        await websocketService.broadcastConversationUpdate(id);
        res.json({ 
          success: true, 
          messagesGenerated: simulationResult.messages.length,
          scenario,
          message: 'Conversation simulation completed successfully' 
        });
      } else {
        res.status(500).json({ 
          error: 'Simulation failed', 
          details: simulationResult.error 
        });
      }
    } catch (error) {
      console.error('Simulation error:', error);
      res.status(500).json({ error: 'Failed to simulate conversation' });
    }
  });

  // Convenience route for chat interface - send message
  app.post('/api/conversations/:id/message', async (req, res) => {
    try {
      const { id } = req.params;
      const { content, direction = 'incoming' } = req.body;
      
      if (!content) {
        return res.status(400).json({ error: 'Message content is required' });
      }

      // Save the incoming message
      const message = await storage.addMessage({
        conversationId: id,
        whatsappMessageId: null,
        direction,
        content,
        messageType: 'text',
        metadata: { chatTest: true }
      });

      // Only trigger AI pipeline for incoming messages
      if (direction === 'incoming') {
        // Get conversation history
        const messages = await storage.getMessages(id, 50);
        const previousMetrics = await storage.getLatestMetrics(id);

        // Calculate updated metrics
        const metricsResult = await metricsService.calculateMetrics(id, messages, previousMetrics || undefined);
        await storage.saveMetrics(metricsResult.metrics);

        // Create situation awareness state
        const situationState = metricsService.createSituationAwarenessState(id, { 
          ...metricsResult.metrics, 
          id: 'temp', 
          timestamp: new Date(), 
          version: null 
        });

        // Get decision context
        const conversationStage = decisionService.getConversationStage(
          messages.length,
          metricsResult.metrics.qualificationScore || 0
        );

        const decisionContext = {
          conversationId: id,
          currentState: situationState,
          messageHistory: messages.filter(m => m.direction === 'incoming').slice(-10).map(m => m.content),
          previousQuestions: messages.filter(m => m.direction === 'outgoing').slice(-5).map(m => m.content),
          conversationStage
        };

        // Select optimal response
        const selectedQuestion = await decisionService.selectOptimalQuestion(decisionContext);

        if (selectedQuestion) {
          // Record decision
          const decisionTrace = await decisionService.recordDecision(id, selectedQuestion, decisionContext);

          // Save outgoing message
          const aiResponse = await storage.addMessage({
            conversationId: id,
            whatsappMessageId: null,
            direction: 'outgoing',
            content: selectedQuestion.question.questionText,
            messageType: 'text',
            metadata: { 
              chatTest: true,
              questionId: selectedQuestion.question.id, 
              decisionTraceId: decisionTrace.id 
            }
          });

          // Update question usage stats
          if (selectedQuestion.question.id !== 'ai-suggested') {
            await storage.updateQuestionUsage(selectedQuestion.question.id);
          }

          // Broadcast updates
          await websocketService.broadcastMetricsUpdate(id);
          await websocketService.broadcastDecisionUpdate(decisionTrace);
          await websocketService.broadcastConversationUpdate(id);

          // Return both messages
          res.status(201).json({ 
            userMessage: message, 
            aiResponse,
            decisionTrace,
            metrics: metricsResult.metrics
          });
        } else {
          res.status(201).json({ 
            userMessage: message, 
            aiResponse: null,
            message: 'No AI response generated'
          });
        }
      } else {
        res.status(201).json({ message });
      }
    } catch (error) {
      console.error('Send message error:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  // Convenience route for chat interface - get messages (alternative format)
  app.get('/api/messages/:conversationId', async (req, res) => {
    try {
      const { conversationId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const messages = await storage.getMessages(conversationId, limit);
      res.json(messages.reverse());
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  // Decision traces
  app.get('/api/decision-traces', async (req, res) => {
    try {
      // Server-side validation
      const conversationId = req.query.conversationId as string;
      const limitParam = req.query.limit as string;
      
      // Validate limit parameter
      const limit = limitParam ? parseInt(limitParam) : 20;
      if (isNaN(limit) || limit < 1 || limit > 100) {
        return res.status(400).json({ 
          error: 'Invalid limit parameter. Must be between 1 and 100' 
        });
      }
      
      // Validate conversationId format if provided
      if (conversationId && typeof conversationId !== 'string') {
        return res.status(400).json({ 
          error: 'Invalid conversationId parameter. Must be a string' 
        });
      }
      
      const traces = await storage.getDecisionTraces(conversationId, limit);
      res.json(traces);
    } catch (error) {
      console.error('Decision traces API error:', error);
      res.status(500).json({ error: 'Failed to fetch decision traces' });
    }
  });

  // Reasoning trace routes for "Why" panel
  app.get('/api/reasoning-traces/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const trace = await storage.getReasoningTrace(id);
      
      if (!trace) {
        return res.status(404).json({ error: 'Reasoning trace not found' });
      }
      
      res.json(trace);
    } catch (error) {
      console.error('Error fetching reasoning trace:', error);
      res.status(500).json({ error: 'Failed to fetch reasoning trace' });
    }
  });

  app.get('/api/conversations/:conversationId/reasoning-traces', async (req, res) => {
    try {
      const { conversationId } = req.params;
      const { decisionType, limit } = req.query;
      
      const traces = await storage.getReasoningTraces(
        conversationId,
        decisionType as string | undefined,
        parseInt(limit as string) || 20
      );
      
      res.json(traces);
    } catch (error) {
      console.error('Error fetching conversation reasoning traces:', error);
      res.status(500).json({ error: 'Failed to fetch reasoning traces' });
    }
  });

  app.post('/api/reasoning-traces', async (req, res) => {
    try {
      const validatedData = insertReasoningTraceSchema.parse(req.body);
      const trace = await storage.saveReasoningTrace(validatedData);
      
      res.status(201).json(trace);
    } catch (error) {
      console.error('Error creating reasoning trace:', error);
      res.status(500).json({ error: 'Failed to create reasoning trace' });
    }
  });

  app.post('/api/reasoning-traces/:id/validate', async (req, res) => {
    try {
      const { id } = req.params;
      const trace = await storage.getReasoningTrace(id);
      
      if (!trace) {
        return res.status(404).json({ error: 'Reasoning trace not found' });
      }
      
      const validation = await reasoningService.validateReasoningQuality(trace);
      res.json(validation);
    } catch (error) {
      console.error('Error validating reasoning trace:', error);
      res.status(500).json({ error: 'Failed to validate reasoning trace' });
    }
  });

  // Question Bank
  app.get('/api/questions', async (req, res) => {
    try {
      const category = req.query.category as string;
      const language = req.query.language as string || 'es';
      const region = req.query.region as string || 'ES';
      
      const questions = await storage.getQuestions(category, language, region);
      res.json(questions);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch questions' });
    }
  });

  app.post('/api/questions', async (req, res) => {
    try {
      const validatedData = insertQuestionBankSchema.parse(req.body);
      const question = await storage.addQuestion(validatedData);
      res.status(201).json(question);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid question data', details: error.errors });
      } else {
        res.status(500).json({ error: 'Failed to create question' });
      }
    }
  });

  // AI Services
  app.post('/api/ai/suggest-question', async (req, res) => {
    try {
      const { conversationId } = req.body;
      
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      const metrics = await storage.getLatestMetrics(conversationId);
      if (!metrics) {
        return res.status(404).json({ error: 'No metrics available' });
      }

      const messages = await storage.getMessages(conversationId, 10);
      const situationState = metricsService.createSituationAwarenessState(conversationId, metrics);
      const availableQuestions = await storage.getQuestions(undefined, 'es', 'ES');

      const suggestion = await openaiService.suggestNextQuestion(
        situationState,
        messages.filter(m => m.direction === 'incoming').map(m => m.content),
        availableQuestions
      );

      res.json(suggestion);
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate AI suggestion' });
    }
  });

  app.post('/api/ai/analyze-message', async (req, res) => {
    try {
      const { message, language = 'es' } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: 'Message is required' });
      }

      // Use xAI service with sophisticated reasoning instead of OpenAI
      const analysis = await xaiService.analyzeMessage(message, language);
      res.json(analysis);
    } catch (error) {
      res.status(500).json({ error: 'Failed to analyze message' });
    }
  });

  app.post('/api/ai/explain-metric', async (req, res) => {
    try {
      const { metricName, value, context } = req.body;
      
      // Use xAI service for metric explanation instead of OpenAI
      const explanation = await xaiService.generateMetricExplanation(metricName, value, context);
      res.json({ explanation });
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate explanation' });
    }
  });

  // Learning System
  app.get('/api/learning/pattern/:conversationId', async (req, res) => {
    try {
      const { conversationId } = req.params;
      const pattern = await learningService.detectConversationPattern(conversationId);
      res.json(pattern);
    } catch (error) {
      res.status(500).json({ error: 'Failed to detect pattern' });
    }
  });

  app.get('/api/learning/states/:conversationId', async (req, res) => {
    try {
      const { conversationId } = req.params;
      const states = await storage.getAllLearningStates(conversationId);
      res.json(states);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch learning states' });
    }
  });

  // Knowledge Graph API Routes
  
  // Find similar companies based on entity patterns
  app.get('/api/knowledge/similar-companies/:entityId', async (req, res) => {
    try {
      // Validate path parameters
      const validatedParams = similarCompaniesParamsSchema.parse(req.params);
      // Validate query parameters
      const validatedQuery = similarCompaniesQuerySchema.parse(req.query);
      
      const query = {
        entityId: validatedParams.entityId,
        industryFilter: validatedQuery.industryFilter ? validatedQuery.industryFilter.split(',') : undefined,
        limit: validatedQuery.limit,
        minConfidence: validatedQuery.minConfidence
      };

      const similarCompanies = await storage.findSimilarCompanies(query);
      const insights = await knowledgeGraphService.analyzeSimilarityPatterns(similarCompanies, entityId);
      
      res.json({
        similarCompanies,
        insights,
        query,
        totalFound: similarCompanies.length
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Invalid parameters', 
          details: error.errors 
        });
      }
      console.error('Error finding similar companies:', error);
      res.status(500).json({ error: 'Failed to find similar companies' });
    }
  });

  // Get success patterns for specific industry or context
  app.get('/api/knowledge/success-patterns/:industry', async (req, res) => {
    try {
      // Validate path parameters
      const validatedParams = successPatternsParamsSchema.parse(req.params);
      // Validate query parameters
      const validatedQuery = successPatternsQuerySchema.parse(req.query);
      
      const query = {
        industry: validatedParams.industry,
        outcomeType: validatedQuery.outcomeType,
        minConfidence: validatedQuery.minConfidence,
        limit: validatedQuery.limit
      };

      const patterns = await storage.findSuccessPatterns(query);
      
      res.json({
        patterns: patterns.patterns,
        insights: patterns.insights,
        confidence: patterns.confidence,
        industry,
        totalPatternsFound: patterns.patterns.length
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Invalid parameters', 
          details: error.errors 
        });
      }
      console.error('Error finding success patterns:', error);
      res.status(500).json({ error: 'Failed to find success patterns' });
    }
  });

  // Get comprehensive insights for specific entity
  app.get('/api/knowledge/entity-insights/:entityId', async (req, res) => {
    try {
      // Validate path parameters
      const validatedParams = entityInsightsParamsSchema.parse(req.params);
      // Validate query parameters
      const validatedQuery = entityInsightsQuerySchema.parse(req.query);
      
      const query = {
        entityId: validatedParams.entityId,
        includeRelationships: validatedQuery.includeRelationships,
        includeHistory: validatedQuery.includeHistory
      };

      const insights = await storage.getEntityInsights(query);
      
      res.json({
        entity: insights.entity,
        relationships: insights.relationships,
        successMetrics: insights.successMetrics,
        conversationHistory: insights.conversationHistory,
        recommendations: await knowledgeGraphService.generateEntityRecommendations(entityId)
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Invalid parameters', 
          details: error.errors 
        });
      }
      console.error('Error getting entity insights:', error);
      res.status(500).json({ error: 'Failed to get entity insights' });
    }
  });

  // Manual knowledge updates
  app.post('/api/knowledge/update', async (req, res) => {
    try {
      const { updateType, entityId, updates, confidence = 0.9 } = req.body;
      
      if (!updateType || !entityId || !updates) {
        return res.status(400).json({ error: 'updateType, entityId, and updates are required' });
      }

      let result;
      
      switch (updateType) {
        case 'entity':
          result = await knowledgeGraphService.updateEntityManually(entityId, updates, confidence);
          break;
        case 'relationship':
          result = await knowledgeGraphService.updateRelationshipManually(entityId, updates, confidence);
          break;
        case 'pattern':
          result = await knowledgeGraphService.reinforcePatternManually(entityId, updates, confidence);
          break;
        default:
          return res.status(400).json({ error: 'Invalid updateType. Must be: entity, relationship, or pattern' });
      }
      
      res.json({
        success: true,
        updateType,
        entityId,
        result,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error updating knowledge:', error);
      res.status(500).json({ error: 'Failed to update knowledge' });
    }
  });

  // Process conversation for knowledge extraction
  app.post('/api/knowledge/process-conversation', async (req, res) => {
    try {
      const { conversationId, forceReprocess = false } = req.body;
      
      if (!conversationId) {
        return res.status(400).json({ error: 'conversationId is required' });
      }

      // Check if already processed
      if (!forceReprocess) {
        const existingExtractions = await storage.getKnowledgeExtractions(conversationId);
        if (existingExtractions.length > 0) {
          return res.json({
            message: 'Conversation already processed',
            existingExtractions: existingExtractions.length,
            latestExtraction: existingExtractions[0]
          });
        }
      }

      const result = await conversationLearningPipeline.processConversation(conversationId);
      
      res.json({
        success: true,
        conversationId,
        extractionResult: result,
        processingTimeMs: result.processingTimeMs
      });
    } catch (error) {
      console.error('Error processing conversation:', error);
      res.status(500).json({ error: 'Failed to process conversation' });
    }
  });

  // Batch process multiple conversations
  app.post('/api/knowledge/process-batch', async (req, res) => {
    try {
      const { conversationIds, maxConcurrency = 5 } = req.body;
      
      if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
        return res.status(400).json({ error: 'conversationIds array is required' });
      }

      if (conversationIds.length > 50) {
        return res.status(400).json({ error: 'Maximum 50 conversations per batch' });
      }

      const results = await conversationLearningPipeline.processBatch(conversationIds);
      
      const summary = {
        totalProcessed: results.length,
        successful: results.filter(r => r.qualityScore > 0).length,
        failed: results.filter(r => r.insights.some(i => i.startsWith('error'))).length,
        skipped: results.filter(r => r.insights.some(i => i.startsWith('skipped'))).length
      };
      
      res.json({
        success: true,
        summary,
        results,
        processingTimeMs: results.reduce((sum, r) => sum + r.processingTimeMs, 0)
      });
    } catch (error) {
      console.error('Error processing batch:', error);
      res.status(500).json({ error: 'Failed to process conversation batch' });
    }
  });

  // Get knowledge graph statistics
  app.get('/api/knowledge/stats', async (req, res) => {
    try {
      // Validate query parameters
      const validatedQuery = knowledgeGraphStatsQuerySchema.parse(req.query);
      
      const stats = await storage.getKnowledgeGraphStats();
      const pipelineStatus = conversationLearningPipeline.getStatus();
      
      let analytics = null;
      if (validatedQuery.includeAnalytics) {
        analytics = await storage.getLatestGraphAnalytics();
      }
      
      res.json({
        graphStats: stats,
        pipelineStatus,
        analytics,
        timestamp: new Date()
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Invalid query parameters', 
          details: error.errors 
        });
      }
      console.error('Error getting knowledge stats:', error);
      res.status(500).json({ error: 'Failed to get knowledge statistics' });
    }
  });

  // Get graph analytics history
  app.get('/api/knowledge/analytics', async (req, res) => {
    try {
      const { analysisType, limit = 10 } = req.query;
      
      let analytics;
      if (analysisType) {
        analytics = await storage.getGraphAnalyticsHistory(String(analysisType), parseInt(String(limit)));
      } else {
        analytics = await storage.getLatestGraphAnalytics();
      }
      
      res.json({
        analytics,
        analysisType: analysisType || 'latest',
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error getting graph analytics:', error);
      res.status(500).json({ error: 'Failed to get graph analytics' });
    }
  });

  // Get graph data for visualization
  app.get('/api/knowledge/graph-data', async (req, res) => {
    try {
      // Validate query parameters
      const validatedQuery = knowledgeGraphDataQuerySchema.parse(req.query);
      const { entityType, minConfidence, limit, includeEdges } = validatedQuery;
      
      // Get nodes with validated parameters
      const nodes = await storage.getKnowledgeGraphNodes(
        entityType,
        limit
      );
      
      // Filter by confidence
      const filteredNodes = nodes.filter(node => 
        node.confidence >= minConfidence
      );
      
      let edges: any[] = [];
      if (includeEdges && filteredNodes.length > 0) {
        // Get edges for the filtered nodes
        const nodeIds = filteredNodes.map(node => node.entityId);
        edges = await Promise.all(
          nodeIds.map(async (nodeId) => {
            const nodeEdges = await storage.getKnowledgeGraphEdges(nodeId);
            return nodeEdges.filter(edge => 
              nodeIds.includes(edge.targetEntityId) && 
              edge.confidence >= minConfidence
            );
          })
        ).then(results => results.flat());
      }
      
      res.json({
        nodes: filteredNodes,
        edges,
        metadata: {
          totalNodes: filteredNodes.length,
          totalEdges: edges.length,
          minConfidence,
          entityTypeFilter: entityType || 'all',
          generatedAt: new Date()
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Invalid query parameters', 
          details: error.errors 
        });
      }
      console.error('Error getting graph data:', error);
      res.status(500).json({ error: 'Failed to get graph data' });
    }
  });

  // Shadow Testing Framework API Endpoints
  
  // Experiments Management
  app.post('/api/shadow/experiments', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'anonymous';
      const experiment = await experimentService.createExperiment(req.body, userId);
      res.status(201).json(experiment);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create experiment';
      res.status(400).json({ error: message });
    }
  });

  app.get('/api/shadow/experiments', async (req, res) => {
    try {
      const filters = {
        status: req.query.status as string,
        experimentType: req.query.experimentType as string,
        createdBy: req.query.createdBy as string
      };
      const experiments = await experimentService.getExperiments(filters);
      res.json(experiments);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch experiments' });
    }
  });

  app.get('/api/shadow/experiments/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const status = await experimentService.getExperimentStatus(id);
      res.json(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch experiment';
      res.status(404).json({ error: message });
    }
  });

  app.post('/api/shadow/experiments/:id/start', async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.headers['user-id'] as string || 'anonymous';
      const experiment = await experimentService.startExperiment(id, userId);
      res.json(experiment);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start experiment';
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/shadow/experiments/:id/pause', async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.headers['user-id'] as string || 'anonymous';
      const { reason } = req.body;
      const experiment = await experimentService.pauseExperiment(id, userId, reason);
      res.json(experiment);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to pause experiment';
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/shadow/experiments/:id/stop', async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.headers['user-id'] as string || 'anonymous';
      const { reason } = req.body;
      const experiment = await experimentService.stopExperiment(id, userId, reason);
      res.json(experiment);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to stop experiment';
      res.status(400).json({ error: message });
    }
  });

  app.get('/api/shadow/experiments/:id/monitor', async (req, res) => {
    try {
      const { id } = req.params;
      const monitoring = await experimentService.monitorExperiment(id);
      res.json(monitoring);
    } catch (error) {
      res.status(500).json({ error: 'Failed to monitor experiment' });
    }
  });

  // Experiment Variants
  app.post('/api/shadow/experiments/:experimentId/variants', async (req, res) => {
    try {
      const { experimentId } = req.params;
      const variant = await experimentService.createExperimentVariant(experimentId, req.body);
      res.status(201).json(variant);
    } catch (error) {
      res.status(400).json({ error: 'Failed to create variant' });
    }
  });

  app.get('/api/shadow/experiments/:experimentId/variants', async (req, res) => {
    try {
      const { experimentId } = req.params;
      const variants = await storage.getExperimentVariants(experimentId);
      res.json(variants);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch variants' });
    }
  });

  // Shadow Decisions Analysis
  app.get('/api/shadow/decisions', async (req, res) => {
    try {
      const conversationId = req.query.conversationId as string;
      const experimentId = req.query.experimentId as string;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const decisions = await storage.getShadowDecisions(conversationId, experimentId, limit);
      res.json(decisions);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch shadow decisions' });
    }
  });

  app.get('/api/shadow/decisions/:id/metrics', async (req, res) => {
    try {
      const { id } = req.params;
      const metrics = await storage.getShadowMetrics(id);
      if (!metrics) {
        return res.status(404).json({ error: 'Shadow metrics not found' });
      }
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch shadow metrics' });
    }
  });

  // IPS Evaluation
  app.post('/api/shadow/experiments/:experimentId/variants/:variantId/ips-analysis', async (req, res) => {
    try {
      const { experimentId, variantId } = req.params;
      const { metrics = [], confidenceLevel = 0.95 } = req.body;
      
      const analysis = await ipsEvaluationService.compareToProduction(
        experimentId,
        variantId,
        metrics,
        confidenceLevel
      );
      res.json(analysis);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to perform IPS analysis';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/shadow/experiments/:experimentId/ips-batch-analysis', async (req, res) => {
    try {
      const { experimentId } = req.params;
      const { metrics = [], confidenceLevel = 0.95 } = req.body;
      
      const analysis = await ipsEvaluationService.batchAnalyzeVariants(
        experimentId,
        metrics,
        confidenceLevel
      );
      res.json(analysis);
    } catch (error) {
      res.status(500).json({ error: 'Failed to perform batch IPS analysis' });
    }
  });

  app.get('/api/shadow/experiments/:experimentId/variants/:variantId/ips-validation', async (req, res) => {
    try {
      const { experimentId, variantId } = req.params;
      const validation = await ipsEvaluationService.validateIPSAssumptions(experimentId, variantId);
      res.json(validation);
    } catch (error) {
      res.status(500).json({ error: 'Failed to validate IPS assumptions' });
    }
  });

  // Regret Analysis
  app.post('/api/shadow/experiments/:experimentId/variants/:variantId/regret-analysis', async (req, res) => {
    try {
      const { experimentId, variantId } = req.params;
      const timeRange = req.body.timeRange ? {
        start: new Date(req.body.timeRange.start),
        end: new Date(req.body.timeRange.end)
      } : undefined;
      
      const analysis = await regretAnalysisService.analyzeExperimentRegret(
        experimentId,
        variantId,
        timeRange
      );
      res.json(analysis);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to perform regret analysis';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/shadow/experiments/:experimentId/regret-comparison', async (req, res) => {
    try {
      const { experimentId } = req.params;
      const { variantIds, timeRange } = req.body;
      
      const processedTimeRange = timeRange ? {
        start: new Date(timeRange.start),
        end: new Date(timeRange.end)
      } : undefined;
      
      const comparison = await regretAnalysisService.compareVariantRegret(
        experimentId,
        variantIds,
        processedTimeRange
      );
      res.json(comparison);
    } catch (error) {
      res.status(500).json({ error: 'Failed to compare variant regret' });
    }
  });

  app.get('/api/shadow/experiments/:experimentId/variants/:variantId/regret-bounds', async (req, res) => {
    try {
      const { experimentId, variantId } = req.params;
      const confidenceLevel = parseFloat(req.query.confidenceLevel as string) || 0.95;
      const timeHorizon = req.query.timeHorizon ? parseInt(req.query.timeHorizon as string) : undefined;
      
      const bounds = await regretAnalysisService.calculateRegretBounds(
        experimentId,
        variantId,
        confidenceLevel,
        timeHorizon
      );
      res.json(bounds);
    } catch (error) {
      res.status(500).json({ error: 'Failed to calculate regret bounds' });
    }
  });

  // Thompson Sampling
  app.get('/api/shadow/experiments/:experimentId/variants/:variantId/thompson-beliefs', async (req, res) => {
    try {
      const { experimentId, variantId } = req.params;
      const beliefs = await thompsonSamplingService.getBeliefs(experimentId, variantId);
      res.json(beliefs);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch Thompson sampling beliefs' });
    }
  });

  app.post('/api/shadow/experiments/:experimentId/variants/:variantId/thompson-analysis', async (req, res) => {
    try {
      const { experimentId, variantId } = req.params;
      const timeRange = req.body.timeRange ? {
        start: new Date(req.body.timeRange.start),
        end: new Date(req.body.timeRange.end)
      } : undefined;
      
      const analysis = await thompsonSamplingService.analyzeThompsonSamplingPerformance(
        experimentId,
        variantId,
        timeRange
      );
      res.json(analysis);
    } catch (error) {
      res.status(500).json({ error: 'Failed to analyze Thompson sampling performance' });
    }
  });

  app.get('/api/shadow/thompson-configurations', async (req, res) => {
    try {
      const configurations = thompsonSamplingService.generateThompsonSamplingConfigurations();
      res.json(configurations);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch Thompson sampling configurations' });
    }
  });

  // Policy Variants
  app.get('/api/shadow/policy-variants/:experimentType', async (req, res) => {
    try {
      const { experimentType } = req.params;
      const variants = policyVariantService.createComprehensiveExperiment(experimentType);
      res.json(variants);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate policy variants';
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/shadow/policy-variants/validate', async (req, res) => {
    try {
      const validation = policyVariantService.validatePolicyConfig(req.body);
      res.json(validation);
    } catch (error) {
      res.status(400).json({ error: 'Failed to validate policy configuration' });
    }
  });

  // Shadow Engine Testing
  app.post('/api/shadow/test-decision', async (req, res) => {
    try {
      const { conversationId, experimentIds = [] } = req.body;
      
      // Get conversation context
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      const messages = await storage.getMessages(conversationId, 10);
      const metrics = await storage.getLatestMetrics(conversationId);
      
      if (!metrics) {
        return res.status(404).json({ error: 'No metrics available for conversation' });
      }

      // Create context for shadow decision
      const context = {
        conversationId,
        conversation,
        messages,
        metrics,
        timestamp: new Date()
      };

      // Run shadow decisions for active experiments
      const shadowResults = await shadowDecisionEngine.runShadowDecisions(context, experimentIds);
      
      res.json({
        context: {
          conversationId,
          messageCount: messages.length,
          qualificationScore: metrics.qualificationScore,
          conversationStage: context
        },
        shadowResults
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to run shadow decision test';
      res.status(500).json({ error: message });
    }
  });

  // Analytics and Reporting
  app.get('/api/shadow/experiments/:experimentId/analytics', async (req, res) => {
    try {
      const { experimentId } = req.params;
      const windowDays = parseInt(req.query.windowDays as string) || 30;
      
      // Get experiment status
      const experimentStatus = await experimentService.getExperimentStatus(experimentId);
      
      // Get IPS analysis for all variants
      const experiment = await storage.getExperiment(experimentId);
      if (!experiment) {
        return res.status(404).json({ error: 'Experiment not found' });
      }

      const metrics = experiment.secondaryMetrics as string[] || [];
      if (experiment.primaryMetric) {
        metrics.unshift(experiment.primaryMetric);
      }

      const ipsAnalysis = await ipsEvaluationService.batchAnalyzeVariants(
        experimentId,
        metrics,
        0.95
      );

      // Get regret comparison
      const regretComparison = await regretAnalysisService.compareVariantRegret(experimentId);

      // Get system metrics comparison
      const systemComparison = await storage.getSystemMetricsComparison(windowDays);

      const analytics = {
        experiment: experimentStatus.experiment,
        variants: experimentStatus.variants,
        statistics: experimentStatus.stats,
        ipsAnalysis,
        regretComparison,
        systemComparison,
        isReadyForDecision: experimentStatus.isReadyForAnalysis,
        emergencyStopTriggered: experimentStatus.emergencyStopTriggered,
        generatedAt: new Date().toISOString()
      };

      res.json(analytics);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate analytics';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/shadow/experiments/:experimentId/export', async (req, res) => {
    try {
      const { experimentId } = req.params;
      const format = req.query.format as string || 'json';
      
      // Get comprehensive experiment data
      const experimentStatus = await experimentService.getExperimentStatus(experimentId);
      const shadowDecisions = await storage.getShadowDecisions(undefined, experimentId);
      
      const exportData = {
        experiment: experimentStatus.experiment,
        variants: experimentStatus.variants,
        shadowDecisions,
        statistics: experimentStatus.stats,
        exportedAt: new Date().toISOString(),
        exportFormat: format
      };

      if (format === 'csv') {
        // Convert to CSV format (simplified)
        const csvData = shadowDecisions.map(decision => ({
          timestamp: decision.timestamp,
          variantId: decision.variantId,
          conversationId: decision.conversationId,
          executionTime: decision.executionTimeMs,
          errorOccurred: decision.errorOccurred
        }));
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=experiment_${experimentId}.csv`);
        res.send(JSON.stringify(csvData)); // Would convert to proper CSV in production
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=experiment_${experimentId}.json`);
        res.json(exportData);
      }
    } catch (error) {
      res.status(500).json({ error: 'Failed to export experiment data' });
    }
  });

  // System Status for Shadow Testing
  app.get('/api/shadow/system/status', async (req, res) => {
    try {
      const activeExperiments = await storage.getActiveExperiments();
      const recentDecisions = await storage.getShadowDecisions(undefined, undefined, 100);
      
      // Calculate system health metrics
      const errorRate = recentDecisions.length > 0 ? 
        recentDecisions.filter(d => d.errorOccurred).length / recentDecisions.length : 0;
      
      const avgExecutionTime = recentDecisions.length > 0 ?
        recentDecisions.reduce((sum, d) => sum + (d.executionTimeMs || 0), 0) / recentDecisions.length : 0;

      const systemStatus = {
        shadowTesting: {
          status: errorRate < 0.1 ? 'healthy' : 'degraded',
          activeExperiments: activeExperiments.length,
          recentDecisions: recentDecisions.length,
          errorRate: errorRate,
          avgExecutionTime: avgExecutionTime
        },
        productionImpact: {
          resourceUsage: 'normal', // Would calculate actual resource usage
          latencyImpact: avgExecutionTime < 100 ? 'minimal' : 'moderate',
          isolationStatus: 'active'
        },
        capabilities: {
          ipsEvaluation: 'enabled',
          regretAnalysis: 'enabled',
          thompsonSampling: 'enabled',
          culturalAdaptation: 'enabled',
          budgetDetection: 'enabled'
        },
        timestamp: new Date().toISOString()
      };

      res.json(systemStatus);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch shadow testing system status' });
    }
  });

  // Safety Management API Endpoints
  app.get('/api/shadow/safety/status', async (req, res) => {
    try {
      const safetyStatus = await safetyService.getComprehensiveSafetyStatus();
      res.json(safetyStatus);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch safety status' });
    }
  });

  app.post('/api/shadow/safety/emergency-stop', async (req, res) => {
    try {
      const { reason } = req.body;
      const triggeredBy = req.headers['user-id'] as string || 'api_user';
      
      if (!reason) {
        return res.status(400).json({ error: 'Reason is required for emergency stop' });
      }

      await safetyService.triggerEmergencyStop(reason, triggeredBy);
      res.json({ 
        success: true, 
        message: 'Emergency stop triggered successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to trigger emergency stop';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/shadow/safety/clear-emergency-stop', async (req, res) => {
    try {
      const { reason } = req.body;
      const clearedBy = req.headers['user-id'] as string || 'api_user';
      
      if (!reason) {
        return res.status(400).json({ error: 'Reason is required to clear emergency stop' });
      }

      await safetyService.clearEmergencyStop(clearedBy, reason);
      res.json({ 
        success: true, 
        message: 'Emergency stop cleared successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to clear emergency stop';
      res.status(400).json({ error: message });
    }
  });

  app.get('/api/shadow/safety/config', async (req, res) => {
    try {
      const config = safetyService.getSafetyConfig();
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch safety configuration' });
    }
  });

  app.put('/api/shadow/safety/config', async (req, res) => {
    try {
      safetyService.updateSafetyConfig(req.body);
      res.json({ 
        success: true, 
        message: 'Safety configuration updated successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(400).json({ error: 'Failed to update safety configuration' });
    }
  });

  app.get('/api/shadow/safety/history', async (req, res) => {
    try {
      const hours = parseInt(req.query.hours as string) || 24;
      const history = safetyService.getSafetyHistory(hours);
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch safety history' });
    }
  });

  // Test endpoints
  app.post('/api/test/send-whatsapp', async (req, res) => {
    try {
      const { to, message } = req.body;
      
      if (!whatsappService.isValidPhoneNumber(to)) {
        return res.status(400).json({ error: 'Invalid phone number' });
      }

      const sent = await whatsappService.sendMessage(to, message);
      res.json({ sent, message: sent ? 'Message sent successfully' : 'Failed to send message' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to send test message' });
    }
  });

  // Health check
  app.get('/api/health', async (req, res) => {
    try {
      const systemMetrics = await storage.getSystemMetrics();
      const wsConnections = websocketService.getConnectedClientsCount();
      
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        connections: {
          websocket: wsConnections,
          database: 'connected' // Would check actual DB connection
        },
        metrics: systemMetrics
      });
    } catch (error) {
      res.status(503).json({ 
        status: 'unhealthy', 
        error: 'System check failed',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Performance monitoring endpoints
  app.get('/api/system/performance', (req, res) => {
    try {
      const traceId = (req as any).traceId;
      const spanId = tracingService.startSpan(traceId, 'get_performance_stats');
      
      const latencyStats = tracingService.getLatencyStats();
      const errorStats = tracingService.getErrorStats();
      const systemStats = tracingService.getStats();
      
      const performanceData = {
        latencyStats,
        errorStats,
        systemStats,
        timestamp: new Date().toISOString()
      };
      
      tracingService.finishSpan(spanId, 'success', performanceData);
      res.json(performanceData);
    } catch (error) {
      tracingService.recordError('GET', '/api/system/performance', error as Error, (req as any).traceId);
      res.status(500).json({ error: 'Failed to fetch performance data' });
    }
  });

  // SLO monitoring endpoint
  app.get('/api/system/slo', (req, res) => {
    try {
      const traceId = (req as any).traceId;
      const spanId = tracingService.startSpan(traceId, 'get_slo_status');
      
      const latencyStats = tracingService.getLatencyStats();
      const errorStats = tracingService.getErrorStats();
      
      // Calculate SLO metrics
      const sloMetrics = {
        availability: {
          target: 99.9,
          current: calculateAvailability(errorStats),
          status: 'healthy'
        },
        latency: {
          target_p95: 2000, // 2 seconds
          current_p95: calculateP95Latency(latencyStats),
          status: 'healthy'
        },
        errorRate: {
          target: 0.1, // 0.1%
          current: calculateErrorRate(errorStats, latencyStats),
          status: 'healthy'
        },
        timestamp: new Date().toISOString()
      };
      
      // Update statuses based on thresholds
      if (sloMetrics.availability.current < sloMetrics.availability.target) {
        sloMetrics.availability.status = 'degraded';
      }
      if (sloMetrics.latency.current_p95 > sloMetrics.latency.target_p95) {
        sloMetrics.latency.status = 'degraded';
      }
      if (sloMetrics.errorRate.current > sloMetrics.errorRate.target) {
        sloMetrics.errorRate.status = 'degraded';
      }
      
      // Log SLO violations
      const violations = Object.entries(sloMetrics)
        .filter(([key, metric]) => typeof metric === 'object' && metric.status === 'degraded')
        .map(([key]) => key);
      
      if (violations.length > 0) {
        tracingService.logStructured('error', 'slo_violation_detected', {
          traceId,
          violations,
          metrics: sloMetrics
        });
      }
      
      tracingService.finishSpan(spanId, 'success', sloMetrics);
      res.json(sloMetrics);
    } catch (error) {
      tracingService.recordError('GET', '/api/system/slo', error as Error, (req as any).traceId);
      res.status(500).json({ error: 'Failed to fetch SLO data' });
    }
  });

  return httpServer;
}
