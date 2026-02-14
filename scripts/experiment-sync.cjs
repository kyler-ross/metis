#!/usr/bin/env node
/**
 * Experiment Sync Pipeline
 *
 * Incrementally syncs experiment data from multiple sources into the experiment knowledge base.
 *
 * Usage:
 *   node experiment-sync.cjs                    # Run full sync
 *   node experiment-sync.cjs --check            # Check staleness without syncing
 *   node experiment-sync.cjs --source <name>    # Sync specific source only
 *   node experiment-sync.cjs --dry-run          # Show what would change without writing
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const transcriptHelpers = require('./transcript-sync-helpers.cjs');
const { run } = require('./lib/script-runner.cjs');
const { track } = require('./lib/telemetry.cjs');

// Paths
const EXPERIMENTS_DIR = path.join(__dirname, '../knowledge/experiments');
const CONFIG_PATH = path.join(EXPERIMENTS_DIR, '_sync-config.json');
const SOURCES_PATH = path.join(EXPERIMENTS_DIR, '_sources.json');
const INDEX_PATH = path.join(EXPERIMENTS_DIR, '_index.json');
const RAW_DIR = path.join(EXPERIMENTS_DIR, '_raw');

// Load config
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

/**
 * Update sources tracking
 */
function updateSources(sourceName, data) {
  const sources = JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8'));

  if (sources.sources[sourceName]) {
    sources.sources[sourceName] = {
      ...sources.sources[sourceName],
      ...data,
      last_sync: new Date().toISOString()
    };
  }

  sources.last_full_sync = new Date().toISOString();
  fs.writeFileSync(SOURCES_PATH, JSON.stringify(sources, null, 2));
}

/**
 * Save raw data to file
 */
function saveRaw(filename, data) {
  const rawPath = path.join(RAW_DIR, filename);
  fs.writeFileSync(rawPath, JSON.stringify(data, null, 2));
  return rawPath;
}

// ============================================================================
// Source: PostHog
// ============================================================================

function syncPostHog(dryRun = false) {
  console.log('\n=== PostHog Experiments ===\n');

  if (!config.sources.posthog?.enabled) {
    console.log('  [DISABLED]');
    return { synced: 0, found: 0 };
  }

  // PostHog sync requires MCP which we can't call from Node
  // Instead, note that it needs to be run via Claude
  console.log('  PostHog requires MCP tools - run via Claude Code:');
  console.log('  mcp__posthog__experiment-get-all');
  console.log('  [SKIPPED - use Claude for PostHog sync]');

  return { synced: 0, found: 0, note: 'Requires MCP' };
}

// ============================================================================
// Source: iOS Code
// ============================================================================

function syncIOSCode(dryRun = false) {
  console.log('\n=== iOS Experiments ===\n');

  if (!config.sources.ios_code?.enabled) {
    console.log('  [DISABLED]');
    return { synced: 0, found: 0 };
  }

  const filePath = path.resolve(__dirname, '../../..', config.sources.ios_code.file_path);

  // Validate resolved path stays within the expected repository root
  const repoRoot = path.resolve(__dirname, '../../..');
  if (!filePath.startsWith(repoRoot + path.sep) && filePath !== repoRoot) {
    console.log(`  Path escapes repo boundary: ${filePath}`);
    updateSources('ios_code', { status: 'error', notes: 'Path escapes repo boundary' });
    return { synced: 0, found: 0, error: 'Path escapes repo boundary' };
  }

  if (!fs.existsSync(filePath)) {
    console.log(`  File not found: ${filePath}`);
    updateSources('ios_code', { status: 'error', notes: 'File not found' });
    return { synced: 0, found: 0, error: 'File not found' };
  }

  // Check file size before processing (prevent DoS with large files)
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB limit
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_FILE_SIZE) {
    console.log(`  File too large: ${stat.size} bytes (max ${MAX_FILE_SIZE})`);
    updateSources('ios_code', { status: 'error', notes: 'File exceeds size limit' });
    return { synced: 0, found: 0, error: 'File exceeds size limit' };
  }

  const content = fs.readFileSync(filePath, 'utf8');

  // Parse experiments from Swift file
  const experimentRegex = /struct\s+(\w+):\s*CloakedExperiment\s*\{[^}]*static\s+let\s+featureFlagKey\s*=\s*"([^"]+)"/gs;
  const experiments = [];
  let match;

  while ((match = experimentRegex.exec(content)) !== null) {
    experiments.push({
      struct_name: match[1],
      feature_flag_key: match[2]
    });
  }

  // Also find removed experiments (commented out or in REMOVED section)
  const removedRegex = /\/\/\s*REMOVED:?\s*(\w+)/gi;
  const removed = [];
  while ((match = removedRegex.exec(content)) !== null) {
    removed.push(match[1]);
  }

  console.log(`  Found ${experiments.length} active experiments`);
  console.log(`  Found ${removed.length} removed experiments`);

  if (!dryRun) {
    saveRaw('ios-experiments.json', {
      source: 'ios_code',
      retrieved_at: new Date().toISOString(),
      file: config.sources.ios_code.file_path,
      active: experiments,
      removed: removed
    });

    updateSources('ios_code', {
      items_found: experiments.length,
      active_count: experiments.length,
      removed_count: removed.length,
      status: 'synced',
      notes: `${experiments.length} active, ${removed.length} removed`
    });
  }

  return { synced: experiments.length, found: experiments.length };
}

