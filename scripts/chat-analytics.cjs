// PM AI Starter Kit - chat-analytics.cjs
#!/usr/bin/env node

/**
 * PM AI Chat Analytics CLI
 *
 * Index, search, and analyze Claude Code and Cursor conversations.
 *
 * NOTE: This script requires library modules in lib/chat-analytics/ that are
 * not included in the starter kit. It is provided as a reference architecture.
 * To use it, implement the following modules:
 *   - lib/chat-analytics/indexer.cjs (session indexing and querying)
 *   - lib/chat-analytics/quality-scorer.cjs (session quality scoring)
 *   - lib/chat-analytics/leverage-calculator.cjs (leverage scoring)
 *   - lib/chat-analytics/success-pattern-analyzer.cjs (success pattern analysis)
 *   - lib/chat-analytics/gemini-enricher.cjs (Gemini-based metadata enrichment)
 *   - lib/chat-analytics/claude-parser.cjs (Claude session file parser)
 *
 * Required environment variables:
 *   GEMINI_API_KEY - For enrich and nl-search commands
 *
 * Commands:
 *   index [--force]        Build/update the unified index
 *   search <query>         Search indexed sessions
 *   top [technique]        Get top quality sessions
 *   stats                  Show usage statistics
 *   export-demos [dir]     Export top sessions as demo files
 *   session <id>           Show details for a specific session
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { track, trackComplete, trackError, flush } = require('./lib/telemetry.cjs');

// Library path for chat analytics modules
const libPath = path.join(__dirname, 'lib', 'chat-analytics');

// Lazy-load library modules (they may not exist in starter kit)
function loadLib(name) {
  try {
    return require(path.join(libPath, name));
  } catch (e) {
    console.error(`Library module not found: lib/chat-analytics/${name}`);
    console.error('This module is not included in the starter kit.');
    console.error('See the chat-analytics.cjs header comments for implementation details.');
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const command = args[0];

// Help text
const HELP = `
PM AI Chat Analytics CLI

Commands:
  index [--force]        Build/update the unified index
  enrich [--limit n]     Add Gemini-generated metadata (requires GEMINI_API_KEY)
  search <query>         Search indexed sessions
  nl-search <query>      Natural language search using Gemini
  top [technique]        Get top quality sessions
  stats                  Show usage statistics
  manifest               Build/rebuild the search manifest
  export-demos [dir]     Export top sessions as demo files
  session <id>           Show details for a specific session
  preview <id>           Preview conversation from a session

Success Pattern Analysis:
  success-report         Generate comprehensive success pattern report
  find-10x [--limit n]   Find 10x sessions (dramatically high leverage)
  prompt-patterns        Extract successful prompt patterns
  classify-stats         Show session classification breakdown

Options:
  --force               Force full rebuild (for index) or re-enrich (for enrich)
  --session <id>        Enrich a specific session by ID (for enrich)
  --source <src>        Filter by source (claude-code, cursor)
  --min-quality <n>     Minimum quality score (0-100)
  --limit <n>           Limit results (default: 20)
  --json                Output as JSON
  --pm-work-only        Filter to only actual PM work (excludes system-building sessions)

Examples:
  node chat-analytics.cjs index
  node chat-analytics.cjs enrich --limit 50
  node chat-analytics.cjs search "jira ticket"
  node chat-analytics.cjs nl-search "find my best debugging sessions"
  node chat-analytics.cjs top planning-mode
  node chat-analytics.cjs stats --json
  node chat-analytics.cjs success-report
  node chat-analytics.cjs find-10x --limit 20
`;

// Parse options
function parseOptions(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--force') {
      options.force = true;
    } else if (args[i] === '--json') {
      options.json = true;
    } else if (args[i] === '--include-cursor') {
      options.includeCursor = true;
    } else if (args[i] === '--cursor-only') {
      options.cursorOnly = true;
    } else if (args[i] === '--pm-work-only') {
      options.pmWorkOnly = true;
    } else if (args[i] === '--source' && args[i + 1]) {
      options.source = args[++i];
    } else if (args[i] === '--min-quality' && args[i + 1]) {
      options.minQualityScore = parseInt(args[++i], 10);
    } else if (args[i] === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[++i], 10);
    } else if (args[i] === '--technique' && args[i + 1]) {
      options.technique = args[++i];
    } else if (args[i] === '--session' && args[i + 1]) {
      options.sessionId = args[++i];
    } else if (args[i] === '--all') {
      options.all = true;
    }
  }
  return options;
}

// Format date
function formatDate(isoString) {
  if (!isoString) return 'Unknown';
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Format number with commas
function formatNumber(n) {
  return n.toLocaleString();
}

// Format session for display (handles both full and manifest formats)
function formatSession(session, verbose = false) {
  const qualityScorer = loadLib('quality-scorer.cjs');

  // Handle both manifest format (quality is number) and full format (quality is object)
  const qualityScore = typeof session.quality === 'number' ? session.quality : session.quality?.overall || 0;
  const tier = qualityScorer.getQualityTier(qualityScore);
  const tierLabel = {
    excellent: '[*]',
    good: '[+]',
    average: '[=]',
    poor: '[-]'
  }[tier];

  // Handle both manifest (title) and full (summary) formats
  const title = session.title || session.summary || 'Untitled';
  const turnCount = session.turns || session.turnCount || 0;
  const dateStr = session.date || session.lastActiveAt;

  let output = `${tierLabel} [${qualityScore}] ${title}`;
  output += `\n   ${session.source || 'claude-code'} | ${formatDate(dateStr)} | ${turnCount} turns`;

  // Handle both manifest (array of strings) and full (array of objects) technique formats
  const techniques = session.techniques || [];
  if (techniques.length > 0) {
    const techNames = techniques.map(t => typeof t === 'string' ? t : t.name);
    output += `\n   Techniques: ${techNames.join(', ')}`;
  }

  if (verbose) {
    output += `\n   ID: ${session.id}`;
    if (session.projectKey) {
      output += `\n   Project: ${session.projectKey}`;
    }
    if (session.tokens) {
      output += `\n   Tokens: ${formatNumber(session.tokens.totalInput + session.tokens.totalOutput)}`;
    }
    if (session.agentsUsed && session.agentsUsed.length > 0) {
      output += `\n   Agents: ${session.agentsUsed.join(', ')}`;
    }
    if (session.category) {
      output += `\n   Category: ${session.category}`;
    }
    if (session.oneSentence) {
      output += `\n   Summary: ${session.oneSentence}`;
    }
  }

  return output;
}

// Command handlers
const commands = {
  async index(args) {
    const indexer = loadLib('indexer.cjs');
    const options = parseOptions(args);
    console.log('Building chat index...');
    console.log('');

    try {
      const result = await indexer.buildIndex({
        force: options.force,
        includeCursor: options.includeCursor,
        cursorOnly: options.cursorOnly
      });

      console.log('Index build complete:');
      console.log(`  Added:   ${result.added}`);
      console.log(`  Updated: ${result.updated}`);
      console.log(`  Skipped: ${result.skipped}`);
      console.log(`  Failed:  ${result.failed}`);

      const stats = indexer.getStats();
      console.log('');
      console.log(`Total sessions indexed: ${stats.totalSessions}`);
      console.log(`  Claude Code: ${stats.bySource['claude-code']}`);
      console.log(`  Cursor: ${stats.bySource['cursor']}`);
    } catch (e) {
      console.error('Error building index:', e.message);
      process.exit(1);
    }
  },

  search(args) {
    const indexer = loadLib('indexer.cjs');
    const query = args.filter(a => !a.startsWith('--')).join(' ');
    const options = parseOptions(args);

    if (!query) {
      console.error('Usage: chat-analytics search <query>');
      process.exit(1);
    }

    const result = indexer.querySessions({
      query,
      source: options.source,
      minQualityScore: options.minQualityScore,
      limit: options.limit || 10
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(`Found ${result.total} sessions matching "${query}"`);
    console.log('');

    if (result.sessions.length === 0) {
      console.log('No results. Try a different query or run `index` first.');
      return;
    }

    for (const session of result.sessions) {
      console.log(formatSession(session));
      console.log('');
    }
  },

  top(args) {
    const indexer = loadLib('indexer.cjs');
    const technique = args.filter(a => !a.startsWith('--'))[0];
    const options = parseOptions(args);

    const sessions = indexer.getTopSessions({
      technique: technique ? technique.toLowerCase() : null,
      minQuality: options.minQualityScore || 70,
      count: options.limit || 10
    });

    if (options.json) {
      console.log(JSON.stringify(sessions, null, 2));
      return;
    }

    const title = technique
      ? `Top sessions demonstrating "${technique}"`
      : 'Top quality sessions';

    console.log(title);
    console.log('='.repeat(title.length));
    console.log('');

    if (sessions.length === 0) {
      console.log('No high-quality sessions found. Try lowering --min-quality.');
      return;
    }

    for (const session of sessions) {
      console.log(formatSession(session, true));
      console.log('');
    }
  },

  stats(args) {
    const indexer = loadLib('indexer.cjs');
    const options = parseOptions(args);
    const stats = indexer.getStats();

    if (options.json) {
      console.log(JSON.stringify(stats, null, 2));
      return;
    }

    console.log('PM AI Usage Statistics');
    console.log('======================');
    console.log('');
    console.log(`Total Sessions: ${formatNumber(stats.totalSessions)}`);
    console.log(`  Claude Code:  ${formatNumber(stats.bySource['claude-code'])}`);
    console.log(`  Cursor:       ${formatNumber(stats.bySource['cursor'])}`);
    console.log('');
    console.log(`Avg Quality Score: ${stats.avgQualityScore}/100`);
    console.log(`Avg Turns/Session: ${stats.avgTurnsPerSession}`);
    console.log(`Total Tokens Used: ${formatNumber(stats.totalTokens)}`);
    console.log('');

    if (stats.topTechniques.length > 0) {
      console.log('Top Techniques:');
      for (const tech of stats.topTechniques.slice(0, 5)) {
        console.log(`  ${tech.name}: ${tech.count} sessions`);
      }
      console.log('');
    }

    if (Object.keys(stats.agentUsage).length > 0) {
      console.log('Agent Usage:');
      const sortedAgents = Object.entries(stats.agentUsage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      for (const [agent, count] of sortedAgents) {
        console.log(`  ${agent}: ${count} sessions`);
      }
      console.log('');
    }

    // Recent activity
    const dates = Object.keys(stats.sessionsPerDay).sort().slice(-7);
    if (dates.length > 0) {
      console.log('Recent Activity (last 7 days):');
      for (const date of dates) {
        const count = stats.sessionsPerDay[date];
        const bar = '#'.repeat(Math.min(count, 20));
        console.log(`  ${date}: ${bar} ${count}`);
      }
    }
  },

  session(args) {
    const indexer = loadLib('indexer.cjs');
    const qualityScorer = loadLib('quality-scorer.cjs');
    const sessionId = args.filter(a => !a.startsWith('--'))[0];
    const options = parseOptions(args);

    if (!sessionId) {
      console.error('Usage: chat-analytics session <id>');
      process.exit(1);
    }

    const index = indexer.loadIndex();
    const session = index.sessions[sessionId];

    if (!session) {
      console.error(`Session not found: ${sessionId}`);
      console.error('Use `search` to find sessions by content.');
      process.exit(1);
    }

    if (options.json) {
      console.log(JSON.stringify(session, null, 2));
      return;
    }

    console.log('Session Details');
    console.log('===============');
    console.log('');
    console.log(`ID: ${session.id}`);
    console.log(`Source: ${session.source}`);
    console.log(`Project: ${session.projectKey}`);
    console.log(`Created: ${formatDate(session.createdAt)}`);
    console.log(`Last Active: ${formatDate(session.lastActiveAt)}`);
    console.log(`Duration: ${Math.round(session.duration / 60)} minutes`);
    console.log('');
    console.log(`Summary: ${session.summary}`);
    if (session.slug) {
      console.log(`Slug: ${session.slug}`);
    }
    if (session.gitBranch) {
      console.log(`Git Branch: ${session.gitBranch}`);
    }
    console.log('');
    console.log('Metrics:');
    console.log(`  Turns: ${session.turnCount}`);
    console.log(`  User Messages: ${session.userMessageCount}`);
    console.log(`  Assistant Messages: ${session.assistantMessageCount}`);
    console.log(`  Tool Uses: ${session.toolUseCount}`);
    if (session.tokens) {
      console.log(`  Input Tokens: ${formatNumber(session.tokens.totalInput)}`);
      console.log(`  Output Tokens: ${formatNumber(session.tokens.totalOutput)}`);
      console.log(`  Cache Hit Rate: ${Math.round(session.tokens.cacheHitRate * 100)}%`);
    }
    console.log('');
    console.log('Quality Scores:');
    console.log(`  Overall: ${session.quality.overall}/100 (${qualityScorer.getQualityTier(session.quality.overall)})`);
    console.log(`  Token Efficiency: ${session.quality.tokenEfficiency}/100`);
    console.log(`  Task Completion: ${session.quality.taskCompletion}/100`);
    console.log(`  Technique Showcase: ${session.quality.techniqueShowcase}/100`);
    console.log(`  Conversation Flow: ${session.quality.conversationFlow}/100`);
    console.log(`  Tool Mastery: ${session.quality.toolMastery}/100`);

    if (session.techniques.length > 0) {
      console.log('');
      console.log('Techniques Detected:');
      for (const tech of session.techniques) {
        console.log(`  ${tech.name} (${Math.round(tech.confidence * 100)}% confidence)`);
        if (tech.evidence.length > 0) {
          console.log(`    Evidence: ${tech.evidence[0]}`);
        }
      }
    }

    if (session.agentsUsed.length > 0) {
      console.log('');
      console.log(`Agents Used: ${session.agentsUsed.join(', ')}`);
    }
  },

  help() {
    console.log(HELP);
  },
};

// Main
async function main() {
  const startTime = Date.now();

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    commands.help();
    process.exit(0);
  }

  if (!commands[command]) {
    console.error(`Unknown command: ${command}`);
    console.error('Run `chat-analytics help` for usage.');
    process.exit(1);
  }

  // Track command execution
  track(`chat_analytics_${command.replace(/-/g, '_')}`, { command });

  try {
    await commands[command](args.slice(1));
    trackComplete('chat-analytics', startTime, { command, success: true });
    await flush();
  } catch (e) {
    trackError('chat_analytics_error', { command, error_type: e.code || 'unknown' });
    trackComplete('chat-analytics', startTime, { command, success: false });
    await flush();
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}

main();
