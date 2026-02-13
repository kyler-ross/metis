// PM AI Starter Kit - daemon-manager.js
#!/usr/bin/env node
/**
 * @deprecated This manager is no longer used. The enrichment daemon has been replaced by:
 *   - enrichment-runner.cjs (called by the scheduler's local worker)
 *   - context-enrichment.cjs curate (incremental about-me.md updates)
 *
 * See context-enrichment-system.md for the current architecture.
 *
 * --- Original description ---
 * PM AI Analytics - Daemon Manager
 *
 * Control script for starting, stopping, and monitoring the enrichment daemon
 */

import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';

// Use createRequire for CommonJS telemetry module
const require = createRequire(import.meta.url);
const { track, trackScript, flush } = require('./lib/telemetry.cjs');

const PID_FILE = path.join(os.homedir(), '.pm-ai', 'enrichment-daemon.pid');
const LOG_FILE = path.join(os.homedir(), '.pm-ai', 'enrichment-daemon.log');
const DAEMON_SCRIPT = new URL('./enrichment-daemon.js', import.meta.url).pathname;
const LAUNCHD_LABEL = process.env.PM_AI_LAUNCHD_LABEL || 'com.pm-ai.enrichment';

/**
 * Check if daemon is running via launchd (macOS)
 * Returns PID if running, false otherwise
 */
function isRunningViaLaunchd() {
  if (process.platform !== 'darwin') {
    return false;
  }

  try {
    // Get full launchctl list and filter in JS to avoid shell injection risk
    const output = execSync('launchctl list', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Find our service line
    const line = output.split('\n').find(l => l.includes(LAUNCHD_LABEL));
    if (!line) {
      return false;
    }

    // Format: "PID\tStatus\tLabel" - PID is first column, "-" if not running
    const parts = line.trim().split(/\s+/);
    // launchctl uses "-" for stopped processes
    if (parts[0] === '-') {
      return false;
    }
    const pid = parseInt(parts[0]);
    return isNaN(pid) ? false : pid;
  } catch (error) {
    return false;
  }
}

/**
 * Check if daemon is running
 * Checks both PID file (manual start) and launchd (auto-start on macOS)
 */
function isRunning() {
  // First check PID file (used when started via daemon-manager)
  if (fs.existsSync(PID_FILE)) {
    try {
      const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8'));
      process.kill(pid, 0); // Check if process exists
      return pid;
    } catch (error) {
      // PID file exists but process is dead
      fs.unlinkSync(PID_FILE);
    }
  }

  // Check launchd on macOS (used when started via LaunchAgent)
  const launchdPid = isRunningViaLaunchd();
  if (launchdPid) {
    return launchdPid;
  }

  return false;
}

/**
 * Start daemon
 */
function start() {
  const pid = isRunning();
  if (pid) {
    console.log(`[+] Daemon already running (PID ${pid})`);
    return;
  }

  console.log('Starting enrichment daemon...');

  // Ensure log directory exists
  const logDir = path.dirname(LOG_FILE);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // Open log file for appending
  const logFd = fs.openSync(LOG_FILE, 'a');

  // Spawn daemon as detached process
  const child = spawn('node', [DAEMON_SCRIPT], {
    detached: true,
    stdio: ['ignore', logFd, logFd]
  });

  child.unref(); // Allow parent to exit

  // Close the file descriptor in parent
  fs.closeSync(logFd);

  // Wait a bit to check if it started successfully
  setTimeout(() => {
    const newPid = isRunning();
    if (newPid) {
      console.log(`[+] Daemon started (PID ${newPid})`);
      console.log(`  Logs: ${LOG_FILE}`);
    } else {
      console.error('[-] Daemon failed to start (check logs)');
      process.exit(1);
    }
  }, 1000);
}

/**
 * Stop daemon
 */
function stop() {
  const pid = isRunning();
  if (!pid) {
    console.log('Daemon not running');
    return;
  }

  console.log(`Stopping daemon (PID ${pid})...`);

  try {
    process.kill(pid, 'SIGTERM');

    // Wait for graceful shutdown (max 30 seconds)
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;

      if (!isRunning()) {
        clearInterval(interval);
        console.log('[+] Daemon stopped');
        return;
      }

      if (attempts > 30) {
        clearInterval(interval);
        console.log('[!] Daemon did not stop gracefully, forcing...');

        try {
          process.kill(pid, 'SIGKILL');
          if (fs.existsSync(PID_FILE)) {
            fs.unlinkSync(PID_FILE);
          }
          console.log('[+] Daemon killed');
        } catch (error) {
          console.error('[-] Failed to kill daemon:', error.message);
        }
      }
    }, 1000);
  } catch (error) {
    console.error('[-] Failed to stop daemon:', error.message);
    process.exit(1);
  }
}

/**
 * Restart daemon
 */
function restart() {
  stop();
  setTimeout(() => start(), 2000);
}

/**
 * Show daemon status
 */
function status() {
  const pid = isRunning();

  if (pid) {
    console.log(`[+] Daemon running (PID ${pid})`);
    console.log(`  Logs: ${LOG_FILE}`);

    // Show last few log lines
    if (fs.existsSync(LOG_FILE)) {
      const logs = fs.readFileSync(LOG_FILE, 'utf-8');
      const lines = logs.split('\n').filter(l => l.trim()).slice(-10);

      console.log('\nRecent logs:');
      lines.forEach(line => console.log('  ' + line));
    }
  } else {
    console.log('[-] Daemon not running');
  }
}

/**
 * Tail logs
 */
function logs() {
  if (!fs.existsSync(LOG_FILE)) {
    console.log('No log file found');
    return;
  }

  // Use tail to follow log file
  const tail = spawn('tail', ['-f', LOG_FILE], {
    stdio: 'inherit'
  });

  process.on('SIGINT', () => {
    tail.kill();
    process.exit(0);
  });
}

/**
 * Main CLI
 */
const command = process.argv[2];
trackScript('daemon-manager', { command });

switch (command) {
  case 'start':
    track('daemon_start', {});
    start();
    flush();
    break;

  case 'stop':
    track('daemon_stop', {});
    stop();
    flush();
    break;

  case 'restart':
    track('daemon_restart', {});
    restart();
    flush();
    break;

  case 'status':
    status();
    break;

  case 'logs':
    logs();
    break;

  default:
    console.log(`
PM AI Analytics - Daemon Manager

Usage:
  node daemon-manager.js <command>

Commands:
  start    Start the enrichment daemon
  stop     Stop the enrichment daemon
  restart  Restart the enrichment daemon
  status   Show daemon status
  logs     Tail daemon logs

Examples:
  node scripts/daemon-manager.js start
  node scripts/daemon-manager.js status
  node scripts/daemon-manager.js logs
    `.trim());
    break;
}
