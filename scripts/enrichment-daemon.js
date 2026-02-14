#!/usr/bin/env node
/**
 * @deprecated This daemon is no longer used. Enrichment is now handled by:
 *   - enrichment-runner.cjs (called by the scheduler's local worker)
 *   - context-enrichment.cjs curate (incremental about-me.md updates)
 *
 * The launchd plist (com.cloaked.pm-enrichment) has been disabled.
 * See context-enrichment-system.md for the current architecture.
 *
 * --- Original description ---
 * PM AI Analytics - Unified Enrichment Daemon
 *
 * Long-running background worker that processes:
 * - Session enrichment (from chats.db)
 * - Transcript fact extraction (from private_transcripts)
 * - Full synthesis pipeline (facts → themes → insights → dossiers)
 * - Project tracker updates (from SoS transcripts)
 *
 * Features:
 * - Multiple concurrent workers
 * - Automatic retry on failure
 * - Health monitoring
 * - Graceful shutdown
 * - File watching for new transcripts
 */

import { getDatabase } from '../tools/lib/analytics-db/sync.js';
import { enrichSessions, enrichSessionById, getUnenrichedSessions } from '../tools/lib/analytics-db/enrich.js';
import { EnrichmentQueue } from '../services/enrichment-queue.js';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Import CJS modules via createRequire
const require = createRequire(import.meta.url);

// Load environment variables from .env file (for manual runs outside launchd)
const dotenv = require('dotenv');
const scriptDir = path.dirname(new URL(import.meta.url).pathname);
dotenv.config({ path: path.join(scriptDir, '.env') });

const { TranscriptWatcher, getUnprocessedTranscripts } = require('./lib/transcript-watcher.cjs');
const synthesisJobs = require('./lib/synthesis-jobs.cjs');
const { run } = require('./lib/script-runner.cjs');
const { track, flush } = require('./lib/telemetry.cjs');

// Configuration
const WORKER_COUNT = parseInt(process.env.ENRICHMENT_WORKERS || '3');
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || '5000');
const HEALTH_CHECK_INTERVAL = 60000; // 1 minute
const MAINTENANCE_INTERVAL = 3600000; // 1 hour
const TRANSCRIPT_POLL_INTERVAL = 300000; // 5 minutes
const SYNTHESIS_DEBOUNCE_MS = 60000; // 1 minute debounce after transcript changes

// Synthesis job types (from synthesis-jobs.cjs)
const { JOB_TYPES } = synthesisJobs;

/**
 * EnrichmentDaemon - Background worker process
 */
class EnrichmentDaemon {
  constructor() {
    this.db = null;
    this.queue = null;
    this.workers = [];
    this.isRunning = false;
    this.pidFile = path.join(os.homedir(), '.pm-ai', 'enrichment-daemon.pid');

    // Synthesis state
    this.transcriptWatcher = null;
    this.synthesisQueue = []; // Simple in-memory queue for synthesis jobs
    this.synthesisDebounceTimer = null;
    this.lastSynthesisRun = null;
  }

  /**
   * Initialize daemon
   */
  async init() {
    console.log('Initializing enrichment daemon');

    // Check if already running
    if (this.isAlreadyRunning()) {
      throw new Error('Daemon already running (check PID file)');
    }

    // Check GEMINI_API_KEY
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable required');
    }

    // Initialize database and queue
    this.db = getDatabase();
    this.queue = new EnrichmentQueue(this.db);

    // Write PID file
    this.writePidFile();