// ============================================================================
// Source: Android Code
// ============================================================================

function syncAndroidCode(dryRun = false) {
  console.log('\n=== Android Experiments ===\n');

  if (!config.sources.android_code?.enabled) {
    console.log('  [DISABLED]');
    return { synced: 0, found: 0 };
  }

  const basePath = path.resolve(__dirname, '../../..');
  const experiments = [];

  // Read ProductExperimentInfo.kt for actual experiments
  for (const relPath of config.sources.android_code.file_paths || []) {
    const filePath = path.resolve(basePath, relPath);

    // Validate resolved path stays within the expected repository root
    if (!filePath.startsWith(basePath + path.sep) && filePath !== basePath) {
      console.log(`  Path escapes repo boundary: ${relPath}`);
      continue;
    }

    if (!fs.existsSync(filePath)) {
      console.log(`  File not found: ${relPath}`);
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');

    // Parse experiments from ProductExperimentInfo sealed interface
    if (relPath.includes('ProductExperimentInfo')) {
      const expRegex = /data\s+object\s+(\w+)\s*:\s*ProductExperiment/g;
      let match;
      while ((match = expRegex.exec(content)) !== null) {
        experiments.push({ name: match[1], type: 'product_experiment' });
      }
    }

    // Parse mappings from PostHogManager
    if (relPath.includes('PostHogManager')) {
      const mappingRegex = /ProductExperiment\.(\w+)\s*->\s*"([^"]+)"/g;
      let match;
      while ((match = mappingRegex.exec(content)) !== null) {
        const exp = experiments.find(e => e.name === match[1]);
        if (exp) {
          exp.feature_flag_key = match[2];
        }
      }
    }
  }

  console.log(`  Found ${experiments.length} product experiments`);

  if (!dryRun) {
    saveRaw('android-experiments.json', {
      source: 'android_code',
      retrieved_at: new Date().toISOString(),
      experiments: experiments
    });

    updateSources('android_code', {
      items_found: experiments.length,
      status: 'synced',
      notes: `${experiments.length} product experiments from ProductExperimentInfo.kt`
    });
  }

  return { synced: experiments.length, found: experiments.length };
}

// ============================================================================
// Source: Dashboard Code
// ============================================================================

function syncDashboardCode(dryRun = false) {
  console.log('\n=== Dashboard Experiments ===\n');

  if (!config.sources.dashboard_code?.enabled) {
    console.log('  [DISABLED]');
    return { synced: 0, found: 0 };
  }

  const basePath = path.resolve(__dirname, '../../..');
  const experiments = [];

  // Read posthogEvents.js and grep for experiment flags
  for (const relPath of config.sources.dashboard_code.file_paths || []) {
    const filePath = path.resolve(basePath, relPath);

    // Validate resolved path stays within the expected repository root
    if (!filePath.startsWith(basePath + path.sep) && filePath !== basePath) {
      console.log(`  Path escapes repo boundary: ${relPath}`);
      continue;
    }

    if (!fs.existsSync(filePath)) {
      console.log(`  File not found: ${relPath}`);
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');

    // Look for experiment-related constants
    const constRegex = /export\s+const\s+(\w*[Ee]xperiment\w*)\s*=\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = constRegex.exec(content)) !== null) {
      experiments.push({
        const_name: match[1],
        feature_flag_key: match[2]
      });
    }
  }

  // Search Vue/JS files for getFeatureFlag calls using pure Node.js (no shell commands)
  const dashboardSrc = path.join(basePath, 'dashboard', 'src');
  if (fs.existsSync(dashboardSrc)) {
    try {
      const MAX_FILE_SIZE = 1024 * 1024; // 1MB limit per file
      const MAX_FILES = 500; // Limit number of files to process
      let filesProcessed = 0;

      // Recursive file finder (safe - no shell)
      function findFiles(dir, extensions) {
        const results = [];
        if (filesProcessed >= MAX_FILES) return results;

        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (filesProcessed >= MAX_FILES) break;
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
              results.push(...findFiles(fullPath, extensions));
            } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
              results.push(fullPath);
              filesProcessed++;
            }
          }
        } catch (e) {
          // Skip directories we can't read
        }
        return results;
      }

      const files = findFiles(dashboardSrc, ['.vue', '.js']);
      const flagRegex = /getFeatureFlag\(['"]([\w-]+)['"]\)/g;

      for (const file of files) {
        try {
          const stat = fs.statSync(file);
          if (stat.size > MAX_FILE_SIZE) continue; // Skip large files

          const content = fs.readFileSync(file, 'utf8');
          let match;
          while ((match = flagRegex.exec(content)) !== null) {
            if (!experiments.find(e => e.feature_flag_key === match[1])) {
              experiments.push({
                const_name: null,
                feature_flag_key: match[1],
                source: 'inline_usage'
              });
            }
          }
        } catch (e) {
          // Skip files we can't read
        }
      }
    } catch (e) {
      console.log(`  File search failed: ${e.message}`);
    }
  }

  console.log(`  Found ${experiments.length} experiment flags`);

  if (!dryRun) {
    saveRaw('dashboard-experiments.json', {
      source: 'dashboard_code',
      retrieved_at: new Date().toISOString(),
      experiments: experiments
    });

    updateSources('dashboard_code', {
      items_found: experiments.length,
      status: 'synced',
      notes: `${experiments.length} experiment flags found`
    });
  }

  return { synced: experiments.length, found: experiments.length };
}

