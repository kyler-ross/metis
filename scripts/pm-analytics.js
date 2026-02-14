#!/usr/bin/env node

/**
 * PM AI Analytics CLI
 *
 * Unified analytics for Cursor and Claude Code usage.
 *
 * Usage:
 *   node .ai/scripts/pm-analytics.js init     # Initialize database
 *   node .ai/scripts/pm-analytics.js sync     # Sync all sources
 *   node .ai/scripts/pm-analytics.js stats    # Show statistics
 *   node .ai/scripts/pm-analytics.js stats --json  # JSON output
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { run } = require('./lib/script-runner.cjs');
const { track } = require('./lib/telemetry.cjs');

import {
  initDatabase,
  syncAll,
  syncCursor,
  syncClaude,
  updateDailyStats
} from '../tools/lib/analytics-db/sync.js';

import {
  getStats,
  getRecentSessions,
  getDailyStats
} from '../tools/lib/analytics-db/query.js';

function printHelp() {
  console.log(`
PM AI Analytics CLI

Usage:
  pm-analytics <command> [options]

Commands:
  init          Initialize the analytics database
  sync          Sync all data sources (Cursor + Claude Code)
  sync-cursor   Sync only Cursor sessions
  sync-claude   Sync only Claude Code sessions
  stats         Show usage statistics
  recent        Show recent sessions

Options:
  --json        Output in JSON format
  --days=N      Number of days for stats (default: 7)
  --limit=N     Number of recent sessions (default: 20)

Examples:
  node .ai/scripts/pm-analytics.js init
  node .ai/scripts/pm-analytics.js sync
  node .ai/scripts/pm-analytics.js stats --json
  node .ai/scripts/pm-analytics.js recent --limit=10
`);
}

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function formatCost(cost) {
  return '$' + (cost || 0).toFixed(4);
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return d.toLocaleString();
}

async function main(command, flags) {
  const startTime = Date.now();
  const jsonOutput = flags.includes('--json');
  const daysFlag = flags.find(f => f.startsWith('--days='));
  const days = daysFlag ? parseInt(daysFlag.split('=')[1]) : 7;
  const limitFlag = flags.find(f => f.startsWith('--limit='));
  const limit = limitFlag ? parseInt(limitFlag.split('=')[1]) : 20;

  track('pm_ai_analytics_start', { command, json_output: jsonOutput });

  switch (command) {
    case 'init': {
      console.log('Initializing PM AI Analytics database...');
      const dbPath = initDatabase();
      console.log(`✓ Database created at: ${dbPath}`);
      break;
    }

    case 'sync': {
      console.log('Syncing all data sources...');
      const result = await syncAll();
      
      if (jsonOutput) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`\n✓ Sync complete:`);
        console.log(`  Cursor sessions: ${result.cursor.synced}`);
        console.log(`  Claude sessions: ${result.claude.synced}`);
      }
      break;
    }

    case 'sync-cursor': {
      console.log('Syncing Cursor sessions...');
      const result = await syncCursor();
      updateDailyStats();
      
      if (jsonOutput) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`✓ Synced ${result.synced} Cursor sessions`);
      }
      break;
    }

    case 'sync-claude': {
      console.log('Syncing Claude Code sessions...');
      const result = await syncClaude();
      updateDailyStats();
      
      if (jsonOutput) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`✓ Synced ${result.synced} Claude Code sessions`);
      }
      break;
    }

    case 'stats': {
      const stats = getStats();
      const daily = getDailyStats(days);
      
      if (jsonOutput) {
        console.log(JSON.stringify({ stats, daily }, null, 2));
      } else {
        console.log('\n═══════════════════════════════════════');
        console.log('           PM AI Analytics              ');
        console.log('═══════════════════════════════════════\n');

        console.log('TOTALS');
        console.log('───────────────────────────────────────');
        console.log(`  Total Sessions:     ${formatNumber(stats.totals.total_sessions)}`);
        console.log(`  Cursor Sessions:    ${formatNumber(stats.totals.cursor_sessions)}`);
        console.log(`  Claude Sessions:    ${formatNumber(stats.totals.claude_sessions)}`);
        console.log(`  Claude Tokens:      ${formatNumber(stats.totals.claude_tokens)}`);
        console.log(`  Claude Cost:        ${formatCost(stats.totals.claude_cost)}`);

        console.log('\nLAST 24 HOURS');
        console.log('───────────────────────────────────────');
        console.log(`  Sessions:           ${formatNumber(stats.last24h.sessions)}`);
        console.log(`  Cursor Messages:    ${formatNumber(stats.last24h.cursor_messages)}`);
        console.log(`  Claude Tokens:      ${formatNumber(stats.last24h.claude_tokens)}`);

        console.log('\nSYNC STATUS');
        console.log('───────────────────────────────────────');
        for (const [source, state] of Object.entries(stats.syncState)) {
          console.log(`  ${source}: ${formatDate(state.lastSync)} (${state.records} records)`);
        }

        if (daily.length > 0) {
          console.log('\nDAILY ACTIVITY (Last 7 days)');
          console.log('───────────────────────────────────────');
          for (const day of daily) {
            const total = (day.cursor_sessions || 0) + (day.claude_sessions || 0);
            console.log(`  ${day.date}: ${total} sessions`);
          }
        }

        console.log('\n═══════════════════════════════════════\n');
      }
      break;
    }

    case 'recent': {
      const sessions = getRecentSessions(limit);
      
      if (jsonOutput) {
        console.log(JSON.stringify(sessions, null, 2));
      } else {
        console.log('\nRECENT SESSIONS');
        console.log('═══════════════════════════════════════\n');
        
        for (const s of sessions) {
          const name = (s.name || 'Untitled').substring(0, 50);
          const time = s.updated_at ? new Date(s.updated_at).toLocaleString() : 'N/A';
          const badge = s.source === 'cursor' ? '🖱️' : '🤖';
          console.log(`${badge} ${name}`);
          console.log(`   ${s.type || 'unknown'} | ${time}`);
          console.log('');
        }
      }
      break;
    }

    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;

    default:
      if (command) {
        console.error(`Unknown command: ${command}`);
      }
      printHelp();
      throw new Error(command ? `Unknown command: ${command}` : 'No command provided');
  }
}

run({
  name: 'pm-analytics',
  mode: 'operational',
  services: [],
}, async (ctx) => {
  const command = ctx.args.positional[0];
  const flags = ctx.args.raw.slice(1);
  await main(command, flags);
});


