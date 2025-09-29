#!/usr/bin/env node

import { Command } from 'commander';
import { storage } from './storage';
import { recordingService } from './services/recording';
import { replayEngine } from './services/replay';
import { tracingService } from './services/tracing';
import { idempotentCompute } from './services/idempotent';

const program = new Command();

program
  .name('replay-harness')
  .description('CLI for managing WhatsApp conversation recordings and replay testing')
  .version('1.0.0');

// Recording Management Commands
const recordingCmd = program
  .command('recording')
  .description('Manage conversation recordings');

recordingCmd
  .command('start')
  .description('Start recording a conversation')
  .requiredOption('-c, --conversation <id>', 'Conversation ID to record')
  .requiredOption('-n, --name <name>', 'Recording name')
  .option('-d, --description <desc>', 'Recording description')
  .action(async (options) => {
    try {
      const recording = await recordingService.startRecording(
        options.conversation,
        options.name,
        options.description
      );
      
      console.log('Recording started successfully:');
      console.log(JSON.stringify(recording, null, 2));
    } catch (error) {
      console.error('Failed to start recording:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

recordingCmd
  .command('list')
  .description('List all recordings')
  .option('-s, --status <status>', 'Filter by status (active, archived, corrupted)')
  .action(async (options) => {
    try {
      const recordings = await storage.listRecordings(options.status);
      
      console.log(`Found ${recordings.length} recordings:`);
      console.table(recordings.map(r => ({
        ID: r.id,
        Name: r.recordingName,
        Conversation: r.conversationId,
        Status: r.status,
        Events: r.webhookEventCount,
        Created: r.createdAt?.toISOString(),
        'Last Webhook': r.lastWebhookAt?.toISOString()
      })));
    } catch (error) {
      console.error('Failed to list recordings:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

recordingCmd
  .command('show')
  .description('Show recording details')
  .requiredOption('-i, --id <id>', 'Recording ID')
  .option('--with-events', 'Include webhook events')
  .action(async (options) => {
    try {
      const recording = await storage.getRecording(options.id);
      if (!recording) {
        console.error('Recording not found');
        process.exit(1);
      }

      console.log('Recording Details:');
      console.log(JSON.stringify(recording, null, 2));

      if (options.withEvents) {
        const events = await storage.getWebhookRecordings(options.id);
        console.log(`\\nWebhook Events (${events.length}):`);
        console.table(events.map(e => ({
          Sequence: e.sequenceNumber,
          'Trace ID': e.traceId,
          'Processing Hash': e.processingStateHash.substring(0, 12) + '...',
          'PII Status': e.piiStatus,
          Timestamp: e.timestamp?.toISOString()
        })));
      }
    } catch (error) {
      console.error('Failed to show recording:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Replay Commands
const replayCmd = program
  .command('replay')
  .description('Run replay tests');

replayCmd
  .command('run')
  .description('Run replay for a recording')
  .requiredOption('-r, --recording <id>', 'Recording ID to replay')
  .option('--skip-external-apis', 'Skip external API calls during replay')
  .option('--strict', 'Strict mode - fail on any discrepancy')
  .option('--timeout <ms>', 'Timeout in milliseconds', '30000')
  .action(async (options) => {
    try {
      console.log(`Starting replay for recording: ${options.recording}`);
      
      const config = {
        skipExternalAPIs: options.skipExternalApis || false,
        strictMode: options.strict || false,
        timeoutMs: parseInt(options.timeout),
        logLevel: 'detailed' as const
      };

      const result = await replayEngine.replayRecording(options.recording, config);
      
      console.log('\\nReplay Results:');
      console.log(`Success: ${result.success}`);
      console.log(`Reproducibility Rate: ${(result.reproducibilityRate * 100).toFixed(2)}%`);
      console.log(`Total Steps: ${result.totalSteps}`);
      console.log(`Reproducible Steps: ${result.reproducibleSteps}`);
      console.log(`Execution Time: ${result.executionTime}ms`);
      
      if (result.hashMismatches.length > 0) {
        console.log(`\\nHash Mismatches (${result.hashMismatches.length}):`);
        console.table(result.hashMismatches.map(m => ({
          Step: m.stepName,
          Severity: m.severity,
          'Original Hash': m.originalHash.substring(0, 12) + '...',
          'Replay Hash': m.replayHash.substring(0, 12) + '...'
        })));
      }
      
      if (result.errors.length > 0) {
        console.log(`\\nErrors (${result.errors.length}):`);
        console.table(result.errors.map(e => ({
          Step: e.stepName,
          Error: e.error,
          Recoverable: e.recoverable
        })));
      }
      
      if (!result.success) {
        process.exit(1);
      }
    } catch (error) {
      console.error('Replay failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

replayCmd
  .command('validate')
  .description('Validate reproducibility for all recordings')
  .option('--min-rate <rate>', 'Minimum reproducibility rate (0-1)', '0.95')
  .option('--sample-size <n>', 'Number of recordings to test', '10')
  .action(async (options) => {
    try {
      const minRate = parseFloat(options.minRate);
      const sampleSize = parseInt(options.sampleSize);
      
      console.log(`Running reproducibility validation (target: ${(minRate * 100).toFixed(1)}%)...`);
      
      const recordings = await storage.listRecordings('active');
      const testRecordings = recordings.slice(0, sampleSize);
      
      console.log(`Testing ${testRecordings.length} recordings...\\n`);
      
      let totalTests = 0;
      let passedTests = 0;
      const results = [];
      
      for (const recording of testRecordings) {
        try {
          console.log(`Testing: ${recording.recordingName}`);
          
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
            Recording: recording.recordingName,
            'Repro Rate': `${(result.reproducibilityRate * 100).toFixed(2)}%`,
            Steps: `${result.reproducibleSteps}/${result.totalSteps}`,
            'Hash Mismatches': result.hashMismatches.length,
            Errors: result.errors.length,
            Status: passed ? '✅ PASS' : '❌ FAIL'
          });
          
          console.log(`  → ${(result.reproducibilityRate * 100).toFixed(2)}% reproducible`);
          
        } catch (error) {
          totalTests++;
          results.push({
            Recording: recording.recordingName,
            'Repro Rate': 'ERROR',
            Steps: 'N/A',
            'Hash Mismatches': 'N/A',
            Errors: 'N/A',
            Status: '💥 ERROR'
          });
          console.log(`  → Error: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      console.log('\\nValidation Results:');
      console.table(results);
      
      const overallRate = totalTests > 0 ? passedTests / totalTests : 0;
      console.log(`\\nOverall Success Rate: ${(overallRate * 100).toFixed(2)}% (${passedTests}/${totalTests})`);
      console.log(`Target: ${(minRate * 100).toFixed(1)}%`);
      
      if (overallRate < minRate) {
        console.log('❌ Validation FAILED - Reproducibility below target');
        process.exit(1);
      } else {
        console.log('✅ Validation PASSED - Reproducibility meets target');
      }
      
    } catch (error) {
      console.error('Validation failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Cache Management Commands
const cacheCmd = program
  .command('cache')
  .description('Manage idempotent compute cache');

cacheCmd
  .command('stats')
  .description('Show cache statistics')
  .action(async () => {
    try {
      const stats = idempotentCompute.getCacheStats();
      
      console.log('Cache Statistics:');
      console.log(`Size: ${stats.size}/${stats.maxSize} entries`);
      console.log(`Hit Rate: ${(stats.hitRate * 100).toFixed(2)}%`);
      console.log(`Utilization: ${((stats.size / stats.maxSize) * 100).toFixed(2)}%`);
    } catch (error) {
      console.error('Failed to get cache stats:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

cacheCmd
  .command('clear')
  .description('Clear the entire cache')
  .option('--confirm', 'Confirm cache clearing')
  .action(async (options) => {
    try {
      if (!options.confirm) {
        console.log('Use --confirm to actually clear the cache');
        return;
      }
      
      idempotentCompute.clearCache();
      console.log('Cache cleared successfully');
    } catch (error) {
      console.error('Failed to clear cache:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

cacheCmd
  .command('invalidate')
  .description('Invalidate cache entries for a conversation')
  .requiredOption('-c, --conversation <id>', 'Conversation ID')
  .action(async (options) => {
    try {
      const invalidated = idempotentCompute.invalidateByConversation(options.conversation);
      console.log(`Invalidated ${invalidated} cache entries for conversation ${options.conversation}`);
    } catch (error) {
      console.error('Failed to invalidate cache:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Tracing Commands
const traceCmd = program
  .command('trace')
  .description('Manage execution traces');

traceCmd
  .command('stats')
  .description('Show tracing statistics')
  .action(async () => {
    try {
      const stats = tracingService.getStats();
      
      console.log('Tracing Statistics:');
      console.log(`Active Traces: ${stats.activeTraces}`);
      console.log(`Active Spans: ${stats.activeSpans}`);
      console.log(`Total Processed: ${stats.totalProcessed}`);
    } catch (error) {
      console.error('Failed to get trace stats:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

traceCmd
  .command('cleanup')
  .description('Clean up stale traces')
  .action(async () => {
    try {
      tracingService.cleanup();
      console.log('Trace cleanup completed');
    } catch (error) {
      console.error('Failed to cleanup traces:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Database Commands
const dbCmd = program
  .command('db')
  .description('Database utilities for replay harness');

dbCmd
  .command('stats')
  .description('Show database statistics')
  .action(async () => {
    try {
      const recordings = await storage.listRecordings();
      const activeRecordings = recordings.filter(r => r.status === 'active');
      
      console.log('Database Statistics:');
      console.log(`Total Recordings: ${recordings.length}`);
      console.log(`Active Recordings: ${activeRecordings.length}`);
      console.log(`Archived Recordings: ${recordings.filter(r => r.status === 'archived').length}`);
      console.log(`Corrupted Recordings: ${recordings.filter(r => r.status === 'corrupted').length}`);
      
      const totalEvents = recordings.reduce((sum, r) => sum + (r.webhookEventCount || 0), 0);
      console.log(`Total Webhook Events: ${totalEvents}`);
      
      if (activeRecordings.length > 0) {
        const avgEvents = totalEvents / recordings.length;
        console.log(`Average Events per Recording: ${avgEvents.toFixed(2)}`);
      }
    } catch (error) {
      console.error('Failed to get database stats:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Configuration Commands
const configCmd = program
  .command('config')
  .description('Manage replay harness configuration');

configCmd
  .command('show')
  .description('Show current configuration')
  .action(async () => {
    console.log('Replay Harness Configuration:');
    console.log(`Recording Enabled: ${process.env.ENABLE_RECORDING || 'false'}`);
    console.log(`PII Scrubbing: ${process.env.ENABLE_PII_SCRUBBING || 'true'}`);
    console.log(`Hash Validation: ${process.env.ENABLE_HASH_VALIDATION || 'true'}`);
    console.log(`External API Capture: ${process.env.ENABLE_API_CAPTURE || 'true'}`);
    console.log(`Max Webhook Events: ${process.env.MAX_WEBHOOK_EVENTS || '1000'}`);
  });

// Error handling
program.configureOutput({
  writeErr: (str) => process.stderr.write(str),
  writeOut: (str) => process.stdout.write(str),
});

// Run the CLI
if (require.main === module) {
  program.parse();
}

export { program };