// ============================================================================
// Source: Confluence
// ============================================================================

async function syncConfluence(dryRun = false) {
  console.log('\n=== Confluence Experiments ===\n');

  if (!config.sources.confluence?.enabled) {
    console.log('  [DISABLED]');
    return { synced: 0, found: 0 };
  }

  let confluence;
  try {
    confluence = require('./lib/confluence-client.cjs').confluence;
  } catch (err) {
    console.log(`  Confluence client unavailable: ${err.message}`);
    updateSources('confluence', { status: 'error', notes: err.message });
    return { synced: 0, found: 0, error: err.message };
  }

  console.log('  Searching for experiment-related pages...');

  // Search for ALL experiment-related content (no date filters - DEPTH over recency)
  const queries = [
    'text ~ "experiment" OR text ~ "A/B test" OR title ~ "EXP:"',
    'text ~ "variant" AND (text ~ "control" OR text ~ "test")',
    'text ~ "hypothesis" AND text ~ "success metrics"'
  ];

  const allPages = new Set();
  const seenIds = new Set();

  // Gather all pages from multiple CQL searches
  for (const cql of queries) {
    try {
      const results = await confluence.searchAllCQL(cql, {
        expand: 'body.storage,version,metadata.labels,space,ancestors',
        maxResults: 500
      });

      console.log(`    Query found ${results.length} pages`);

      for (const page of results) {
        if (!seenIds.has(page.id)) {
          allPages.add(page);
          seenIds.add(page.id);
        }
      }
    } catch (e) {
      console.log(`    Query failed: ${e.message}`);
    }
  }

  console.log(`  Found ${allPages.size} unique pages`);

  // Parse and extract DEEP content from each page
  const extractedPages = [];

  for (const page of allPages) {
    try {
      const extracted = extractPageContent(page);

      // Only include pages with experiment-relevant content
      if (extracted.has_experiment_content) {
        extractedPages.push(extracted);
      }
    } catch (e) {
      console.log(`    Failed to parse page ${page.id}: ${e.message}`);
    }
  }

  console.log(`  Extracted ${extractedPages.length} pages with experiment content`);

  // Match pages to experiments by feature flag or name
  const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  let matched = 0;

  for (const page of extractedPages) {
    for (const exp of index.experiments) {
      const flagKey = exp.feature_flag_key?.toLowerCase() || '';
      const expName = exp.canonical_name?.toLowerCase() || '';

      if (
        (flagKey && page.feature_flags.some(f => f.toLowerCase() === flagKey)) ||
        (expName && page.text_content.toLowerCase().includes(expName))
      ) {
        page.matched_experiments.push({
          canonical_name: exp.canonical_name,
          feature_flag_key: exp.feature_flag_key
        });
        matched++;
      }
    }
  }

  console.log(`  Matched ${matched} page-experiment associations`);

  if (!dryRun) {
    saveRaw('confluence-experiments.json', {
      source: 'confluence',
      retrieved_at: new Date().toISOString(),
      total_pages: extractedPages.length,
      pages: extractedPages
    });

    updateSources('confluence', {
      items_found: extractedPages.length,
      experiments_matched: matched,
      status: 'synced',
      notes: `${extractedPages.length} experiment pages extracted with full content`
    });
  }

  return { synced: matched, found: extractedPages.length };
}

/**
 * Extract and parse experiment content from a Confluence page
 * @param {Object} page - Confluence page object with body.storage
 * @returns {Object} Extracted structured content
 */
function extractPageContent(page) {
  const html = page.body?.storage?.value || '';
  const title = page.title || '';

  // Extract text content from HTML
  const textContent = html
    .replace(/<\/?(p|br|div|h[1-6]|li)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n\s*\n/g, '\n')
    .trim();

  // Detect experiment-relevant patterns
  const hasExperiment =
    /experiment|a\/b test|variant|hypothesis|success metric/i.test(title + textContent);

  // Extract structured sections
  const hypothesis = extractSection(html, textContent, [
    'hypothesis',
    'problem statement',
    'we believe'
  ]);

  const designRationale = extractSection(html, textContent, [
    'design rationale',
    'approach',
    'solution',
    'why this'
  ]);

  const successMetrics = extractSection(html, textContent, [
    'success metrics',
    'kpis',
    'measurements',
    'how we measure'
  ]);

  const decisions = extractSection(html, textContent, [
    'decision',
    'conclusion',
    'outcome',
    'learnings'
  ]);

  // Extract tables as structured data
  const tables = extractTables(html);

  // Extract feature flags mentioned
  const featureFlagRegex = /[\w-]+[-_](experiment|test|variant|flag)/gi;
  const flagMatches = (title + textContent).match(featureFlagRegex) || [];
  const featureFlags = [...new Set(flagMatches.map(f => f.toLowerCase()))];

  // Extract status from labels or content
  const labels = (page.metadata?.labels?.results || []).map(l => l.name);
  const status = detectStatus(title, textContent, labels);

  // Extract related/linked pages
  const linkedPages = extractLinkedPages(html);

  // Extract callouts/panels (often contain important context)
  const callouts = extractCallouts(html);

  return {
    page_id: page.id,
    title,
    url: `${process.env.ATLASSIAN_URL || 'https://yourcompany.atlassian.net'}/wiki/spaces/${page.space?.key}/pages/${page.id}`,
    space: page.space?.key || 'unknown',
    version: page.version?.number || 1,
    last_updated: page.version?.when || page.history?.lastUpdated?.when || null,
    author: page.version?.by?.displayName || page.history?.createdBy?.displayName || null,
    labels,
    status,
    has_experiment_content: hasExperiment,

    // Content sections
    text_content: textContent.substring(0, 5000), // First 5000 chars
    hypothesis,
    design_rationale: designRationale,
    success_metrics: successMetrics,
    decisions,

    // Structured data
    tables,
    feature_flags: featureFlags,
    linked_pages: linkedPages,
    callouts,

    // Matching
    matched_experiments: []
  };
}

