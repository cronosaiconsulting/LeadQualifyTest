import type { Express } from "express";
import { storage } from "../storage";
import { recordingService } from "../services/recording";
import { replayEngine } from "../services/replay";
import { tracingService } from "../services/tracing";
import { idempotentCompute } from "../services/idempotent";
import { z } from "zod";

export function registerReplayRoutes(app: Express): void {
  
  // Recording Management Routes
  app.post('/api/recordings', async (req, res) => {
    try {
      const schema = z.object({
        conversationId: z.string(),
        recordingName: z.string(),
        description: z.string().optional()
      });
      
      const { conversationId, recordingName, description } = schema.parse(req.body);
      
      const recording = await recordingService.startRecording(
        conversationId,
        recordingName,
        description
      );
      
      res.json(recording);
    } catch (error) {
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Failed to create recording' 
      });
    }
  });

  app.get('/api/recordings', async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const recordings = await storage.listRecordings(status);
      res.json(recordings);
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to list recordings' 
      });
    }
  });

  app.get('/api/recordings/:id', async (req, res) => {
    try {
      const recording = await storage.getRecording(req.params.id);
      if (!recording) {
        return res.status(404).json({ error: 'Recording not found' });
      }
      
      res.json(recording);
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to get recording' 
      });
    }
  });

  app.get('/api/recordings/:id/events', async (req, res) => {
    try {
      const events = await storage.getWebhookRecordings(req.params.id);
      res.json(events);
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to get webhook events' 
      });
    }
  });

  app.get('/api/recordings/:id/traces', async (req, res) => {
    try {
      const events = await storage.getWebhookRecordings(req.params.id);
      const allTraces = [];
      
      for (const event of events) {
        const traces = await storage.getExecutionTraces(event.traceId);
        allTraces.push(...traces);
      }
      
      res.json(allTraces);
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to get execution traces' 
      });
    }
  });

  // Replay Routes
  app.post('/api/replay/:recordingId', async (req, res) => {
    try {
      const schema = z.object({
        skipExternalAPIs: z.boolean().optional().default(true),
        validateHashes: z.boolean().optional().default(true),
        strictMode: z.boolean().optional().default(false),
        timeoutMs: z.number().optional().default(30000),
        maxRetries: z.number().optional().default(3),
        logLevel: z.enum(['minimal', 'detailed', 'verbose']).optional().default('detailed')
      });
      
      const config = schema.parse(req.body);
      const recordingId = req.params.recordingId;
      
      const result = await replayEngine.replayRecording(recordingId, config);
      
      res.json(result);
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Replay failed' 
      });
    }
  });

  app.get('/api/replay-executions/:id', async (req, res) => {
    try {
      const execution = await storage.getReplayExecution(req.params.id);
      if (!execution) {
        return res.status(404).json({ error: 'Replay execution not found' });
      }
      
      res.json(execution);
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to get replay execution' 
      });
    }
  });

  app.get('/api/replay-executions/:id/validations', async (req, res) => {
    try {
      const validations = await storage.getTraceValidations(req.params.id);
      res.json(validations);
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to get validations' 
      });
    }
  });

  // Reproducibility Testing Routes
  app.post('/api/validate-reproducibility', async (req, res) => {
    try {
      const schema = z.object({
        minRate: z.number().min(0).max(1).optional().default(0.95),
        sampleSize: z.number().min(1).optional().default(10),
        recordingIds: z.array(z.string()).optional()
      });
      
      const { minRate, sampleSize, recordingIds } = schema.parse(req.body);
      
      let recordings;
      if (recordingIds) {
        recordings = [];
        for (const id of recordingIds) {
          const recording = await storage.getRecording(id);
          if (recording) recordings.push(recording);
        }
      } else {
        const allRecordings = await storage.listRecordings('active');
        recordings = allRecordings.slice(0, sampleSize);
      }
      
      const results = [];
      let totalTests = 0;
      let passedTests = 0;
      
      for (const recording of recordings) {
        try {
          const result = await replayEngine.replayRecording(recording.id, {
            skipExternalAPIs: true,
            validateHashes: true,
            strictMode: false,
            timeoutMs: 15000,
            maxRetries: 1,
            logLevel: 'minimal'
          });
          
          totalTests++;
          const passed = result.reproducibilityRate >= minRate;
          if (passed) passedTests++;
          
          results.push({
            recordingId: recording.id,
            recordingName: recording.recordingName,
            reproducibilityRate: result.reproducibilityRate,
            totalSteps: result.totalSteps,
            reproducibleSteps: result.reproducibleSteps,
            hashMismatches: result.hashMismatches.length,
            errors: result.errors.length,
            passed,
            executionTime: result.executionTime
          });
          
        } catch (error) {
          totalTests++;
          results.push({
            recordingId: recording.id,
            recordingName: recording.recordingName,
            reproducibilityRate: 0,
            totalSteps: 0,
            reproducibleSteps: 0,
            hashMismatches: 0,
            errors: 1,
            passed: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      
      const overallRate = totalTests > 0 ? passedTests / totalTests : 0;
      
      res.json({
        overallSuccessRate: overallRate,
        targetRate: minRate,
        passed: overallRate >= minRate,
        totalTests,
        passedTests,
        results
      });
      
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Validation failed' 
      });
    }
  });

  // Cache Management Routes
  app.get('/api/cache/stats', async (req, res) => {
    try {
      const stats = idempotentCompute.getCacheStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to get cache stats' 
      });
    }
  });

  app.delete('/api/cache', async (req, res) => {
    try {
      idempotentCompute.clearCache();
      res.json({ message: 'Cache cleared successfully' });
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to clear cache' 
      });
    }
  });

  app.delete('/api/cache/conversation/:conversationId', async (req, res) => {
    try {
      const invalidated = idempotentCompute.invalidateByConversation(req.params.conversationId);
      res.json({ 
        message: `Invalidated ${invalidated} cache entries`,
        invalidatedCount: invalidated 
      });
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to invalidate cache' 
      });
    }
  });

  // Tracing Routes
  app.get('/api/tracing/stats', async (req, res) => {
    try {
      const stats = tracingService.getStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to get tracing stats' 
      });
    }
  });

  app.post('/api/tracing/cleanup', async (req, res) => {
    try {
      tracingService.cleanup();
      res.json({ message: 'Trace cleanup completed' });
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to cleanup traces' 
      });
    }
  });

  // Health check for replay harness
  app.get('/api/replay/health', async (req, res) => {
    try {
      const cacheStats = idempotentCompute.getCacheStats();
      const traceStats = tracingService.getStats();
      const recordings = await storage.listRecordings();
      
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        components: {
          cache: {
            healthy: true,
            size: cacheStats.size,
            hitRate: cacheStats.hitRate
          },
          tracing: {
            healthy: true,
            activeTraces: traceStats.activeTraces,
            activeSpans: traceStats.activeSpans
          },
          recordings: {
            healthy: true,
            total: recordings.length,
            active: recordings.filter(r => r.status === 'active').length
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Health check failed'
      });
    }
  });
}