    console.log(`Daemon initialized with ${WORKER_COUNT} workers`);
  }

  /**
   * Check if daemon is already running
   */
  isAlreadyRunning() {
    if (!fs.existsSync(this.pidFile)) {
      return false;
    }

    try {
      const pid = parseInt(fs.readFileSync(this.pidFile, 'utf-8'));

      // Check if process is running
      process.kill(pid, 0);
      console.warn(`Daemon already running (PID ${pid})`);
      return true;
    } catch (error) {
      // PID file exists but process is dead
      fs.unlinkSync(this.pidFile);
      return false;
    }
  }

  /**
   * Write PID file
   */
  writePidFile() {
    const pidDir = path.dirname(this.pidFile);
    if (!fs.existsSync(pidDir)) {
      fs.mkdirSync(pidDir, { recursive: true });
    }

    fs.writeFileSync(this.pidFile, process.pid.toString(), { mode: 0o600 });
    console.log(`PID file written: ${this.pidFile} (PID: ${process.pid})`);
  }

  /**
   * Remove PID file
   */
  removePidFile() {
    if (fs.existsSync(this.pidFile)) {
      fs.unlinkSync(this.pidFile);
      console.log('PID file removed');
    }
  }

  /**
   * Start transcript watcher
   */
  startTranscriptWatcher() {
    // Use __dirname-relative path instead of hardcoded path
    const pmDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
    const transcriptsDir = path.join(pmDir, '.ai/local/private_transcripts');

    this.transcriptWatcher = new TranscriptWatcher({
      transcriptsDir,
      pollIntervalMs: TRANSCRIPT_POLL_INTERVAL,
      verbose: true,
      onNewTranscript: async (file) => {
        console.log(`New transcript detected: ${file.name}`);
        // API key accessed via process.env at execution time, not stored in job data (prevents secret persistence in queue)
        this.enqueueSynthesisJob(JOB_TYPES.TRANSCRIPT_FACTS, {
          transcriptPath: file.path
        });
        // Schedule full synthesis after processing
        this.scheduleSynthesis();
      },
      onTranscriptChanged: async (file) => {
        console.log(`Transcript changed: ${file.name}`);
        this.enqueueSynthesisJob(JOB_TYPES.TRANSCRIPT_FACTS, {
          transcriptPath: file.path
        });
        this.scheduleSynthesis();
      }
    });

    this.transcriptWatcher.start();
    console.log('Transcript watcher started');
  }

  /**
   * Stop transcript watcher
   */
  stopTranscriptWatcher() {
    if (this.transcriptWatcher) {
      this.transcriptWatcher.stop();
      this.transcriptWatcher = null;
    }
  }

  /**
   * Enqueue a synthesis job
   */
  enqueueSynthesisJob(type, data = {}) {
    const job = {
      id: `${type}_${Date.now()}`,
      type,
      data,
      status: 'pending',
      created_at: new Date().toISOString()
    };

    // Avoid duplicate full_synthesis jobs
    if (type === JOB_TYPES.FULL_SYNTHESIS) {
      const existing = this.synthesisQueue.find(j =>
        j.type === JOB_TYPES.FULL_SYNTHESIS && j.status === 'pending'
      );
      if (existing) {
        console.log('Full synthesis already queued, skipping');
        return;
      }
    }

    this.synthesisQueue.push(job);
    console.log(`Enqueued synthesis job: ${type} (queue size: ${this.synthesisQueue.length})`);
  }

  /**
   * Schedule synthesis with debouncing
   * Waits for SYNTHESIS_DEBOUNCE_MS after last transcript change before running
   */
  scheduleSynthesis() {
    if (this.synthesisDebounceTimer) {
      clearTimeout(this.synthesisDebounceTimer);
    }

    this.synthesisDebounceTimer = setTimeout(() => {
      this.enqueueSynthesisJob(JOB_TYPES.FULL_SYNTHESIS);
      this.enqueueSynthesisJob(JOB_TYPES.PROJECT_TRACKER);
      this.synthesisDebounceTimer = null;
    }, SYNTHESIS_DEBOUNCE_MS);

    console.log(`Synthesis scheduled (debounce: ${SYNTHESIS_DEBOUNCE_MS}ms)`);
  }

  /**
   * Process pending synthesis jobs
   * Called periodically from the main loop
   */
  async processSynthesisQueue() {
    if (this.synthesisQueue.length === 0) return;

    // Get next pending job
    const job = this.synthesisQueue.find(j => j.status === 'pending');
    if (!job) return;

    job.status = 'processing';
    console.log(`Processing synthesis job: ${job.type}`);

    try {
      const result = await synthesisJobs.handleJob(job);

      if (result.success) {
        job.status = 'completed';
        console.log(`Synthesis job completed: ${job.type}`, result.stats || {});
      } else {
        job.status = 'failed';
        console.error(`Synthesis job failed: ${job.type}`, result.error);
      }
    } catch (error) {
      job.status = 'failed';
      console.error(`Synthesis job error: ${job.type}`, error.message);
    }

    // Clean up old completed/failed jobs
    this.synthesisQueue = this.synthesisQueue.filter(j =>
      j.status === 'pending' || j.status === 'processing' ||
      (Date.now() - new Date(j.created_at).getTime() < 3600000) // Keep for 1 hour
    );
  }

  /**
   * Handle external trigger signal (SIGUSR1)
   * Reads trigger file to determine what to run
   */
  handleExternalTrigger() {
    const triggerFile = path.join(os.homedir(), '.pm-ai', 'trigger-synthesis.json');

    try {
      if (fs.existsSync(triggerFile)) {
        const trigger = JSON.parse(fs.readFileSync(triggerFile, 'utf-8'));
        console.log(`Received external trigger: ${trigger.type}`);

        // Clean up trigger file
        fs.unlinkSync(triggerFile);

        // Queue the synthesis
        this.triggerSynthesis(trigger.type);
      } else {
        console.log('Received SIGUSR1 but no trigger file found');
      }
    } catch (error) {
      console.error('Error handling external trigger:', error.message);
    }
  }

  /**
   * Trigger manual synthesis run
   * Called via daemon-manager trigger command
   */
  async triggerSynthesis(type = 'full') {
    switch (type) {
      case 'full':
        this.enqueueSynthesisJob(JOB_TYPES.FULL_SYNTHESIS);
        break;
      case 'projects':
        this.enqueueSynthesisJob(JOB_TYPES.PROJECT_TRACKER);
        break;
      case 'outputs':
        this.enqueueSynthesisJob(JOB_TYPES.REGENERATE_OUTPUTS);
        break;
      default:
        console.error(`Unknown synthesis type: ${type}`);
    }
  }

  /**
   * Start daemon
   */
  async start() {
    await this.init();

    console.log(`Starting enrichment daemon with ${WORKER_COUNT} workers`);
    this.isRunning = true;

    // Setup signal handlers for graceful shutdown
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));

    // Setup SIGUSR1 for external trigger signals
    process.on('SIGUSR1', () => this.handleExternalTrigger());

    // Sync conversations from Cursor BEFORE enqueuing
    await this.syncConversations();

    // Enqueue existing unenriched sessions
    const unenriched = getUnenrichedSessions(1000, false);
    for (const s of unenriched) {
      this.queue.enqueue(s.id, s.source, 50);
    }
    console.log(`Initial queue populated with ${unenriched.length} sessions`);

    // Start transcript watcher for synthesis
    this.startTranscriptWatcher();

    // Check for unprocessed transcripts and queue them
    await this.queueUnprocessedTranscripts();

    // Spawn workers
    for (let i = 0; i < WORKER_COUNT; i++) {
      this.workers.push(this.runWorker(i));
    }

    // Spawn synthesis worker (single thread for expensive AI ops)
    this.workers.push(this.runSynthesisWorker());

    // Health check interval
    this.healthInterval = setInterval(() => this.logHealth(), HEALTH_CHECK_INTERVAL);

    // Maintenance interval (cleanup old jobs + sync conversations)
    this.maintenanceInterval = setInterval(() => this.runMaintenance(), MAINTENANCE_INTERVAL);

    // Conversation sync interval (every 5 minutes)
    this.syncInterval = setInterval(() => this.syncConversations(), 300000);

    console.log('Daemon started, workers running');

    // Wait for all workers to complete (they won't until shutdown)
    await Promise.all(this.workers);
  }

  /**
   * Queue unprocessed transcripts for fact extraction
   */
  async queueUnprocessedTranscripts() {
    try {
      // Use __dirname-relative path instead of hardcoded path
      const pmDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
      const transcriptsDir = path.join(pmDir, '.ai/local/private_transcripts');
      const unprocessed = getUnprocessedTranscripts(transcriptsDir);

      if (unprocessed.length > 0) {
        console.log(`Found ${unprocessed.length} unprocessed transcripts`);
        for (const file of unprocessed) {
          this.enqueueSynthesisJob(JOB_TYPES.TRANSCRIPT_FACTS, {
            transcriptPath: file.path
          });
        }
        // Schedule synthesis after processing all
        this.scheduleSynthesis();
      }
    } catch (error) {
      console.error('Failed to queue unprocessed transcripts:', error.message);
    }
  }

  /**
   * Run synthesis worker (single thread for expensive operations)
   */
  async runSynthesisWorker() {
    console.log('Synthesis worker started');

    while (this.isRunning) {
      try {
        await this.processSynthesisQueue();
        await sleep(POLL_INTERVAL);
      } catch (error) {
        console.error('Synthesis worker error:', error.message);
        await sleep(5000);
      }
    }

    console.log('Synthesis worker stopped');
  }

  /**
   * Run a single worker
   */
  async runWorker(workerId) {
    console.log(`Worker ${workerId} started`);

    // Update worker status to sleeping initially
    this.updateWorkerStatus(workerId, 'sleeping', null, null);

    while (this.isRunning) {
      try {
        // Dequeue one job
        const jobs = this.queue.dequeue(1);

        if (jobs.length === 0) {
          // No jobs available, sleep
          this.updateWorkerStatus(workerId, 'sleeping', null, null);
          await sleep(POLL_INTERVAL);
          continue;
        }

        const job = jobs[0];
        console.log(`[Worker ${workerId}] Processing job ${job.id} (session: ${job.session_id})`);

        // Update status to processing
        this.updateWorkerStatus(workerId, 'processing', job.id, job.session_id);

        try {
          // Enrich the specific session from the job (not just any unenriched session)
          const result = await enrichSessionById(job.session_id, job.source);

          if (result.success) {
            this.queue.complete(job.id);
            const status = result.skipped ? 'skipped (already enriched)' :
                          result.noContent ? 'no content' : result.title;
            console.log(`[Worker ${workerId}] Job ${job.id} completed: ${status}`);
          } else {
            throw new Error(result.error || 'Unknown enrichment error');
          }
        } catch (error) {
          this.queue.fail(job.id, error.message);
          console.error(`[Worker ${workerId}] Job ${job.id} failed: ${error.message}`);
        }

        // Back to idle before rate limit
        this.updateWorkerStatus(workerId, 'idle', null, null);

        // Rate limit (Gemini API)
        await sleep(200);

      } catch (error) {
        console.error(`[Worker ${workerId}] Worker error: ${error.message}`);
        this.updateWorkerStatus(workerId, 'sleeping', null, null);
        await sleep(5000); // Back off on errors
      }
    }

    // Mark worker as stopped
    this.updateWorkerStatus(workerId, 'sleeping', null, null);
    console.log(`Worker ${workerId} stopped`);
  }

  /**
   * Update worker status in database
   */
  updateWorkerStatus(workerId, status, jobId = null, sessionId = null) {
    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO worker_status (worker_id, status, current_job_id, current_session_id, started_at, last_heartbeat)
        VALUES (?, ?, ?, ?, CASE WHEN ? = 'processing' THEN datetime('now') ELSE NULL END, datetime('now'))
      `).run(workerId, status, jobId, sessionId, status);
    } catch (err) {
      // Silently fail to avoid breaking worker
      console.error(`Failed to update worker ${workerId} status: ${err.message}`);
    }
  }

  /**
   * Sync conversations from Cursor
   * Uses pm-data.cjs to sync data to chats.db
   */
  async syncConversations() {
    try {
      console.log('Syncing conversations via pm-data...');
      const { spawnSync: spawnSyncChild } = await import('child_process');
      // Use __dirname-relative path instead of hardcoded path
      const pmDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
      // Use process.execPath to get the full path to node binary
      // This ensures it works when launched via launchd (which has minimal PATH)
      const syncResult = spawnSyncChild(process.execPath, ['.ai/scripts/pm-data.cjs', 'sync'], {
        cwd: pmDir,
        stdio: 'pipe',
        timeout: 120000
      });
      if (syncResult.error) throw syncResult.error;
      if (syncResult.status !== 0) throw new Error(syncResult.stderr?.toString()?.substring(0, 200) || 'sync failed');
      console.log('Conversation sync complete');

      // Re-queue any new unenriched sessions found after sync
      await this.requeueUnenrichedSessions();
    } catch (error) {
      // Include PATH context to help debug launchd environment issues
      console.error(`Conversation sync failed: ${error.message}`);
      console.error(`  Node path: ${process.execPath}`);
      console.error(`  Working dir: ${path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')}`);
    }
  }

  /**
   * Check for and queue any unenriched sessions
   * Called after sync to catch newly imported sessions
   * Also fixes orphaned "completed" jobs where enrichment didn't actually happen
   */
  async requeueUnenrichedSessions() {
    try {
      const unenriched = getUnenrichedSessions(100, false);
      if (unenriched.length === 0) {
        return;
      }

      let enqueued = 0;
      let requeued = 0;

      for (const s of unenriched) {
        // Check existing job status
        const existing = this.queue.db.prepare(
          'SELECT id, status FROM enrichment_jobs WHERE session_id = ?'
        ).get(s.id);

        if (!existing) {
          // No job exists - create new one
          this.queue.enqueue(s.id, s.source, 50);
          enqueued++;
        } else if (existing.status === 'completed') {
          // Job marked completed but session wasn't actually enriched
          // This is a bug we're fixing - reset the job to pending
          this.queue.db.prepare(`
            UPDATE enrichment_jobs
            SET status = 'pending', attempts = 0, error = NULL,
                started_at = NULL, completed_at = NULL
            WHERE id = ?
          `).run(existing.id);
          requeued++;
        }
        // If status is 'pending' or 'processing', leave it alone
      }

      if (enqueued > 0 || requeued > 0) {
        console.log(`Re-queued ${enqueued} new + ${requeued} orphaned sessions after sync`);
      }
    } catch (error) {
      console.error(`Failed to re-queue unenriched sessions: ${error.message}`);
    }
  }

  /**
   * Log health status
   */
  logHealth() {
    const stats = this.queue.getStats();
    const pending = this.queue.getPendingCount();

    // Synthesis queue stats
    const synthesisPending = this.synthesisQueue.filter(j => j.status === 'pending').length;
    const synthesisProcessing = this.synthesisQueue.filter(j => j.status === 'processing').length;

    console.log(`Health check - PID: ${process.pid}, Uptime: ${Math.floor(process.uptime())}s`);
    console.log(`  Session enrichment: ${pending} pending`);
    console.log(`  Synthesis jobs: ${synthesisPending} pending, ${synthesisProcessing} processing`);

    // Log transcript watcher state
    if (this.transcriptWatcher) {
      const watcherState = this.transcriptWatcher.getState();
      console.log(`  Transcript watcher: ${watcherState.trackedFiles} files tracked`);
    }
  }

  /**
   * Run maintenance tasks
   */
  runMaintenance() {
    console.log('Running maintenance');
    this.queue.clearOldJobs(7);
    this.queue.resetStuckJobs();
  }

  /**
   * Graceful shutdown
   */
  async shutdown(signal) {
    if (!this.isRunning) return;
    this.isRunning = false;

    console.log(`Received shutdown signal: ${signal}`);

    // Stop transcript watcher
    this.stopTranscriptWatcher();

    // Clear any pending synthesis debounce
    if (this.synthesisDebounceTimer) {
      clearTimeout(this.synthesisDebounceTimer);
    }

    // Clear all periodic intervals to allow graceful exit
    if (this.healthInterval) clearInterval(this.healthInterval);
    if (this.maintenanceInterval) clearInterval(this.maintenanceInterval);
    if (this.syncInterval) clearInterval(this.syncInterval);

    // Wait for workers to finish current jobs (max 30 seconds)
    let shutdownComplete = false;
    const timeout = setTimeout(() => {
      if (shutdownComplete) return;
      shutdownComplete = true;
      console.error('Shutdown timeout - forced exit');
      this.removePidFile();
      process.exit(1);
    }, 30000);

    await Promise.all(this.workers);
    if (!shutdownComplete) {
      shutdownComplete = true;
      clearTimeout(timeout);
    }

    // Cleanup
    this.removePidFile();

    console.log('Daemon shut down gracefully');
    track('pm_ai_enrichment_daemon_shutdown', { signal, uptime_seconds: Math.floor(process.uptime()) });
    await flush();
  }

  /**
   * Get synthesis queue status (for external monitoring)
   */
  getSynthesisStatus() {
    return {
      queueLength: this.synthesisQueue.length,
      pending: this.synthesisQueue.filter(j => j.status === 'pending').length,
      processing: this.synthesisQueue.filter(j => j.status === 'processing').length,
      completed: this.synthesisQueue.filter(j => j.status === 'completed').length,
      failed: this.synthesisQueue.filter(j => j.status === 'failed').length,
      lastSynthesisRun: this.lastSynthesisRun,
      transcriptWatcher: this.transcriptWatcher?.getState() || null
    };
  }
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main entry point (wrapped by script-runner when executed directly)
 */
async function main() {
  track('pm_ai_enrichment_daemon_start', { worker_count: WORKER_COUNT });

  const daemon = new EnrichmentDaemon();
  await daemon.start();
  // Note: start() runs indefinitely until shutdown signal
}

// Run daemon if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  run({
    name: 'enrichment-daemon',
    mode: 'operational',
    services: [],
  }, async (ctx) => {
    await main();
  });
}

export default EnrichmentDaemon;