/**
 * Extract a specific section from HTML/text
 */
function extractSection(html, text, keywords) {
  // Try to find section by heading
  for (const keyword of keywords) {
    const headingRegex = new RegExp(`<h[1-6][^>]*>\\s*${keyword}[^<]*</h[1-6]>([\\s\\S]*?)(?=<h[1-6]|$)`, 'i');
    const match = html.match(headingRegex);
    if (match) {
      return match[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim()
        .substring(0, 1000);
    }

    // Fallback: extract paragraph after keyword
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (new RegExp(keyword, 'i').test(lines[i])) {
        // Get next 3-5 lines as context
        return lines.slice(i, Math.min(i + 5, lines.length))
          .join('\n')
          .trim()
          .substring(0, 1000);
      }
    }
  }

  return null;
}

/**
 * Extract tables as structured arrays
 */
function extractTables(html) {
  const tables = [];
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;

  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableHtml = tableMatch[1];
    const rows = [];

    // Extract rows
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;

    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      const rowHtml = rowMatch[1];
      const cells = [];

      // Extract cells (th or td)
      const cellRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
      let cellMatch;

      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        const cellText = cellMatch[1]
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .trim();
        cells.push(cellText);
      }

      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    if (rows.length > 0) {
      tables.push(rows);
    }
  }

  return tables;
}

/**
 * Extract linked page references
 */
function extractLinkedPages(html) {
  const links = [];
  const linkRegex = /<ac:link[^>]*>[\s\S]*?<ri:page[^>]*ri:content-title="([^"]+)"[^>]*\/>/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    links.push(match[1]);
  }

  return [...new Set(links)]; // dedupe
}

/**
 * Extract callout/panel content (often contains important info)
 */
function extractCallouts(html) {
  const callouts = [];
  const calloutRegex = /<ac:structured-macro[^>]*ac:name="(info|note|warning|tip)"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi;
  let match;

  while ((match = calloutRegex.exec(html)) !== null) {
    const type = match[1];
    const content = match[2]
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();

    if (content) {
      callouts.push({ type, content: content.substring(0, 500) });
    }
  }

  return callouts;
}

/**
 * Detect experiment status from various signals
 */
function detectStatus(title, text, labels) {
  const combined = (title + text + labels.join(' ')).toLowerCase();

  if (/concluded|completed|ended|archived/i.test(combined)) return 'concluded';
  if (/running|active|in progress|launched/i.test(combined)) return 'active';
  if (/planned|upcoming|draft|proposal/i.test(combined)) return 'planned';
  if (/cancelled|abandoned|rejected/i.test(combined)) return 'cancelled';

  return 'unknown';
}

// ============================================================================
// Source: Slack
// ============================================================================

