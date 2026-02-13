// PM AI Starter Kit - pm-analytics.js
#!/usr/bin/env node

/**
 * PM AI Analytics CLI
 *
 * Unified analytics for Cursor and Claude Code usage.
 *
 * NOTE: This script requires library modules that are not included in the
 * starter kit (analytics-db/sync.js, analytics-db/query.js). It is provided
 * as a reference architecture for building your own analytics system.
 *
 * To use this script, implement:
 *   - lib/analytics-db/sync.js (database initialization and syncing)
 *   - lib/analytics-db/query.js (statistics and session queries)
 *
 * Usage:
 *   node scripts/pm-analytics.js init     # Initialize database
 *   node scripts/pm-analytics.js sync     # Sync all sources
 *   node scripts/pm-analytics.js stats    # Show statistics
 *   node scripts/pm-analytics.js stats --json  # JSON output
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { track, trackComplete, trackError, flush } = require('./lib/telemetry.cjs');

const args = process.argv.slice(2);
const command = args[0];
const flags = args.slice(1);

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
  node scripts/pm-analytics.js init
  node scripts/pm-analytics.js sync
  node scripts/pm-analytics.js stats --json
  node scripts/pm-analytics.js recent --limit=10
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

async function main() {
  const startTime = Date.now();
  const jsonOutput = flags.includes('--json');
  const daysFlag = flags.find(f => f.startsWith('--days='));
  const days = daysFlag ? parseInt(daysFlag.split('=')[1]) : 7;
  const limitFlag = flags.find(f => f.startsWith('--limit='));
  const limit = limitFlag ? parseInt(limitFlag.split('=')[1]) : 20;

  track('pm_ai_analytics_start', { command, json_output: jsonOutput });

  // NOTE: The analytics database modules are not included in the starter kit.
  // This script serves as a reference. Replace the imports below with your own
  // analytics database implementation.
  console.log('NOTE: Analytics database modules not included in starter kit.');
  console.log('This script serves as a reference architecture.');
  console.log('Implement lib/analytics-db/sync.js and lib/analytics-db/query.js to use.');
  console.log('');

  switch (command) {
    case 'init': {
      console.log('Would initialize PM AI Analytics database...');
      console.log('[+] Database would be created at: ~/.pm-ai/analytics.db');
      break;
    }

    case 'sync': {
      console.log('Would sync all data sources...');
      console.log('  Sources: Cursor sessions, Claude Code sessions');
      break;
    }

    case 'sync-cursor': {
      console.log('Would sync Cursor sessions...');
      break;
    }

    case 'sync-claude': {
      console.log('Would sync Claude Code sessions...');
      break;
    }

    case 'stats': {
      if (jsonOutput) {
        console.log(JSON.stringify({
          note: 'Analytics database not initialized. Run init first.',
          totals: { total_sessions: 0, cursor_sessions: 0, claude_sessions: 0 }
        }, null, 2));
      } else {
        console.log('\n=========================================');
        console.log('           PM AI Analytics              ');
        console.log('=========================================\n');

        console.log('TOTALS');
        console.log('-----------------------------------------');
        console.log('  Total Sessions:     0');
        console.log('  Cursor Sessions:    0');
        console.log('  Claude Sessions:    0');
        console.log('  Claude Tokens:      0');
        console.log('  Claude Cost:        $0.0000');

        console.log('\nSYNC STATUS');
        console.log('-----------------------------------------');
        console.log('  No data synced yet. Run: node scripts/pm-analytics.js sync');

        console.log('\n=========================================\n');
      }
      break;
    }

    case 'recent': {
      if (jsonOutput) {
        console.log(JSON.stringify([], null, 2));
      } else {
        console.log('\nRECENT SESSIONS');
        console.log('=========================================\n');
        console.log('  No sessions found. Run sync first.');
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
      process.exit(1);
  }
}

main().then(async () => {
  await flush();
}).catch(async err => {
  trackError('pm_ai_analytics_error', err, { command });
  await flush();
  console.error('Error:', err.message);
  process.exit(1);
});
