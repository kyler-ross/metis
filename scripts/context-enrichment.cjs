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

const { run } = require('./lib/script-runner.cjs');

run({
  name: 'context-enrichment',
  mode: 'operational',
  services: ['google'],
}, async (ctx) => {
  const command = ctx.args.positional[0] || 'help';

  // Parse common options
  const rawArgs = process.argv.slice(2);
  const forceReprocess = rawArgs.includes('--force') || rawArgs.includes('-f');
  const dryRun = rawArgs.includes('--dry-run') || rawArgs.includes('-n');
  const factsOnly = rawArgs.includes('--facts-only');
  const sinceIdx = rawArgs.findIndex(a => a === '--since');
  const since = sinceIdx !== -1 && rawArgs[sinceIdx + 1] ? rawArgs[sinceIdx + 1] : null;
  const limitIdx = rawArgs.findIndex(a => a === '--limit');
  const limit = limitIdx !== -1 && rawArgs[limitIdx + 1] ? parseInt(rawArgs[limitIdx + 1], 10) : 0;

  // Check for required env var
  if (['run', 'chats', 'all', 'regenerate', 'layer', 'curate'].includes(command)) {
    if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
      throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY required. Set in .ai/scripts/.env or environment');
    }
  }

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
      const layer = ctx.args.positional[1];
      if (!layer || !['1', '2', '3', '4', 'facts', 'themes', 'insights', 'dossier'].includes(layer)) {
        throw new Error('Usage: node context-enrichment.cjs layer <1|2|3|4|facts|themes|insights|dossier>');
      }
      await pipeline.runLayer(layer, { forceReprocess, since, limit });
      break;
    }

    case 'regenerate': {
      // Re-run L2-L4 on existing facts (no re-extraction)
      await pipeline.regenerate({ dryRun });
      break;
    }

    // ========== UTILITY COMMANDS ==========

    case 'stats':
      pipeline.showStats();
      break;

    case 'lineage': {
      const elementId = ctx.args.positional[1];
      if (!elementId) {
        throw new Error('Usage: node context-enrichment.cjs lineage <element_id>\nElement IDs: f_xxx (facts), t_xxx (themes), i_xxx (insights)');
      }
      pipeline.traceLineage(elementId);
      break;
    }

    case 'migrate':
      pipeline.migrate();
      break;

    case 'reset': {
      const confirm = rawArgs.includes('--confirm');
      if (!confirm) {
        throw new Error('This will reset the database. Use --confirm to proceed.\nA backup will be created before deletion.');
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

    case 'curate': {
      // Run curator standalone against existing facts/insights
      await pipeline.runCurator({ dryRun });
      break;
    }

    // ========== HELP ==========

    case 'help':
    default:
      console.log(`
Context Enrichment CLI (v3 - Unified Pipeline)

Extracts facts from transcripts and chats, synthesizes themes and insights,
and generates narrative dossiers (about-me.md, about-cloaked.md).

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
  node .ai/scripts/context-enrichment.cjs run

  # Force reprocess recent sources
  node .ai/scripts/context-enrichment.cjs run --force --since 2026-01-01

  # Extract facts only (skip synthesis for faster debugging)
  node .ai/scripts/context-enrichment.cjs run --facts-only

  # Re-synthesize from existing facts (after fixing prompts)
  node .ai/scripts/context-enrichment.cjs regenerate

  # Incrementally curate about-me.md (standalone, no re-extraction)
  node .ai/scripts/context-enrichment.cjs curate --dry-run

  # Trace an insight back to source quotes
  node .ai/scripts/context-enrichment.cjs lineage i_abc123

  # Check database state
  node .ai/scripts/context-enrichment.cjs stats

=== OUTPUT FILES ===

  .ai/knowledge/about-me.md       Personal professional profile
  .ai/knowledge/about-cloaked.md  Company intelligence document
  .ai/local/context-enrichment.db.json  V3 database (facts, themes, insights)

=== ENVIRONMENT ===

  GEMINI_API_KEY          Required for fact extraction (or GOOGLE_API_KEY)
  DEBUG=1                 Show detailed error stacks
`);
      break;
  }
});