async function syncSlack(dryRun = false) {
  console.log('\n=== Slack Experiments ===\n');

  if (!config.sources.slack?.enabled) {
    console.log('  [DISABLED]');
    return { synced: 0, found: 0 };
  }

  let slack;
  try {
    slack = require('./lib/slack-client.cjs');
    await slack.testAuth();
  } catch (err) {
    console.log(`  Slack unavailable: ${err.message}`);
    updateSources('slack', { status: 'error', notes: err.message });
    return { synced: 0, found: 0, error: err.message };
  }

  console.log('  Searching for experiment mentions...');

  const allMessages = [];
  const queries = config.sources.slack.search_queries || ['experiment'];

  for (const query of queries) {
    try {
      const results = await slack.searchMessages(query);
      if (results?.matches) {
        for (const msg of results.matches) {
          allMessages.push({
            channel: msg.channel?.name,
            channel_id: msg.channel?.id,
            timestamp: msg.ts,
            date: new Date(parseFloat(msg.ts) * 1000).toISOString(),
            user: msg.username,
            user_id: msg.user,
            text: msg.text,
            type: msg.type,
            permalink: msg.permalink
          });
        }
      }
    } catch (e) {
      console.log(`  Query "${query}" failed: ${e.message}`);
    }
  }

  // Dedupe by timestamp
  const seen = new Set();
  const uniqueMessages = allMessages.filter(m => {
    if (seen.has(m.timestamp)) return false;
    seen.add(m.timestamp);
    return true;
  });

  console.log(`  Found ${uniqueMessages.length} unique experiment mentions`);

  // Build user cache for name resolution
  console.log('  Fetching user names...');
  let userCache = {};
  try {
    const users = await slack.listUsers();
    userCache = users.reduce((acc, u) => {
      acc[u.id] = u.real_name || u.name || u.id;
      return acc;
    }, {});
  } catch (e) {
    console.log(`  Could not fetch users: ${e.message}`);
  }

  // Fetch full threads with context
  console.log('  Fetching thread context...');
  const threads = [];

  for (const msg of uniqueMessages) {
    try {
      // Get full thread (includes parent + all replies)
      const threadMessages = await slack.getThreadReplies(msg.channel_id, msg.timestamp);

      if (threadMessages.length === 0) continue;

      // Extract thread metadata
      const participants = [...new Set(threadMessages.map(m => m.user).filter(Boolean))];
      const participantNames = participants.map(id => userCache[id] || id);

      // Convert messages to rich format
      const formattedMessages = threadMessages.map(m => ({
        user: userCache[m.user] || m.user || 'unknown',
        user_id: m.user,
        text: m.text || '',
        ts: m.ts,
        date: new Date(parseFloat(m.ts) * 1000).toISOString(),
        reactions: (m.reactions || []).map(r => ({
          name: r.name,
          count: r.count,
          users: r.users
        })),
        files: (m.files || []).map(f => ({
          name: f.name,
          url: f.url_private,
          type: f.filetype
        })),
        attachments: (m.attachments || []).map(a => ({
          title: a.title,
          text: a.text,
          url: a.title_link || a.from_url
        }))
      }));

      // Classify thread type
      const fullText = formattedMessages.map(m => m.text).join(' ').toLowerCase();
      let threadType = 'discussion';
      if (fullText.includes('launch') || fullText.includes('shipped') || fullText.includes('rolled out')) {
        threadType = 'launch';
      } else if (fullText.includes('result') || fullText.includes('metric') || fullText.includes('conversion')) {
        threadType = 'result';
      } else if (fullText.includes('?') && formattedMessages.length <= 3) {
        threadType = 'question';
      }

      // Extract decisions
      const decisionPatterns = [
        /decided to ([^.,;]+)/gi,
        /going with ([^.,;]+)/gi,
        /let's ([^.,;]+)/gi,
        /will ([^.,;]+)/gi,
        /shipping ([^.,;]+)/gi,
        /rolling back ([^.,;]+)/gi
      ];
      const decisions = [];
      for (const msg of formattedMessages) {
        for (const pattern of decisionPatterns) {
          const matches = msg.text.matchAll(pattern);
          for (const match of matches) {
            decisions.push(match[0]);
          }
        }
      }

      // Determine sentiment
      const positiveWords = ['great', 'good', 'excellent', 'success', 'winning', 'improved', 'better', 'love'];
      const negativeWords = ['bad', 'poor', 'fail', 'problem', 'issue', 'concern', 'worried', 'rollback', 'revert'];
      const positiveCount = positiveWords.filter(w => fullText.includes(w)).length;
      const negativeCount = negativeWords.filter(w => fullText.includes(w)).length;
      let sentiment = 'neutral';
      if (positiveCount > negativeCount + 1) sentiment = 'positive';
      if (negativeCount > positiveCount + 1) sentiment = 'negative';

      threads.push({
        channel: msg.channel,
        channel_id: msg.channel_id,
        thread_ts: msg.timestamp,
        permalink: msg.permalink,
        type: threadType,
        sentiment,
        participants: participantNames,
        message_count: formattedMessages.length,
        decisions: [...new Set(decisions)],
        messages: formattedMessages,
        retrieved_at: new Date().toISOString()
      });

    } catch (e) {
      console.log(`  Failed to fetch thread ${msg.timestamp}: ${e.message}`);
    }
  }

  console.log(`  Fetched ${threads.length} full threads`);

  // Match threads to existing experiments
  const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  let matched = 0;

  // Enhanced matching: try feature_flag_key, experiment name, and posthog ID
  for (const thread of threads) {
    const threadText = thread.messages.map(m => m.text).join(' ').toLowerCase();

    for (const exp of index.experiments) {
      let isMatch = false;

      // Match by feature flag key
      if (exp.feature_flag_key && threadText.includes(exp.feature_flag_key.toLowerCase())) {
        isMatch = true;
      }

      // Match by canonical name (convert to potential flag key format)
      if (exp.canonical_name) {
        const nameVariants = [
          exp.canonical_name.toLowerCase(),
          exp.canonical_name.toLowerCase().replace(/\s+/g, '-'),
          exp.canonical_name.toLowerCase().replace(/\s+/g, '_')
        ];
        if (nameVariants.some(v => threadText.includes(v))) {
          isMatch = true;
        }
      }

      // Match by PostHog ID if mentioned
      if (exp.posthog?.id && threadText.includes(exp.posthog.id)) {
        isMatch = true;
      }

      if (isMatch) {
        if (!thread.experiment_keys) thread.experiment_keys = [];
        thread.experiment_keys.push(exp.feature_flag_key || exp.canonical_name);
      }
    }

    if (thread.experiment_keys && thread.experiment_keys.length > 0) {
      matched++;
      if (!dryRun) {
        console.log(`    Thread in #${thread.channel}: ${thread.experiment_keys.join(', ')}`);
      }
    }
  }

  if (!dryRun) {
    saveRaw('slack-mentions.json', {
      source: 'slack',
      retrieved_at: new Date().toISOString(),
      total_threads: threads.length,
      threads_matched_to_experiments: matched,
      threads: threads.slice(0, config.sources.slack?.max_saved_threads || 50)
    });

    updateSources('slack', {
      items_found: threads.length,
      experiments_matched: matched,
      status: 'synced',
      notes: `${threads.length} threads, ${matched} matched to experiments`
    });
  }

  return { synced: matched, found: threads.length };
}

// ============================================================================
// Source: Google Docs/Slides
// ============================================================================

