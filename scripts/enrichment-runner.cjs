// PM AI Starter Kit - enrichment-runner.cjs
#!/usr/bin/env node

/**
 * Enrichment Runner
 *
 * Extracted from enrichment-daemon.js - runs the enrichment pipeline once and exits.
 * Called by the scheduler's local worker on a 5-minute interval.
 *
 * Steps:
 * 1. Sync conversations from Claude Code / Cursor
 * 2. Find unenriched sessions
 * 3. Enrich each session (extract facts via Gemini)
 * 4. Run synthesis if new facts were generated
 *
 * Required environment variables:
 *   GEMINI_API_KEY - Gemini API key for fact extraction
 *
 * Usage:
 *   node enrichment-runner.cjs              # Full run
 *   node enrichment-runner.cjs --sync-only  # Just sync conversations
 *   node enrichment-runner.cjs --facts-only # Sync + extract facts, skip synthesis
 *   node enrichment-runner.cjs --limit N    # Process max N sessions
 */

const path = require('path');
const { spawnSync } = require('child_process');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const PM_DIR = path.resolve(__dirname, '..');
const SCRIPTS_DIR = __dirname;

// Parse args
const SYNC_ONLY = process.argv.includes('--sync-only');
const FACTS_ONLY = process.argv.includes('--facts-only');
const LIMIT = (() => {
  const idx = process.argv.indexOf('--limit');
  return idx !== -1 ? parseInt(process.argv[idx + 1]) || 10 : 10;
})();

/**
 * Run a child script step with standardized logging, error handling, and timeouts.
 * @param {string} label - Log prefix label (e.g., 'sync', 'enrich')
 * @param {string} scriptPath - Absolute path to the script to run
 * @param {string[]} args - Arguments to pass to the script
 * @param {number} timeoutMs - Timeout in milliseconds (default 60000)
 * @returns {{ success: boolean, stdout: string, stderr: string }}
 */
function runStep(label, scriptPath, args = [], timeoutMs = 60000) {
  console.log(`[${label}] Running...`);
  const result = spawnSync('node', [scriptPath, ...args], {
    cwd: PM_DIR,
    encoding: 'utf-8',
    timeout: timeoutMs,
    env: process.env,
  });

  if (result.status !== 0) {
    console.error(`[${label}] Warning:`, (result.stderr || '').substring(0, 500));
  }

  return {
    success: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

async function syncConversations() {
  // NOTE: pm-data.cjs is not included in the starter kit.
  // Replace this with your own conversation sync script.
  const syncScript = path.join(SCRIPTS_DIR, 'pm-data.cjs');
  const fs = require('fs');
  if (!fs.existsSync(syncScript)) {
    console.log('[sync] pm-data.cjs not found - skipping conversation sync');
    console.log('[sync] Implement your own conversation sync or remove this step');
    return true;
  }

  const { success, stdout } = runStep('sync', syncScript, ['sync']);

  if (success) {
    const newMatch = stdout.match(/(\d+) new/);
    const totalMatch = stdout.match(/(\d+) total/);
    if (newMatch) console.log(`[sync] ${newMatch[1]} new sessions found`);
    if (totalMatch) console.log(`[sync] ${totalMatch[1]} total sessions`);
  }

  return success;
}

async function enrichSessions() {
  const args = ['run', '--limit', String(LIMIT)];
  if (FACTS_ONLY) args.push('--facts-only');

  const { success, stdout } = runStep(
    'enrich',
    path.join(SCRIPTS_DIR, 'context-enrichment.cjs'),
    args,
    300000
  );

  // Extract stats - regex is tolerant of format variations, with fallback logging
  const factsMatch = stdout.match(/(\d+)\s+facts?\b/i);
  const sessionsMatch = stdout.match(/(\d+)\s+sessions?\b/i);

  if (factsMatch) {
    console.log(`[enrich] ${factsMatch[1]} facts extracted`);
  } else if (success && stdout.length > 0) {
    console.log('[enrich] Completed but could not parse fact count from output');
  }
  if (sessionsMatch) {
    console.log(`[enrich] ${sessionsMatch[1]} sessions processed`);
  }

  const newFacts = factsMatch ? parseInt(factsMatch[1]) : 0;
  return { success, newFacts };
}

async function runSynthesis() {
  const { success } = runStep(
    'synthesis',
    path.join(SCRIPTS_DIR, 'context-enrichment.cjs'),
    ['run'],
    300000
  );

  if (success) {
    console.log('[synthesis] Complete');
  }

  return success;
}

async function main() {
  const startTime = Date.now();
  console.log(`[enrichment-runner] Started at ${new Date().toISOString()}`);

  // Step 1: Sync conversations
  const synced = await syncConversations();
  if (!synced) {
    console.error('[enrichment-runner] Sync failed, but continuing with enrichment...');
  }

  if (SYNC_ONLY) {
    console.log(`[enrichment-runner] Sync-only mode, done in ${Date.now() - startTime}ms`);
    return;
  }

  // Step 2: Enrich sessions (extract facts)
  const enrichResult = await enrichSessions();

  if (FACTS_ONLY) {
    console.log(`[enrichment-runner] Facts-only mode, done in ${Date.now() - startTime}ms`);
    return;
  }

  // Step 3: Run synthesis if new facts were generated
  if (enrichResult.newFacts > 0) {
    await runSynthesis();
  } else {
    console.log('[synthesis] Skipped (no new facts)');
  }

  const duration = Date.now() - startTime;
  console.log(`[enrichment-runner] Completed in ${Math.round(duration / 1000)}s`);
}

main().catch(err => {
  console.error('[enrichment-runner] Fatal error:', err);
  process.exit(1);
});
