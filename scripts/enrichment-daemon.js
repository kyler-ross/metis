// PM AI Starter Kit - enrichment-daemon.js
#!/usr/bin/env node
/**
 * @deprecated This daemon is no longer used. Enrichment is now handled by:
 *   - enrichment-runner.cjs (called by the scheduler's local worker)
 *   - context-enrichment.cjs curate (incremental about-me.md updates)
 *
 * The launchd plist has been disabled.
 * See context-enrichment-system.md for the current architecture.
 *
 * --- Original description ---
 * PM AI Analytics - Unified Enrichment Daemon
 *
 * Long-running background worker that processes:
 * - Session enrichment (from chats.db)
 * - Transcript fact extraction (from private_transcripts)
 * - Full synthesis pipeline (facts -> themes -> insights -> dossiers)
 * - Project tracker updates (from SoS transcripts)
 *
 * Features:
 * - Multiple concurrent workers
 * - Automatic retry on failure
 * - Health monitoring
 * - Graceful shutdown
 * - File watching for new transcripts
 *
 * Required environment variables:
 *   GEMINI_API_KEY - Gemini API key for fact extraction
 *
 * Usage:
 *   node scripts/enrichment-daemon.js
 */

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

const { track, trackComplete, trackError, flush } = require('./lib/telemetry.cjs');

// Configuration
const WORKER_COUNT = parseInt(process.env.ENRICHMENT_WORKERS || '3');
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || '5000');
const HEALTH_CHECK_INTERVAL = 60000; // 1 minute
const MAINTENANCE_INTERVAL = 3600000; // 1 hour
const TRANSCRIPT_POLL_INTERVAL = 300000; // 5 minutes
const SYNTHESIS_DEBOUNCE_MS = 60000; // 1 minute debounce after transcript changes

/**
 * EnrichmentDaemon - Background worker process
 *
 * NOTE: This daemon requires several library modules that are not included in the
 * starter kit (analytics-db, enrichment-queue, transcript-watcher, synthesis-jobs).
 * It is provided as a reference architecture for building your own enrichment pipeline.
 *
 * To use this daemon, you'll need to implement:
 * - An analytics database module (for session storage and querying)
 * - An enrichment queue (for job management)
 * - A transcript watcher (for detecting new transcript files)
 * - Synthesis jobs (for running the enrichment pipeline)
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
    const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
    const transcriptsDir = path.join(rootDir, 'local/private_transcripts');

    if (!fs.existsSync(transcriptsDir)) {
      console.log(`Transcripts directory not found: ${transcriptsDir}`);
      console.log('Create it to enable transcript watching.');
      return;
    }

    console.log(`Watching for transcripts in: ${transcriptsDir}`);
    // NOTE: TranscriptWatcher implementation not included in starter kit.
    // Implement file watching using fs.watch() or chokidar for your use case.
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
    if (type === 'full_synthesis') {
      const existing = this.synthesisQueue.find(j =>
        j.type === 'full_synthesis' && j.status === 'pending'
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
      this.enqueueSynthesisJob('full_synthesis');
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
      // NOTE: synthesisJobs.handleJob() not included in starter kit.
      // Implement your own synthesis pipeline here.
      job.status = 'completed';
      console.log(`Synthesis job completed: ${job.type}`);
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

    // Start transcript watcher for synthesis
    this.startTranscriptWatcher();

    // Spawn workers
    for (let i = 0; i < WORKER_COUNT; i++) {
      this.workers.push(this.runWorker(i));
    }

    // Spawn synthesis worker (single thread for expensive AI ops)
    this.workers.push(this.runSynthesisWorker());

    // Health check interval
    setInterval(() => this.logHealth(), HEALTH_CHECK_INTERVAL);

    // Maintenance interval (cleanup old jobs)
    setInterval(() => this.runMaintenance(), MAINTENANCE_INTERVAL);

    console.log('Daemon started, workers running');

    // Wait for all workers to complete (they won't until shutdown)
    await Promise.all(this.workers);
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
        this.enqueueSynthesisJob(trigger.type || 'full_synthesis');
      } else {
        console.log('Received SIGUSR1 but no trigger file found');
      }
    } catch (error) {
      console.error('Error handling external trigger:', error.message);
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

    while (this.isRunning) {
      try {
        // NOTE: Actual enrichment logic not included in starter kit.
        // Implement your own session enrichment here:
        // 1. Dequeue a job from the queue
        // 2. Process the session (extract facts via Gemini)
        // 3. Mark the job as completed or failed
        await sleep(POLL_INTERVAL);
      } catch (error) {
        console.error(`[Worker ${workerId}] Worker error: ${error.message}`);
        await sleep(5000); // Back off on errors
      }
    }

    console.log(`Worker ${workerId} stopped`);
  }

  /**
   * Log health status
   */
  logHealth() {
    const synthesisPending = this.synthesisQueue.filter(j => j.status === 'pending').length;
    const synthesisProcessing = this.synthesisQueue.filter(j => j.status === 'processing').length;

    console.log(`Health check - PID: ${process.pid}, Uptime: ${Math.floor(process.uptime())}s`);
    console.log(`  Synthesis jobs: ${synthesisPending} pending, ${synthesisProcessing} processing`);
  }

  /**
   * Run maintenance tasks
   */
  runMaintenance() {
    console.log('Running maintenance');
    // Clean up old synthesis jobs
    this.synthesisQueue = this.synthesisQueue.filter(j =>
      j.status === 'pending' || j.status === 'processing'
    );
  }

  /**
   * Graceful shutdown
   */
  async shutdown(signal) {
    console.log(`Received shutdown signal: ${signal}`);

    this.isRunning = false;

    // Clear any pending synthesis debounce
    if (this.synthesisDebounceTimer) {
      clearTimeout(this.synthesisDebounceTimer);
    }

    // Wait for workers to finish current jobs (max 30 seconds)
    const timeout = setTimeout(() => {
      console.warn('Shutdown timeout, forcing exit');
      this.removePidFile();
      process.exit(1);
    }, 30000);

    await Promise.all(this.workers);
    clearTimeout(timeout);

    // Cleanup
    this.removePidFile();

    console.log('Daemon shut down gracefully');
    track('pm_ai_enrichment_daemon_shutdown', { signal, uptime_seconds: Math.floor(process.uptime()) });
    await flush();
    process.exit(0);
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
      lastSynthesisRun: this.lastSynthesisRun
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
 * Main entry point
 */
async function main() {
  const startTime = Date.now();
  track('pm_ai_enrichment_daemon_start', { worker_count: WORKER_COUNT });

  try {
    const daemon = new EnrichmentDaemon();
    await daemon.start();
    // Note: start() runs indefinitely until shutdown signal
  } catch (error) {
    console.error(`Daemon failed to start: ${error.message}`);
    trackError('pm_ai_enrichment_daemon_error', error, {});
    await flush();
    process.exit(1);
  }
}

// Run daemon if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export default EnrichmentDaemon;