async function syncGoogleDocs(dryRun = false) {
  console.log('\n=== Google Docs/Slides ===\n');

  if (!config.sources.google_docs?.enabled) {
    console.log('  [DISABLED]');
    return { synced: 0, found: 0 };
  }

  let driveClient, docsLib, slidesLib;
  try {
    // Load Google clients
    driveClient = require('./lib/drive-client.cjs');
    const { google } = require('googleapis');
    const { getAuthClient } = require('./lib/google-auth.cjs');

    // Test auth
    const auth = await getAuthClient();
    docsLib = google.docs({ version: 'v1', auth });
    slidesLib = google.slides({ version: 'v1', auth });

    console.log('  Searching Google Drive for experiment documents...');

    // Build search queries based on feature flags from index
    const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
    const featureFlagKeys = index.experiments
      .map(e => e.feature_flag_key)
      .filter(k => k);

    // Search queries
    const searchTerms = [
      'experiment',
      'A/B test',
      'variant',
      ...featureFlagKeys.slice(0, 10) // Sample of feature flag keys
    ];

    const allFiles = new Map(); // fileId -> file

    // Search for each term
    for (const term of searchTerms) {
      try {
        const files = await driveClient.searchFiles(term, { pageSize: 50 });

        for (const file of files) {
          // Only include Docs, Slides, Sheets
          const isRelevant =
            file.mimeType.includes('document') ||
            file.mimeType.includes('presentation') ||
            file.mimeType.includes('spreadsheet');

          if (isRelevant && !allFiles.has(file.id)) {
            allFiles.set(file.id, file);
          }
        }
      } catch (e) {
        console.log(`  Search for "${term}" failed: ${e.message}`);
      }
    }

    console.log(`  Found ${allFiles.size} unique documents to analyze`);

    if (allFiles.size === 0) {
      if (!dryRun) {
        updateSources('google_docs', {
          items_found: 0,
          status: 'synced',
          notes: 'No relevant documents found'
        });
      }
      return { synced: 0, found: 0 };
    }

    // Extract content from each document
    const documents = [];
    let processed = 0;

    for (const [fileId, file] of allFiles) {
      processed++;
      if (processed > 100) break; // Limit to 100 documents

      console.log(`  Processing (${processed}/${Math.min(allFiles.size, 100)}): ${file.name}`);

      try {
        const docData = {
          id: fileId,
          title: file.name,
          type: file.mimeType.includes('presentation') ? 'slides' :
                file.mimeType.includes('spreadsheet') ? 'sheets' : 'docs',
          url: file.webViewLink || `https://docs.google.com/document/d/${fileId}/edit`,
          modified: file.modifiedTime,
          experiments_mentioned: []
        };

        let fullText = '';

        // Extract content based on type
        if (file.mimeType.includes('document')) {
          // Google Docs
          const doc = await docsLib.documents.get({ documentId: fileId });
          fullText = extractTextFromDoc(doc.data);
        } else if (file.mimeType.includes('presentation')) {
          // Google Slides
          const presentation = await slidesLib.presentations.get({ presentationId: fileId });
          fullText = extractTextFromSlides(presentation.data);
        } else if (file.mimeType.includes('spreadsheet')) {
          // Google Sheets - use Drive export
          fullText = await driveClient.getFileContent(fileId);
        }

        // Match experiments in content
        const experimentsFound = matchExperimentsInText(fullText, index.experiments);

        if (experimentsFound.length > 0) {
          docData.experiments_mentioned = experimentsFound;
          documents.push(docData);
          console.log(`    Found ${experimentsFound.length} experiment mentions`);
        }
      } catch (e) {
        console.log(`    Error processing: ${e.message}`);
      }
    }

    console.log(`  Processed ${processed} documents, found ${documents.length} with experiment content`);

    if (!dryRun) {
      saveRaw('google-docs-experiments.json', {
        source: 'google_docs',
        retrieved_at: new Date().toISOString(),
        total_documents_searched: allFiles.size,
        documents_processed: processed,
        documents_with_experiments: documents.length,
        documents: documents
      });

      updateSources('google_docs', {
        items_found: documents.length,
        documents_searched: allFiles.size,
        status: 'synced',
        notes: `${documents.length} documents with experiment content from ${allFiles.size} searched`
      });
    }

    return { synced: documents.length, found: allFiles.size };

  } catch (err) {
    console.log(`  Google Docs unavailable: ${err.message}`);
    if (!dryRun) {
      updateSources('google_docs', { status: 'error', notes: err.message });
    }
    return { synced: 0, found: 0, error: err.message };
  }
}

/**
 * Extract text from Google Docs document
 */
function extractTextFromDoc(doc) {
  let text = '';
  const content = doc.body.content;

  for (const element of content) {
    if (element.paragraph) {
      for (const elem of element.paragraph.elements) {
        if (elem.textRun) {
          text += elem.textRun.content;
        }
      }
    } else if (element.table) {
      // Handle tables
      for (const row of element.table.tableRows) {
        for (const cell of row.tableCells) {
          for (const cellElement of cell.content) {
            if (cellElement.paragraph) {
              for (const elem of cellElement.paragraph.elements) {
                if (elem.textRun) {
                  text += elem.textRun.content + ' ';
                }
              }
            }
          }
        }
      }
    }
  }

  return text;
}

/**
 * Extract text from Google Slides presentation
 */
