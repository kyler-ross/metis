// PM AI Starter Kit - context-enrichment.cjs
#!/usr/bin/env node
/**
 * Context Enrichment CLI (v3 - Unified Pipeline)
 *
 * Extracts structured facts from meeting transcripts and chat sessions,
 * synthesizes themes and insights, and generates narrative dossiers.
 *
 * Usage:
 *   node context-enrichment.cjs run [options]       Full 4-layer pipeline
 *   node context-enrichment.cjs chats [options]    Process only chat sessions
 *   node context-enrichment.cjs all [options]      Same as 'run' (alias)
 *   node context-enrichment.cjs stats              Database statistics
 *   node context-enrichment.cjs lineage <id>       Trace element provenance
 *   node context-enrichment.cjs migrate            Migrate V1 data to V3
 *   node context-enrichment.cjs regenerate         Re-run L2-L4 on existing facts
 */

const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Import unified pipeline
const pipeline = require('./lib/context-enrichment/pipeline.cjs');
const { track, trackScript, trackComplete, trackError, flush } = require('./lib/telemetry.cjs');

async function main() {
  const startTime = Date.now();
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  trackScript('context-enrichment', { command });

  // Parse common options
  const forceReprocess = args.includes('--force') || args.includes('-f');
  const dryRun = args.includes('--dry-run') || args.includes('-n');
  const factsOnly = args.includes('--facts-only');
  const sinceIdx = args.findIndex(a => a === '--since');
  const since = sinceIdx !== -1 && args[sinceIdx + 1] ? args[sinceIdx + 1] : null;
  const limitIdx = args.findIndex(a => a === '--limit');
  const limit = limitIdx !== -1 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1], 10) : 0;

  // Check for required env var
  if (['run', 'chats', 'all', 'regenerate', 'layer', 'curate'].includes(command)) {
    if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
      console.error('ERROR: GEMINI_API_KEY or GOOGLE_API_KEY required');
      console.error('Set in scripts/.env or environment');
      process.exit(1);
    }
  }

  try {
    switch (command) {
      // ========== PRIMARY COMMANDS ==========

      case 'run':
      case 'all': {
        // Full 4-layer pipeline (or facts-only if specified)
        await pipeline.runFullPipeline({
          forceReprocess,
          dryRun,
          factsOnly,
          since,
          limit,
          source: 'all'
        });
        break;
      }

      case 'chats': {
        // Process only chat sessions
        await pipeline.runFullPipeline({
          forceReprocess,
          dryRun,
          factsOnly,
          since,
          limit,
          source: 'chats'
        });
        break;
      }

      case 'transcripts': {
        // Process only transcripts
        await pipeline.runFullPipeline({
          forceReprocess,
          dryRun,
          factsOnly,
          since,
          limit,
          source: 'transcripts'
        });
        break;
      }

      // ========== LAYER COMMANDS ==========

      case 'layer': {
        const layer = args[1];
        if (!layer || !['1', '2', '3', '4', 'facts', 'themes', 'insights', 'dossier'].includes(layer)) {
          console.error('Usage: node context-enrichment.cjs layer <1|2|3|4|facts|themes|insights|dossier>');
          process.exit(1);
        }
        await pipeline.runLayer(layer, { forceReprocess, since, limit });
        break;
      }

      case 'regenerate': {
        // Re-run L2-L4 on existing facts (no re-extraction)
        await pipeline.regenerate({ dryRun });
        break;
      }

      case 'curate': {
        // Run curator standalone against existing facts/insights
        await pipeline.runCurator({ dryRun });
        break;
      }

      // ========== UTILITY COMMANDS ==========

      case 'stats':
        pipeline.showStats();
        break;

      case 'lineage': {
        const elementId = args[1];
        if (!elementId) {
          console.error('Usage: node context-enrichment.cjs lineage <element_id>');
          console.error('Element IDs: f_xxx (facts), t_xxx (themes), i_xxx (insights)');
          process.exit(1);
        }
        pipeline.traceLineage(elementId);
        break;
      }

      case 'migrate':
        pipeline.migrate();
        break;

      case 'reset': {
        const confirm = args.includes('--confirm');
        if (!confirm) {
          console.error('This will reset the database. Use --confirm to proceed.');
          console.error('A backup will be created before deletion.');
          process.exit(1);
        }
        pipeline.resetDatabase();
        console.log('Database reset complete. Run "run" to start fresh.');
        break;
      }

      // ========== LEGACY ALIASES ==========

      case 'run-v2':
        // Alias for run (v2 is now the default)
        console.log('Note: run-v2 is now just "run" - v2 is the default pipeline\n');
        await pipeline.runFullPipeline({ forceReprocess, dryRun, since, limit });
        break;

      case 'stats-v2':
        // Alias for stats
        console.log('Note: stats-v2 is now just "stats"\n');
        pipeline.showStats();
        break;

      // ========== HELP ==========

      case 'help':
      default:
        console.log(`
Context Enrichment CLI (v3 - Unified Pipeline)

Extracts facts from transcripts and chats, synthesizes themes and insights,
and generates narrative dossiers (about-me.md, about-company.md).

=== PRIMARY COMMANDS ===

  run [options]           Full 4-layer pipeline (facts -> themes -> insights -> dossiers)
  chats [options]         Process only chat sessions (from chats.db)
  transcripts [options]   Process only meeting transcripts
  all [options]           Same as 'run' (alias for backward compatibility)

Options:
  --force, -f             Reprocess all sources (ignore processed_sources cache)
  --dry-run, -n           Show what would be processed without processing
  --facts-only            Extract facts only (skip layers 2-4)
  --since YYYY-MM-DD      Only process sources dated after this date
  --limit N               Limit to N sources (for testing)

=== SYNTHESIS COMMANDS ===

  layer <N>               Run up to layer N: 1=facts, 2=themes, 3=insights, 4=dossier
  regenerate              Re-run layers 2-4 on existing facts (no re-extraction)
  curate                  Incrementally update about-me.md from existing facts/insights

=== UTILITY COMMANDS ===

  stats                   Show database statistics (facts, themes, insights, etc.)
  lineage <id>            Trace element back to original sources
  migrate                 Migrate V1 database to V3 format
  reset --confirm         Reset database (creates backup first)

=== EXAMPLES ===

  # Full pipeline (recommended for daily use)
  node scripts/context-enrichment.cjs run

  # Force reprocess recent sources
  node scripts/context-enrichment.cjs run --force --since 2026-01-01

  # Extract facts only (skip synthesis for faster debugging)
  node scripts/context-enrichment.cjs run --facts-only

  # Re-synthesize from existing facts (after fixing prompts)
  node scripts/context-enrichment.cjs regenerate

  # Incrementally curate about-me.md (standalone, no re-extraction)
  node scripts/context-enrichment.cjs curate --dry-run

  # Trace an insight back to source quotes
  node scripts/context-enrichment.cjs lineage i_abc123

  # Check database state
  node scripts/context-enrichment.cjs stats

=== OUTPUT FILES ===

  knowledge/about-me.md             Personal professional profile
  knowledge/about-company.md        Company intelligence document
  local/context-enrichment.db.json  V3 database (facts, themes, insights)

=== ENVIRONMENT ===

  GEMINI_API_KEY          Required for fact extraction (or GOOGLE_API_KEY)
  DEBUG=1                 Show detailed error stacks
`);
        break;
    }

    trackComplete('context-enrichment', startTime, { command });
    await flush();
  } catch (error) {
    trackError('context-enrichment', error, { command });
    await flush();

    console.error('Error:', error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
