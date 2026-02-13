// PM AI Starter Kit - experiment-sync.cjs
#!/usr/bin/env node
/**
 * Experiment Sync Pipeline
 *
 * Incrementally syncs experiment data from multiple sources into the experiment knowledge base.
 * Sources include: PostHog, iOS/Android/Dashboard code, Confluence, Slack, Google Docs, Transcripts.
 *
 * Required environment variables (depends on which sources are enabled):
 *   ATLASSIAN_URL, ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN - For Confluence
 *   SLACK_BOT_TOKEN - For Slack
 *   Google OAuth token - For Google Docs/Slides
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
const { track, trackScript, trackComplete, trackError, flush } = require('./lib/telemetry.cjs');

// Paths
const EXPERIMENTS_DIR = path.join(__dirname, '..', 'knowledge', 'experiments');
const CONFIG_PATH = path.join(EXPERIMENTS_DIR, '_sync-config.json');
const SOURCES_PATH = path.join(EXPERIMENTS_DIR, '_sources.json');
const INDEX_PATH = path.join(EXPERIMENTS_DIR, '_index.json');
const RAW_DIR = path.join(EXPERIMENTS_DIR, '_raw');

// Load config (create defaults if not found)
let config;
try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch {
  console.log('No _sync-config.json found. Creating default configuration...');
  config = {
    sources: {
      posthog: { enabled: false, notes: 'Requires MCP - run via Claude Code' },
      ios_code: { enabled: false, file_path: '', stale_threshold_hours: 24 },
      android_code: { enabled: false, file_paths: [], stale_threshold_hours: 24 },
      dashboard_code: { enabled: false, file_paths: [], stale_threshold_hours: 24 },
      confluence: { enabled: false, stale_threshold_hours: 24 },
      slack: { enabled: false, search_queries: ['experiment', 'A/B test'], stale_threshold_hours: 24, max_saved_threads: 50 },
      google_docs: { enabled: false, stale_threshold_hours: 48 },
      transcripts: { enabled: false, paths: ['local/private_transcripts', 'knowledge/meeting_transcripts'], stale_threshold_hours: 12 }
    }
  };

  // Ensure experiments directory exists
  if (!fs.existsSync(EXPERIMENTS_DIR)) {
    fs.mkdirSync(EXPERIMENTS_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log(`Created ${CONFIG_PATH}`);
}

// Ensure sources file exists
let sourcesData;
try {
  sourcesData = JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8'));
} catch {
  sourcesData = {
    last_full_sync: null,
    sources: {
      posthog: { name: 'PostHog', last_sync: null, items_found: 0, status: 'never_synced' },
      ios_code: { name: 'iOS Code', last_sync: null, items_found: 0, status: 'never_synced' },
      android_code: { name: 'Android Code', last_sync: null, items_found: 0, status: 'never_synced' },
      dashboard_code: { name: 'Dashboard Code', last_sync: null, items_found: 0, status: 'never_synced' },
      confluence: { name: 'Confluence', last_sync: null, items_found: 0, status: 'never_synced' },
      slack: { name: 'Slack', last_sync: null, items_found: 0, status: 'never_synced' },
      google_docs: { name: 'Google Docs', last_sync: null, items_found: 0, status: 'never_synced' },
      transcripts: { name: 'Transcripts', last_sync: null, items_found: 0, status: 'never_synced' }
    }
  };
  fs.writeFileSync(SOURCES_PATH, JSON.stringify(sourcesData, null, 2));
}

// Ensure raw directory exists
if (!fs.existsSync(RAW_DIR)) {
  fs.mkdirSync(RAW_DIR, { recursive: true });
}

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

  const repoRoot = path.resolve(__dirname, '..', '..');
  const filePath = path.resolve(repoRoot, config.sources.ios_code.file_path);

  // Validate resolved path stays within the expected repository root
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
  // Customize this regex for your experiment protocol/struct pattern
  const experimentRegex = /struct\s+(\w+):\s*\w*Experiment\s*\{[^}]*static\s+let\s+featureFlagKey\s*=\s*"([^"]+)"/gs;
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

  const basePath = path.resolve(__dirname, '..', '..');
  const experiments = [];

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

    // Parse experiments from Kotlin sealed interface
    // Customize this regex for your experiment pattern
    if (relPath.includes('ExperimentInfo') || relPath.includes('Experiment')) {
      const expRegex = /data\s+object\s+(\w+)\s*:\s*\w*Experiment/g;
      let match;
      while ((match = expRegex.exec(content)) !== null) {
        experiments.push({ name: match[1], type: 'product_experiment' });
      }
    }

    // Parse mappings from PostHog/analytics manager
    if (relPath.includes('PostHog') || relPath.includes('Analytics')) {
      const mappingRegex = /\w*Experiment\.(\w+)\s*->\s*"([^"]+)"/g;
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
      notes: `${experiments.length} product experiments`
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

  const basePath = path.resolve(__dirname, '..', '..');
  const experiments = [];

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

  // Search source files for getFeatureFlag calls using pure Node.js (no shell commands)
  const dashboardSrc = path.join(basePath, 'dashboard', 'src');
  if (fs.existsSync(dashboardSrc)) {
    try {
      const MAX_FILE_SIZE = 1024 * 1024; // 1MB limit per file
      const MAX_FILES = 500;
      let filesProcessed = 0;

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

      const files = findFiles(dashboardSrc, ['.vue', '.js', '.ts', '.tsx']);
      const flagRegex = /getFeatureFlag\(['"]([\w-]+)['"]\)/g;

      for (const file of files) {
        try {
          const stat = fs.statSync(file);
          if (stat.size > MAX_FILE_SIZE) continue;

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

  const queries = [
    'text ~ "experiment" OR text ~ "A/B test" OR title ~ "EXP:"',
    'text ~ "variant" AND (text ~ "control" OR text ~ "test")',
    'text ~ "hypothesis" AND text ~ "success metrics"'
  ];

  const allPages = new Set();
  const seenIds = new Set();

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

  const extractedPages = [];

  for (const page of allPages) {
    try {
      const extracted = extractPageContent(page);
      if (extracted.has_experiment_content) {
        extractedPages.push(extracted);
      }
    } catch (e) {
      console.log(`    Failed to parse page ${page.id}: ${e.message}`);
    }
  }

  console.log(`  Extracted ${extractedPages.length} pages with experiment content`);

  // Match pages to experiments by feature flag or name
  let matched = 0;
  try {
    const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));

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
  } catch {
    console.log('  No experiment index found - skipping matching');
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
      notes: `${extractedPages.length} experiment pages extracted`
    });
  }

  return { synced: matched, found: extractedPages.length };
}

/**
 * Extract and parse experiment content from a Confluence page
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

  const hasExperiment =
    /experiment|a\/b test|variant|hypothesis|success metric/i.test(title + textContent);

  // Extract feature flags mentioned
  const featureFlagRegex = /[\w-]+[-_](experiment|test|variant|flag)/gi;
  const flagMatches = (title + textContent).match(featureFlagRegex) || [];
  const featureFlags = [...new Set(flagMatches.map(f => f.toLowerCase()))];

  const labels = (page.metadata?.labels?.results || []).map(l => l.name);

  const atlassianUrl = process.env.ATLASSIAN_URL || 'https://YOUR_ORG.atlassian.net';

  return {
    page_id: page.id,
    title,
    url: `${atlassianUrl}/wiki/spaces/${page.space?.key}/pages/${page.id}`,
    space: page.space?.key || 'unknown',
    version: page.version?.number || 1,
    last_updated: page.version?.when || null,
    author: page.version?.by?.displayName || null,
    labels,
    has_experiment_content: hasExperiment,
    text_content: textContent.substring(0, 5000),
    feature_flags: featureFlags,
    matched_experiments: []
  };
}

// ============================================================================
// Source: Transcripts
// ============================================================================

function syncTranscripts(dryRun = false) {
  console.log('\n=== Transcripts ===\n');

  if (!config.sources.transcripts?.enabled) {
    console.log('  [DISABLED]');
    return { synced: 0, found: 0 };
  }

  const basePath = path.resolve(__dirname, '..');
  let totalMentions = 0;
  let filesScanned = 0;

  for (const relPath of config.sources.transcripts.paths || []) {
    const dirPath = path.resolve(basePath, relPath);

    if (!fs.existsSync(dirPath)) {
      console.log(`  Path not found: ${relPath}`);
      continue;
    }

    try {
      const files = fs.readdirSync(dirPath)
        .filter(f => f.endsWith('.md') || f.endsWith('.txt'))
        .sort();

      filesScanned += files.length;

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const content = fs.readFileSync(filePath, 'utf8');

        if (/experiment|a\/b test|variant|feature flag/i.test(content)) {
          totalMentions++;
        }
      }
    } catch (e) {
      console.log(`  Error scanning ${relPath}: ${e.message}`);
    }
  }

  console.log(`  Scanned ${filesScanned} files`);
  console.log(`  Found ${totalMentions} files with experiment mentions`);

  if (!dryRun) {
    updateSources('transcripts', {
      items_found: filesScanned,
      experiment_mentions: totalMentions,
      status: 'synced',
      notes: `${filesScanned} transcripts scanned; ${totalMentions} contain experiment content`
    });
  }

  return { synced: totalMentions, found: filesScanned };
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

async function main() {
  const startTime = Date.now();
  const args = process.argv.slice(2);
  const mode = args.includes('--check') ? 'check' : args.includes('--dry-run') ? 'dry-run' : 'sync';
  trackScript('experiment-sync', { mode });

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Experiment Sync Pipeline

Usage:
  node experiment-sync.cjs                    # Run full sync
  node experiment-sync.cjs --check            # Check staleness
  node experiment-sync.cjs --source <name>    # Sync specific source
  node experiment-sync.cjs --dry-run          # Preview changes

Sources: posthog, ios_code, android_code, dashboard_code, confluence, slack, google_docs, transcripts

Configuration: knowledge/experiments/_sync-config.json
    `);
    return;
  }

  const dryRun = args.includes('--dry-run');

  if (args.includes('--check')) {
    await checkStaleness();
    return;
  }

  const sourceIdx = args.indexOf('--source');
  const specificSource = sourceIdx !== -1 ? args[sourceIdx + 1] : null;

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
  trackComplete('experiment-sync', startTime, { mode });
  await flush();
}

main().catch(async err => {
  trackError('experiment-sync', err, {});
  await flush();
  console.error('Fatal error:', err.message);
  process.exit(1);
});