function extractTextFromSlides(presentation) {
  let text = '';

  if (presentation.slides) {
    for (const slide of presentation.slides) {
      if (slide.pageElements) {
        for (const element of slide.pageElements) {
          if (element.shape && element.shape.text) {
            for (const textElement of element.shape.text.textElements) {
              if (textElement.textRun) {
                text += textElement.textRun.content + ' ';
              }
            }
          } else if (element.table) {
            // Handle tables in slides
            for (const row of element.table.tableRows) {
              for (const cell of row.tableCells) {
                if (cell.text) {
                  for (const textElement of cell.text.textElements) {
                    if (textElement.textRun) {
                      text += textElement.textRun.content + ' ';
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return text;
}

/**
 * Match experiments in text content
 */
function matchExperimentsInText(text, experiments) {
  const matches = [];
  const lowerText = text.toLowerCase();

  for (const exp of experiments) {
    const searchTerms = [
      exp.feature_flag_key,
      exp.canonical_name,
      exp.identification?.posthog_id
    ].filter(t => t);

    for (const term of searchTerms) {
      if (lowerText.includes(term.toLowerCase())) {
        // Extract context around the mention
        const termIndex = lowerText.indexOf(term.toLowerCase());
        const contextStart = Math.max(0, termIndex - 200);
        const contextEnd = Math.min(text.length, termIndex + term.length + 200);
        const context = text.substring(contextStart, contextEnd).trim();

        // Look for metrics patterns
        const metricsFound = extractMetrics(context);

        // Look for decision keywords
        const decision = extractDecision(context);

        matches.push({
          experiment_key: exp.feature_flag_key || exp.canonical_name,
          context: context,
          metrics_found: metricsFound,
          decision: decision
        });

        break; // Only match once per experiment
      }
    }
  }

  return matches;
}

/**
 * Extract metrics from text context
 */
function extractMetrics(text) {
  const metrics = {};

  // Match percentage patterns (e.g., "8.2%", "conversion: 10.6%")
  const percentMatches = text.match(/(\w+[:\s]+)?(\d+\.?\d*)\s*%/gi);
  if (percentMatches) {
    for (const match of percentMatches) {
      const parts = match.match(/(?:(\w+)[:\s]+)?(\d+\.?\d*)\s*%/i);
      if (parts) {
        const label = parts[1] || 'value';
        metrics[label.toLowerCase()] = parts[2] + '%';
      }
    }
  }

  // Match rate patterns (e.g., "conversion rate: 8.2")
  const rateMatches = text.match(/(\w+\s+rate)[:\s]+(\d+\.?\d*)/gi);
  if (rateMatches) {
    for (const match of rateMatches) {
      const parts = match.match(/(\w+\s+rate)[:\s]+(\d+\.?\d*)/i);
      if (parts) {
        metrics[parts[1].toLowerCase()] = parts[2];
      }
    }
  }

  return Object.keys(metrics).length > 0 ? metrics : null;
}

/**
 * Extract decision from text context
 */
function extractDecision(text) {
  const lowerText = text.toLowerCase();

  const decisionPatterns = [
    { pattern: /roll\s*back|rollback|revert/i, decision: 'Rolled back' },
    { pattern: /ship|launch|deploy|go\s*live|released/i, decision: 'Shipped' },
    { pattern: /pause|hold|stop/i, decision: 'Paused' },
    { pattern: /winner|winning|chose.*variant/i, decision: 'Winner selected' },
    { pattern: /inconclusive|no\s*winner|unclear/i, decision: 'Inconclusive' }
  ];

  for (const { pattern, decision } of decisionPatterns) {
    if (pattern.test(lowerText)) {
      return decision;
    }
  }

  return null;
}

// ============================================================================
// Source: Transcripts
// ============================================================================

function syncTranscripts(dryRun = false) {
  console.log('\n=== Transcripts (DEEP EXTRACTION) ===\n');

  if (!config.sources.transcripts?.enabled) {
    console.log('  [DISABLED]');
    return { synced: 0, found: 0 };
  }

  const {
    parseSpeakerStatements,
    extractExperimentMentions,
    extractContext,
    detectDiscussionType,
    extractDecisions,
    extractActionItems,
    detectSentiment,
    extractMeetingDate,
    identifyExperiment
  } = transcriptHelpers;

  const basePath = path.resolve(__dirname, '..');
  let totalMentions = 0;
  let filesScanned = 0;
  const allMentions = [];

  for (const relPath of config.sources.transcripts.paths || []) {
    const dirPath = path.resolve(basePath, relPath);

    if (!fs.existsSync(dirPath)) {
      console.log(`  Path not found: ${relPath}`);
      continue;
    }

    // Scan transcript files with deep extraction
    try {
      const files = fs.readdirSync(dirPath)
        .filter(f => f.endsWith('.md') || f.endsWith('.txt'))
        .sort();

      filesScanned += files.length;

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const content = fs.readFileSync(filePath, 'utf8');

        // Quick check if file mentions experiments
        if (!/experiment|a\/b test|variant|feature flag/i.test(content)) {
          continue;
        }

        totalMentions++;

        // Parse speaker statements
        const statements = parseSpeakerStatements(content);

        // Extract experiment mentions
        const mentions = extractExperimentMentions(content, file, statements);

        // Extract meeting date
        const meetingDate = extractMeetingDate(file, content);

        // Process each mention
        for (const mention of mentions) {
          const context = extractContext(statements, mention, 3);
          const discussionType = detectDiscussionType(mention, context);
          const decisions = extractDecisions(context);
          const actionItems = extractActionItems(context);
          const sentiment = detectSentiment(context);
          const experimentKey = identifyExperiment(mention, context);

          // Get unique speakers from context
          const contextStatements = statements.filter(s =>
            Math.abs(s.lineNumber - mention.lineNumber) <= 3
          );
          const speakerMap = new Map();

          for (const stmt of contextStatements) {
            if (!speakerMap.has(stmt.speaker)) {
              speakerMap.set(stmt.speaker, []);
            }
            speakerMap.get(stmt.speaker).push(stmt.text);
          }

          const speakers = Array.from(speakerMap.entries()).map(([name, statements]) => ({
            name,
            statements: statements.slice(0, 3) // Limit to 3 statements per speaker
          }));

          allMentions.push({
            file,
            date: meetingDate,
            experiment_key: experimentKey,
            type: discussionType,
            speakers,
            decisions,
            action_items: actionItems,
            context,
            sentiment,
            keywords: mention.keywords,
            timestamp: mention.timestamp
          });
        }
      }
    } catch (e) {
      console.log(`  Error scanning ${relPath}: ${e.message}`);
    }
  }

  console.log(`  Scanned ${filesScanned} files`);
  console.log(`  Found ${totalMentions} files with experiment mentions`);
  console.log(`  Extracted ${allMentions.length} detailed mentions`);

  // Save detailed mentions to _raw/transcript-mentions.json
  if (!dryRun && allMentions.length > 0) {
    const output = {
      generated_at: new Date().toISOString(),
      total_files_scanned: filesScanned,
      files_with_mentions: totalMentions,
      total_mentions_extracted: allMentions.length,
      mentions: allMentions
    };

    saveRaw('transcript-mentions.json', output);
    console.log(`  Saved detailed extraction to _raw/transcript-mentions.json`);

    // Show breakdown by experiment
    const byExperiment = {};
    for (const m of allMentions) {
      byExperiment[m.experiment_key] = (byExperiment[m.experiment_key] || 0) + 1;
    }
    console.log('\n  Mentions by experiment:');
    for (const [key, count] of Object.entries(byExperiment).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${key}: ${count}`);
    }
  }

  if (!dryRun) {
    updateSources('transcripts', {
      items_found: filesScanned,
      experiment_mentions: totalMentions,
      detailed_extractions: allMentions.length,
      status: 'synced',
      notes: `${filesScanned} transcripts scanned; ${totalMentions} contain experiment content; ${allMentions.length} detailed mentions extracted with speaker attribution, context, and decisions`
    });
  }

  return { synced: totalMentions, found: filesScanned, extracted: allMentions.length };
}

// ============================================================================
// Check Staleness
// ============================================================================

function checkStaleness() {
  console.log('\n=== Experiment Sync Status ===\n');

  const sources = JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8'));
  const now = Date.now();

  for (const [name, source] of Object.entries(sources.sources)) {
    const lastSync = source.last_sync ? new Date(source.last_sync).getTime() : 0;
    const age = now - lastSync;
    const threshold = (config.sources[name]?.stale_threshold_hours || 24) * 60 * 60 * 1000;
    const isStale = age > threshold;
    const ageHours = Math.round(age / (60 * 60 * 1000));

    const enabled = config.sources[name]?.enabled !== false;
    const status = !enabled ? '[DISABLED]' :
                   source.status === 'error' ? '[ERROR]' :
                   isStale ? '[STALE]' : '[OK]';

    console.log(`${status} ${source.name}`);
    console.log(`  Last sync: ${lastSync ? `${ageHours}h ago` : 'never'}`);
    console.log(`  Items: ${source.items_found || 0}`);
    if (source.notes) console.log(`  Notes: ${source.notes}`);
    console.log('');
  }
}

// ============================================================================
// Main
// ============================================================================

run({
  name: 'experiment-sync',
  mode: 'operational',
  services: ['posthog'],
  description: `Experiment Sync Pipeline

Sources: posthog, ios_code, android_code, dashboard_code, confluence, slack, google_docs, transcripts`,
  args: { required: [], optional: ['--check', '--source', '--dry-run'] },
}, async (ctx) => {
  const mode = ctx.args.flags.check ? 'check' : ctx.args.flags['dry-run'] ? 'dry-run' : 'sync';
  const dryRun = ctx.args.flags['dry-run'] || false;

  if (ctx.args.flags.check) {
    await checkStaleness();
    return;
  }

  const specificSource = ctx.args.flags.source || null;

  console.log('Experiment Sync Pipeline');
  console.log('=' .repeat(50));
  if (dryRun) console.log('DRY RUN - no changes will be written\n');

  const results = { total_synced: 0, total_found: 0 };

  // Run each source
  const syncFns = {
    posthog: syncPostHog,
    ios_code: syncIOSCode,
    android_code: syncAndroidCode,
    dashboard_code: syncDashboardCode,
    confluence: syncConfluence,
    slack: syncSlack,
    google_docs: syncGoogleDocs,
    transcripts: syncTranscripts
  };

  for (const [name, fn] of Object.entries(syncFns)) {
    if (specificSource && specificSource !== name) continue;

    const result = await fn(dryRun);
    results.total_synced += result.synced || 0;
    results.total_found += result.found || 0;
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`Total items found: ${results.total_found}`);
  console.log(`Experiments synced: ${results.total_synced}`);

  track('experiment_sync', { found: results.total_found, synced: results.total_synced, mode });
});
