#!/usr/bin/env node

/**
 * PM AI Chat Analytics CLI
 *
 * Index, search, and analyze Claude Code and Cursor conversations.
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

// Add tools/lib to path for local requires
const libPath = path.join(__dirname, '..', 'tools', 'lib', 'chat-analytics');
const indexer = require(path.join(libPath, 'indexer.cjs'));
const qualityScorer = require(path.join(libPath, 'quality-scorer.cjs'));
const leverageCalculator = require(path.join(libPath, 'leverage-calculator.cjs'));
const successAnalyzer = require(path.join(libPath, 'success-pattern-analyzer.cjs'));

const { run } = require('./lib/script-runner.cjs');

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
  classify-stats         Show session classification breakdown (pm-work vs system-building)

Options:
  --force               Force full rebuild (for index) or re-enrich (for enrich)
  --session <id>        Enrich a specific session by ID (for enrich)
  --source <src>        Filter by source (claude-code, cursor)
  --min-quality <n>     Minimum quality score (0-100)
  --limit <n>           Limit results (default: 20)
  --json                Output as JSON
  --pm-work-only        Filter to only actual PM work (excludes system-building sessions)

Examples:
  node chat-analytics.js index
  node chat-analytics.js enrich --limit 50
  node chat-analytics.js enrich --session "claude:...:abc123"
  node chat-analytics.js search "jira ticket"
  node chat-analytics.js nl-search "find my best debugging sessions"
  node chat-analytics.js top planning-mode
  node chat-analytics.js stats --json
  node chat-analytics.js success-report
  node chat-analytics.js find-10x --limit 20
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
  // Handle both manifest format (quality is number) and full format (quality is object)
  const qualityScore = typeof session.quality === 'number' ? session.quality : session.quality?.overall || 0;
  const tier = qualityScorer.getQualityTier(qualityScore);
  const tierEmoji = {
    excellent: '🌟',
    good: '✅',
    average: '📊',
    poor: '⚠️'
  }[tier];

  // Handle both manifest (title) and full (summary) formats
  const title = session.title || session.summary || 'Untitled';
  const turnCount = session.turns || session.turnCount || 0;
  const dateStr = session.date || session.lastActiveAt;

  let output = `${tierEmoji} [${qualityScore}] ${title}`;
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
      throw new Error(`Error building index: ${e.message}`, { cause: e });
    }
  },

  search(args) {
    const query = args.filter(a => !a.startsWith('--')).join(' ');
    const options = parseOptions(args);

    if (!query) {
      throw new Error('Usage: chat-analytics search <query>');
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
        const bar = '█'.repeat(Math.min(count, 20));
        console.log(`  ${date}: ${bar} ${count}`);
      }
    }
  },

  session(args) {
    const sessionId = args.filter(a => !a.startsWith('--'))[0];
    const options = parseOptions(args);

    if (!sessionId) {
      throw new Error('Usage: chat-analytics session <id>');
    }

    const index = indexer.loadIndex();
    const session = index.sessions[sessionId];

    if (!session) {
      throw new Error(`Session not found: ${sessionId}. Use 'search' to find sessions by content.`);
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

  async enrich(args) {
    const options = parseOptions(args);
    const limit = options.limit || 50;

    // Check for Gemini API key
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable required. Set it with: export GEMINI_API_KEY=your-key');
    }

    const geminiEnricher = require(path.join(libPath, 'gemini-enricher.cjs'));
    const claudeParser = require(path.join(libPath, 'claude-parser.cjs'));

    const index = indexer.loadIndex();

    // Single session enrichment mode
    if (options.sessionId) {
      const session = index.sessions[options.sessionId];
      if (!session) {
        throw new Error(`Session not found: ${options.sessionId}`);
      }

      console.log(`Re-analyzing session: ${options.sessionId}`);
      console.log('');

      try {
        if (!session.filePath) {
          throw new Error('Session has no file path');
        }

        const parsed = claudeParser.parseSession(session.filePath);
        const metadata = await geminiEnricher.enrichSession(session, parsed.messages);

        if (metadata) {
          session.summary = metadata.title || session.summary;
          session.enrichedMetadata = metadata;
          indexer.saveIndex(index);
          console.log(`✓ ${metadata.title}`);
          console.log('');
          console.log('Session re-analyzed successfully!');
          console.log('Run `npm run copy-index` to update web app');
        } else {
          throw new Error('Failed to enrich session');
        }
      } catch (e) {
        throw new Error(`Re-analysis failed: ${e.message}`, { cause: e });
      }
      return;
    }

    const sessions = Object.values(index.sessions);

    // Find sessions that need enrichment
    const needsEnrichment = sessions
      .filter(s => {
        const summary = s.summary || '';
        // Skip sessions with fewer than 2 turns (not enough content for AI analysis)
        if (s.turnCount < 2) {
          // Auto-label short sessions with default metadata
          if (!s.enrichedMetadata) {
            s.enrichedMetadata = {
              title: summary || 'Short session',
              category: 'other',
              complexity: 'trivial',
              outcome: 'unclear',
              oneSentence: 'Session too short for detailed analysis'
            };
          }
          return false;
        }

        // Skip genuinely empty sessions (no content to analyze)
        if (s.turnCount === 0 && s.assistantMessageCount === 0) return false;

        // Skip agent-only sessions (no user interaction)
        if (s.turnCount === 0 && s.assistantMessageCount <= 1) {
          // Auto-label these as agent initialization
          if (summary.startsWith('Re:') || summary.includes("I'm Claude") || summary.includes("I'm ready")) {
            s.summary = 'Agent initialization';
          }
          return false;
        }

        // Helper to check for bad title patterns
        const hasBadTitle = (text) => {
          if (!text || text.length < 10) return true;
          const badPatterns = [
            /^Re:/i,
            /^I['']?ll /i,
            /^Let me /i,
            /^I will /i,
            /^Here['']?s /i,
            /^This /i,
            /^Analyzing /i,
            /I'm Claude Code/i,
            /I'm ready to help/i,
            /operating in/i,
            /# PM AI System/i,
            /^Empty session$/i,
            /^\$ARGU/i,
            /^[.\s]+$/
          ];
          return badPatterns.some(p => p.test(text));
        };

        // Check both summary and enrichedMetadata.title for bad patterns
        const hasFullMetadata = s.enrichedMetadata?.category &&
                                s.enrichedMetadata?.oneSentence &&
                                s.enrichedMetadata?.title;
        const currentTitleBad = hasBadTitle(s.enrichedMetadata?.title || summary);

        // With --all, re-enrich ALL sessions regardless of current state
        if (options.all) {
          return s.turnCount >= 2;
        }

        // With --force, re-enrich sessions with bad titles or missing metadata
        if (options.force) {
          return s.turnCount >= 2 && (!hasFullMetadata || currentTitleBad);
        }

        // Otherwise only enrich sessions with poor summaries or missing metadata
        return s.turnCount >= 2 && (!s.enrichedMetadata || hasBadTitle(summary) || currentTitleBad);
      })
      .slice(0, limit);

    if (needsEnrichment.length === 0) {
      console.log('No sessions need enrichment');
      return;
    }

    console.log(`Enriching ${needsEnrichment.length} sessions with Gemini...`);
    console.log('');

    let enriched = 0;
    let failed = 0;

    const failedSessions = [];

    for (const session of needsEnrichment) {
      try {
        // Load raw messages from file
        if (!session.filePath) {
          failed++;
          continue;
        }

        const parsed = claudeParser.parseSession(session.filePath);
        const metadata = await geminiEnricher.enrichSession(session, parsed.messages);

        if (metadata) {
          // Update session with enriched metadata
          session.summary = metadata.title || session.summary;
          session.enrichedMetadata = metadata;
          enriched++;
          console.log(`✓ ${metadata.title}`);
        } else {
          failedSessions.push({ session, parsed });
        }

        // Rate limiting
        await new Promise(r => setTimeout(r, 200));

      } catch (e) {
        failedSessions.push({ session, error: e.message });
      }
    }

    // Retry failed sessions once
    if (failedSessions.length > 0) {
      console.log(`\nRetrying ${failedSessions.length} failed sessions...`);
      await new Promise(r => setTimeout(r, 1000)); // Wait before retry

      for (const { session, parsed, error } of failedSessions) {
        try {
          if (!session.filePath) {
            failed++;
            continue;
          }

          const sessionParsed = parsed || claudeParser.parseSession(session.filePath);
          const metadata = await geminiEnricher.enrichSession(session, sessionParsed.messages);

          if (metadata) {
            session.summary = metadata.title || session.summary;
            session.enrichedMetadata = metadata;
            enriched++;
            console.log(`✓ (retry) ${metadata.title}`);
          } else {
            failed++;
          }

          await new Promise(r => setTimeout(r, 300)); // Slower on retry
        } catch (e) {
          failed++;
          console.error(`✗ ${session.id.substring(0, 40)}...`);
        }
      }
    }

    // Save updated index
    indexer.saveIndex(index);

    console.log('');
    console.log(`Enrichment complete: ${enriched} enriched, ${failed} failed`);
    console.log('Run `npm run copy-index` to update web app');
  },

  async preview(args) {
    const sessionId = args.filter(a => !a.startsWith('--'))[0];

    if (!sessionId) {
      throw new Error('Usage: chat-analytics preview <id>');
    }

    const index = indexer.loadIndex();
    const session = index.sessions[sessionId];

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (!session.filePath) {
      throw new Error('Session has no file path');
    }

    const claudeParser = require(path.join(libPath, 'claude-parser.cjs'));
    const parsed = claudeParser.parseSession(session.filePath);

    console.log(`Preview: ${session.summary}`);
    console.log('='.repeat(50));
    console.log('');

    for (const msg of parsed.messages) {
      if (msg.type === 'user' && msg.message?.content) {
        const content = typeof msg.message.content === 'string'
          ? msg.message.content
          : msg.message.content.filter(b => b.type === 'text').map(b => b.text).join(' ');
        if (content && content.length > 1) {
          console.log(`USER: ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}`);
          console.log('');
        }
      }

      if (msg.type === 'assistant' && msg.message?.content) {
        const content = Array.isArray(msg.message.content)
          ? msg.message.content.filter(b => b.type === 'text').map(b => b.text).join(' ')
          : '';
        if (content && content.length > 10) {
          console.log(`ASSISTANT: ${content.substring(0, 300)}${content.length > 300 ? '...' : ''}`);
          console.log('');
        }
      }
    }
  },

  'export-demos': async function(args) {
    const outputDir = args.filter(a => !a.startsWith('--'))[0] || '.ai/work/demo-library';
    const options = parseOptions(args);

    const sessions = indexer.getTopSessions({
      minQuality: options.minQualityScore || 80,
      count: options.limit || 20
    });

    const fs = require('fs');
    const outputPath = path.resolve(process.cwd(), outputDir);

    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    const demos = sessions.map(s => ({
      id: s.id,
      title: s.summary,
      source: s.source,
      quality: s.quality.overall,
      techniques: s.techniques.map(t => t.name),
      agentsUsed: s.agentsUsed,
      date: s.lastActiveAt.split('T')[0],
      turnCount: s.turnCount,
      tokenCount: s.tokens ? s.tokens.totalInput + s.tokens.totalOutput : 0
    }));

    const library = {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      demoCount: demos.length,
      demos
    };

    fs.writeFileSync(
      path.join(outputPath, 'demos.json'),
      JSON.stringify(library, null, 2)
    );

    console.log(`Exported ${demos.length} demos to ${outputPath}/demos.json`);
  },

  async manifest(args) {
    const options = parseOptions(args);
    const manifestBuilder = require(path.join(libPath, 'manifest-builder.cjs'));

    console.log('Building session manifest...');

    const manifest = manifestBuilder.buildManifest();

    if (options.json) {
      console.log(JSON.stringify(manifest, null, 2));
      return;
    }

    console.log('');
    console.log(manifestBuilder.getManifestSummary());
    console.log('');
    console.log(`Manifest saved to: ${manifestBuilder.MANIFEST_PATH}`);
  },

  async 'nl-search'(args) {
    const query = args.filter(a => !a.startsWith('--')).join(' ');
    const options = parseOptions(args);

    if (!query) {
      throw new Error('Usage: chat-analytics nl-search <query>. Example: chat-analytics nl-search "find my best debugging sessions"');
    }

    // Check for Gemini API key
    if (!process.env.GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY environment variable required for NL search');
      console.error('Set it with: export GEMINI_API_KEY=your-key');
      console.error('');
      console.error('Falling back to keyword search...');
      return commands.search(args);
    }

    const nlSearch = require(path.join(libPath, 'nl-search.cjs'));

    console.log(`Searching for: "${query}"`);
    console.log('');

    const result = await nlSearch.naturalLanguageSearch(query);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (result.message) {
      console.log(`AI: ${result.message}`);
      console.log('');
    }

    if (result.sessions.length === 0) {
      console.log('No matching sessions found.');
      return;
    }

    console.log(`Found ${result.sessions.length} sessions:`);
    console.log('');

    for (const session of result.sessions) {
      console.log(formatSession(session, true));
      console.log('');
    }

    if (result.suggestedFollowup) {
      console.log('---');
      console.log(`Suggestion: ${result.suggestedFollowup}`);
    }
  },

  help() {
    console.log(HELP);
  },

  // ==========================================
  // Success Pattern Analysis Commands
  // ==========================================

  'classify-stats'(args) {
    const options = parseOptions(args);

    console.log('Analyzing session classifications...');
    console.log('');

    const index = indexer.loadIndex();
    const sessions = Object.values(index.sessions);

    if (sessions.length === 0) {
      throw new Error('No sessions indexed. Run `index` first.');
    }

    const stats = successAnalyzer.getClassificationStats(sessions);

    if (options.json) {
      console.log(JSON.stringify(stats, null, 2));
      return;
    }

    console.log('Session Classification Breakdown');
    console.log('================================');
    console.log('');
    console.log(`Total Sessions: ${sessions.length}`);
    console.log('');
    console.log(`PM Work:         ${stats['pm-work']} (${Math.round(stats['pm-work'] / sessions.length * 100)}%)`);
    console.log(`System Building: ${stats['system-building']} (${Math.round(stats['system-building'] / sessions.length * 100)}%)`);
    console.log(`Unknown:         ${stats['unknown']} (${Math.round(stats['unknown'] / sessions.length * 100)}%)`);
    console.log('');
    console.log('Use --pm-work-only with find-10x, prompt-patterns, or success-report to filter.');
  },

  async 'find-10x'(args) {
    const options = parseOptions(args);
    const limit = options.limit || 20;

    console.log('Finding 10x sessions...');
    console.log('');

    const index = indexer.loadIndex();
    let sessions = Object.values(index.sessions);

    if (sessions.length === 0) {
      throw new Error('No sessions indexed. Run `index` first.');
    }

    // Apply PM work filter if requested
    if (options.pmWorkOnly) {
      const classStats = successAnalyzer.getClassificationStats(sessions);
      sessions = successAnalyzer.filterToPmWorkOnly(sessions);
      console.log(`Filtering to PM work only: ${sessions.length} sessions (excluded ${classStats['system-building']} system-building, ${classStats['unknown']} unknown)`);
      console.log('');
    }

    // Detect 10x sessions
    const tenXSessions = successAnalyzer.detect10xSessions(sessions);

    if (options.json) {
      console.log(JSON.stringify(tenXSessions.slice(0, limit), null, 2));
      return;
    }

    console.log(`Found ${tenXSessions.length} 10x sessions out of ${sessions.length} total`);
    console.log('');
    console.log('Top 10x Sessions (by leverage multiplier):');
    console.log('='.repeat(50));

    for (const result of tenXSessions.slice(0, limit)) {
      const session = result.session;
      const leverageTier = session.leverage?.tier || 'unknown';
      const leverageEmoji = {
        exceptional: '🚀',
        high: '⚡',
        medium: '📊',
        low: '📉'
      }[leverageTier] || '📊';

      console.log('');
      console.log(`${leverageEmoji} ${result.multiplier}x leverage | ${session.summary || 'Untitled'}`);
      console.log(`   Quality: ${session.quality?.overall || 0}/100 | Leverage: ${session.leverage?.score || 0}/100`);
      console.log(`   Turns: ${session.turnCount} | Tools: ${session.toolUseCount}`);
      if (session.techniques?.length > 0) {
        const techNames = session.techniques.map(t => t.name).slice(0, 3);
        console.log(`   Techniques: ${techNames.join(', ')}`);
      }
      console.log(`   Resume: claude --resume ${session.id.split(':').pop()}`);
    }
  },

  async 'prompt-patterns'(args) {
    const options = parseOptions(args);
    const minQuality = options.minQualityScore || 70;

    console.log('Extracting successful prompt patterns...');
    console.log('');

    const index = indexer.loadIndex();
    let sessions = Object.values(index.sessions);

    // Apply PM work filter if requested
    if (options.pmWorkOnly) {
      const classStats = successAnalyzer.getClassificationStats(sessions);
      sessions = successAnalyzer.filterToPmWorkOnly(sessions);
      console.log(`Filtering to PM work only: ${sessions.length} sessions (excluded ${classStats['system-building']} system-building, ${classStats['unknown']} unknown)`);
      console.log('');
    }

    // Get high-quality sessions
    const highQualitySessions = sessions
      .filter(s => (s.quality?.overall || 0) >= minQuality)
      .sort((a, b) => (b.leverage?.score || 0) - (a.leverage?.score || 0))
      .slice(0, 50);

    if (highQualitySessions.length < 10) {
      throw new Error(`Only ${highQualitySessions.length} sessions meet quality threshold ${minQuality}. Try lowering --min-quality or running more sessions.`);
    }

    console.log(`Analyzing prompts from ${highQualitySessions.length} high-quality sessions...`);
    console.log('');

    const patterns = await successAnalyzer.extractPromptPatterns(highQualitySessions);

    if (options.json) {
      console.log(JSON.stringify(patterns, null, 2));
      return;
    }

    console.log(`Analyzed ${patterns.totalPromptsAnalyzed} prompts`);
    console.log('');
    console.log('Successful Prompt Patterns:');
    console.log('='.repeat(50));

    for (const pattern of patterns.patterns) {
      console.log('');
      console.log(`📝 ${pattern.name}`);
      console.log(`   ${pattern.description}`);
      console.log(`   Template: ${pattern.template}`);
      console.log(`   Avg Leverage Score: ${Math.round(pattern.avgLeverageScore)}`);
      if (pattern.examples?.length > 0) {
        console.log(`   Example: "${pattern.examples[0].substring(0, 80)}..."`);
      }
    }

    if (patterns.antiPatterns?.length > 0) {
      console.log('');
      console.log('Anti-patterns to Avoid:');
      console.log('-'.repeat(30));
      for (const anti of patterns.antiPatterns) {
        console.log(`⚠️  ${anti.name}: ${anti.description}`);
      }
    }

    if (patterns.recommendations?.length > 0) {
      console.log('');
      console.log('Recommendations:');
      console.log('-'.repeat(30));
      for (const rec of patterns.recommendations) {
        console.log(`💡 ${rec}`);
      }
    }
  },

  async 'success-report'(args) {
    const options = parseOptions(args);
    const fs = require('fs');

    console.log('Generating success pattern report...');
    console.log('');

    const index = indexer.loadIndex();
    let sessions = Object.values(index.sessions);
    let classStats = null;

    if (sessions.length === 0) {
      throw new Error('No sessions indexed. Run `index` first.');
    }

    // Apply PM work filter if requested
    if (options.pmWorkOnly) {
      classStats = successAnalyzer.getClassificationStats(sessions);
      sessions = successAnalyzer.filterToPmWorkOnly(sessions);
      console.log(`Filtering to PM work only: ${sessions.length} sessions (excluded ${classStats['system-building']} system-building, ${classStats['unknown']} unknown)`);
      console.log('');
    }

    // Calculate baselines
    const leverageBaselines = leverageCalculator.calculateBaselines(sessions);

    // Detect 10x sessions
    const tenXSessions = successAnalyzer.detect10xSessions(sessions);

    // Get behavioral patterns
    const behaviorPatterns = successAnalyzer.identifyBehaviorPatterns(sessions);

    // Extract prompt patterns from high-quality sessions
    const highQualitySessions = sessions
      .filter(s => (s.quality?.overall || 0) >= 60)
      .sort((a, b) => (b.leverage?.score || 0) - (a.leverage?.score || 0))
      .slice(0, 50);

    let promptPatterns = { patterns: [], totalPromptsAnalyzed: 0 };
    if (highQualitySessions.length >= 10) {
      promptPatterns = await successAnalyzer.extractPromptPatterns(highQualitySessions);
    }

    // Calculate stats
    const avgLeverage = sessions.reduce((sum, s) => sum + (s.leverage?.score || 0), 0) / sessions.length;
    const avgQuality = sessions.reduce((sum, s) => sum + (s.quality?.overall || 0), 0) / sessions.length;

    // By leverage tier
    const byLeverageTier = {
      exceptional: sessions.filter(s => (s.leverage?.score || 0) >= 85).length,
      high: sessions.filter(s => (s.leverage?.score || 0) >= 70 && (s.leverage?.score || 0) < 85).length,
      medium: sessions.filter(s => (s.leverage?.score || 0) >= 50 && (s.leverage?.score || 0) < 70).length,
      low: sessions.filter(s => (s.leverage?.score || 0) < 50).length
    };

    // Generate markdown report
    const date = new Date().toISOString().split('T')[0];
    const reportTitle = options.pmWorkOnly
      ? '# Success Pattern Analysis Report (PM Work Only)'
      : '# Success Pattern Analysis Report';
    const filterNote = options.pmWorkOnly && classStats
      ? `\n**Filter**: PM work only (excluded ${classStats['system-building']} system-building, ${classStats['unknown']} unknown sessions)`
      : '';
    let report = `${reportTitle}

Generated: ${new Date().toISOString()}
Sessions Analyzed: ${sessions.length}${filterNote}

## Executive Summary

| Metric | Value |
|--------|-------|
| Total Sessions | ${sessions.length} |
| 10x Sessions | ${tenXSessions.length} (${Math.round(tenXSessions.length / sessions.length * 100)}%) |
| Avg Leverage Score | ${Math.round(avgLeverage)}/100 |
| Avg Quality Score | ${Math.round(avgQuality)}/100 |

### Leverage Distribution

| Tier | Count | Percentage |
|------|-------|------------|
| Exceptional (85+) | ${byLeverageTier.exceptional} | ${Math.round(byLeverageTier.exceptional / sessions.length * 100)}% |
| High (70-84) | ${byLeverageTier.high} | ${Math.round(byLeverageTier.high / sessions.length * 100)}% |
| Medium (50-69) | ${byLeverageTier.medium} | ${Math.round(byLeverageTier.medium / sessions.length * 100)}% |
| Low (<50) | ${byLeverageTier.low} | ${Math.round(byLeverageTier.low / sessions.length * 100)}% |

---

## 10x Sessions

These sessions dramatically exceeded typical performance (top 10% leverage + top 20% quality).

`;

    for (const result of tenXSessions.slice(0, 20)) {
      const session = result.session;
      const sessionId = session.id.split(':').pop();
      report += `### ${result.multiplier}x - ${session.summary || 'Untitled'}

- **Leverage Score**: ${session.leverage?.score || 0}/100
- **Quality Score**: ${session.quality?.overall || 0}/100
- **Turns**: ${session.turnCount} | **Tools**: ${session.toolUseCount}
`;
      if (session.techniques?.length > 0) {
        report += `- **Techniques**: ${session.techniques.map(t => t.name).join(', ')}\n`;
      }
      report += `- **Resume**: \`claude --resume ${sessionId}\`\n\n`;
    }

    report += `---

## Prompt Patterns

Patterns extracted from ${promptPatterns.totalPromptsAnalyzed} prompts in high-quality sessions.

`;

    for (const pattern of promptPatterns.patterns) {
      report += `### ${pattern.name}

${pattern.description}

- **Template**: \`${pattern.template}\`
- **Avg Leverage Score**: ${Math.round(pattern.avgLeverageScore || 0)}

`;
      if (pattern.examples?.length > 0) {
        report += `**Example**: "${pattern.examples[0].substring(0, 150)}..."\n\n`;
      }
    }

    if (promptPatterns.antiPatterns?.length > 0) {
      report += `### Anti-Patterns to Avoid\n\n`;
      for (const anti of promptPatterns.antiPatterns) {
        report += `- **${anti.name}**: ${anti.description}\n`;
      }
      report += '\n';
    }

    report += `---

## Behavioral Insights

Correlations between behaviors and success.

### Top Success Factors

| Factor | Value | Sessions | Avg Leverage |
|--------|-------|----------|--------------|
`;

    for (const behavior of behaviorPatterns.topBehaviors.slice(0, 10)) {
      report += `| ${behavior.factor} | ${behavior.value} | ${behavior.sessionCount} | ${behavior.avgLeverageScore} |\n`;
    }

    if (promptPatterns.recommendations?.length > 0) {
      report += `\n---

## Recommendations

`;
      for (const rec of promptPatterns.recommendations) {
        report += `1. ${rec}\n`;
      }
    }

    report += `\n---

*Report generated by PM AI Success Pattern Analyzer*
`;

    // Save report
    const reportsDir = path.join(process.cwd(), '.ai', 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const reportPath = path.join(reportsDir, `success-patterns-${date}.md`);
    fs.writeFileSync(reportPath, report);

    if (options.json) {
      console.log(JSON.stringify({
        reportPath,
        summary: {
          totalSessions: sessions.length,
          tenXCount: tenXSessions.length,
          avgLeverage: Math.round(avgLeverage),
          avgQuality: Math.round(avgQuality),
          byLeverageTier
        },
        tenXSessions: tenXSessions.slice(0, 20).map(r => ({
          id: r.session.id,
          summary: r.session.summary,
          multiplier: r.multiplier,
          leverageScore: r.session.leverage?.score,
          qualityScore: r.session.quality?.overall
        })),
        promptPatterns: promptPatterns.patterns,
        behaviorPatterns: behaviorPatterns.topBehaviors
      }, null, 2));
      return;
    }

    console.log(`Report saved to: ${reportPath}`);
    console.log('');
    console.log('Summary:');
    console.log(`  Total Sessions: ${sessions.length}`);
    console.log(`  10x Sessions: ${tenXSessions.length}`);
    console.log(`  Avg Leverage: ${Math.round(avgLeverage)}/100`);
    console.log(`  Avg Quality: ${Math.round(avgQuality)}/100`);
    console.log('');
    console.log('Run `cat ' + reportPath + '` to view the full report.');
  }
};

// Main
run({
  name: 'chat-analytics',
  mode: 'operational',
  services: [],
}, async (ctx) => {
  const command = ctx.args.positional[0];
  const cmdArgs = ctx.args.raw.slice(1);

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    commands.help();
    return;
  }

  if (!commands[command]) {
    throw new Error(`Unknown command: ${command}. Run 'chat-analytics help' for usage.`);
  }

  await commands[command](cmdArgs);
});
