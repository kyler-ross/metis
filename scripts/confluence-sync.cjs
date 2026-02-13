// PM AI Starter Kit - confluence-sync.cjs
// See scripts/README.md for setup
#!/usr/bin/env node
/**
 * Confluence Sync - Pull Confluence pages into local markdown files
 *
 * Usage:
 *   node confluence-sync.cjs              # Sync all configured pages
 *   node confluence-sync.cjs --check      # Show staleness status
 *   node confluence-sync.cjs --page <id>  # Sync specific page
 *   node confluence-sync.cjs --list       # List configured pages
 */

const fs = require('fs');
const path = require('path');
const { confluence } = require('./lib/confluence-client.cjs');

// Paths - customize these for your project
const CONFIG_PATH = path.join(__dirname, 'config/confluence-sync-config.json');
const MANIFEST_PATH = path.join(__dirname, 'config/confluence-sync-manifest.json');
const KNOWLEDGE_PATH = path.join(__dirname, 'knowledge');

// Staleness threshold (24 hours)
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Convert Confluence storage format (HTML) to clean Markdown
 * Handles tables, lists, headings, links, and code blocks
 */
function htmlToMarkdown(html) {
  if (!html) return '';

  let md = html;

  // Remove Confluence-specific attributes
  md = md.replace(/\s*(ac:|data-|local-id|style)[^=]*="[^"]*"/g, '');
  md = md.replace(/<colgroup>[\s\S]*?<\/colgroup>/g, '');

  // Handle structured macros (status, etc)
  md = md.replace(/<ac:structured-macro[^>]*ac:name="status"[^>]*>[\s\S]*?<ac:parameter[^>]*ac:name="title"[^>]*>([^<]*)<\/ac:parameter>[\s\S]*?<\/ac:structured-macro>/g, '`$1`');
  md = md.replace(/<ac:structured-macro[^>]*>[\s\S]*?<\/ac:structured-macro>/g, '');

  // Handle Confluence links
  md = md.replace(/<ac:link[^>]*>[\s\S]*?<ri:page[^>]*ri:content-title="([^"]*)"[^>]*\/>[\s\S]*?<ac:plain-text-link-body><!\[CDATA\[([^\]]*)\]\]><\/ac:plain-text-link-body>[\s\S]*?<\/ac:link>/g, '[$2]($1)');
  md = md.replace(/<ac:link[^>]*>[\s\S]*?<\/ac:link>/g, '');

  // Headings
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n');
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n');

  // Bold and italic
  md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');

  // Code
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n');

  // Links
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  // Lists
  md = md.replace(/<ul[^>]*>/gi, '\n');
  md = md.replace(/<\/ul>/gi, '\n');
  md = md.replace(/<ol[^>]*>/gi, '\n');
  md = md.replace(/<\/ol>/gi, '\n');
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');

  // Tables - convert to markdown tables
  md = md.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (match, content) => {
    const rows = [];
    const rowMatches = content.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];

    rowMatches.forEach((row, idx) => {
      const cells = [];
      const cellMatches = row.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || [];

      cellMatches.forEach(cell => {
        let cellContent = cell.replace(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi, '$1');
        cellContent = cellContent.replace(/<[^>]+>/g, '').trim();
        cellContent = cellContent.replace(/\n/g, ' ').replace(/\s+/g, ' ');
        cells.push(cellContent);
      });

      if (cells.length > 0) {
        rows.push('| ' + cells.join(' | ') + ' |');
        if (idx === 0) {
          rows.push('| ' + cells.map(() => '---').join(' | ') + ' |');
        }
      }
    });

    return '\n' + rows.join('\n') + '\n';
  });

  // Paragraphs and line breaks
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n');
  md = md.replace(/<br[^>]*\/?>/gi, '\n');

  // Remove remaining HTML tags
  md = md.replace(/<[^>]+>/g, '');

  // Clean up HTML entities
  md = md.replace(/&nbsp;/g, ' ');
  md = md.replace(/&amp;/g, '&');
  md = md.replace(/&lt;/g, '<');
  md = md.replace(/&gt;/g, '>');
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");

  // Clean up whitespace
  md = md.replace(/\n{3,}/g, '\n\n');
  md = md.trim();

  return md;
}

/**
 * Load sync config
 */
function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('Config not found:', CONFIG_PATH);
    console.error('Create config/confluence-sync-config.json with page definitions');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

/**
 * Load or create manifest
 */
function loadManifest() {
  if (fs.existsSync(MANIFEST_PATH)) {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  }
  return { pages: {} };
}

/**
 * Save manifest
 */
function saveManifest(manifest) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

/**
 * Generate YAML frontmatter for synced file
 */
function generateFrontmatter(page, pageData) {
  const baseUrl = process.env.JIRA_BASE_URL || 'https://yourcompany.atlassian.net';
  const lines = [
    '---',
    'source: confluence',
    `page_id: "${page.id}"`,
    `space: "${pageData.space?.key || 'unknown'}"`,
    `title: "${pageData.title}"`,
    `url: "${baseUrl}/wiki/spaces/${pageData.space?.key}/pages/${page.id}"`,
    `synced_at: "${new Date().toISOString()}"`,
    `confluence_version: ${pageData.version?.number || 0}`,
    '---',
    ''
  ];
  return lines.join('\n');
}

/**
 * Sync a single page
 */
async function syncPage(page, manifest) {
  console.log(`\nSyncing: ${page.id}`);

  try {
    const pageData = await confluence.getPage(page.id, ['body.storage', 'version', 'title', 'space']);

    console.log(`  Title: ${pageData.title}`);
    console.log(`  Version: ${pageData.version?.number}`);

    const html = pageData.body?.storage?.value || '';
    const markdown = htmlToMarkdown(html);
    const frontmatter = generateFrontmatter(page, pageData);
    const content = frontmatter + '# ' + pageData.title + '\n\n' + markdown;

    // Ensure directory exists
    const destPath = path.join(process.cwd(), page.destination);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    // Write file
    fs.writeFileSync(destPath, content);
    console.log(`  Saved: ${page.destination}`);

    // Update manifest
    manifest.pages[page.id] = {
      title: pageData.title,
      destination: page.destination,
      synced_at: new Date().toISOString(),
      confluence_version: pageData.version?.number || 0,
      space: pageData.space?.key
    };

    return true;
  } catch (err) {
    console.error(`  Error: ${err.message}`);
    return false;
  }
}

/**
 * Check staleness of all pages
 */
async function checkStaleness(config, manifest) {
  console.log('\nConfluence Sync Status\n' + '='.repeat(50));

  const now = Date.now();
  let hasStale = false;

  for (const page of config.pages) {
    const cached = manifest.pages[page.id];

    if (!cached) {
      console.log(`\n[NOT SYNCED] ${page.id}`);
      console.log(`  Destination: ${page.destination}`);
      hasStale = true;
      continue;
    }

    // Check if file exists
    const destPath = path.join(process.cwd(), page.destination);
    if (!fs.existsSync(destPath)) {
      console.log(`\n[MISSING] ${cached.title}`);
      console.log(`  File not found: ${page.destination}`);
      hasStale = true;
      continue;
    }

    // Check age
    const syncedAt = new Date(cached.synced_at).getTime();
    const ageMs = now - syncedAt;
    const ageHours = Math.round(ageMs / (60 * 60 * 1000));
    const isStale = ageMs > STALE_THRESHOLD_MS;

    // Check Confluence version
    let versionStatus = '';
    try {
      const pageData = await confluence.getPage(page.id, ['version']);
      const currentVersion = pageData.version?.number || 0;
      if (currentVersion > cached.confluence_version) {
        versionStatus = ` (Confluence v${currentVersion} > cached v${cached.confluence_version})`;
        hasStale = true;
      }
    } catch (err) {
      versionStatus = ' (could not check remote version)';
    }

    const status = isStale ? '[STALE]' : '[OK]';
    if (isStale) hasStale = true;

    console.log(`\n${status} ${cached.title}`);
    console.log(`  Page ID: ${page.id}`);
    console.log(`  Synced: ${ageHours}h ago${versionStatus}`);
  }

  console.log('\n' + '='.repeat(50));
  if (hasStale) {
    console.log('Run: node scripts/confluence-sync.cjs');
  } else {
    console.log('All files up to date');
  }
}

/**
 * List configured pages
 */
function listPages(config, manifest) {
  console.log('\nConfigured Confluence Pages\n' + '='.repeat(50));

  for (const page of config.pages) {
    const cached = manifest.pages[page.id];
    console.log(`\nID: ${page.id}`);
    console.log(`  Destination: ${page.destination}`);
    console.log(`  Tags: ${page.tags?.join(', ') || 'none'}`);
    if (cached) {
      console.log(`  Last sync: ${cached.synced_at}`);
      console.log(`  Version: ${cached.confluence_version}`);
    } else {
      console.log(`  Status: Not yet synced`);
    }
  }
}

/**
 * Main
 */
async function main() {
  const args = process.argv.slice(2);

  const config = loadConfig();
  const manifest = loadManifest();

  // Parse args
  if (args.includes('--check')) {
    await checkStaleness(config, manifest);
    return;
  }

  if (args.includes('--list')) {
    listPages(config, manifest);
    return;
  }

  // Sync specific page
  const pageIdx = args.indexOf('--page');
  if (pageIdx !== -1) {
    const pageId = args[pageIdx + 1];
    const page = config.pages.find(p => p.id === pageId);
    if (!page) {
      console.error(`Page ${pageId} not in config`);
      process.exit(1);
    }
    await syncPage(page, manifest);
    saveManifest(manifest);
    return;
  }

  // Sync all pages
  console.log('Confluence Sync');
  console.log('='.repeat(50));

  let success = 0;
  let failed = 0;

  for (const page of config.pages) {
    if (await syncPage(page, manifest)) {
      success++;
    } else {
      failed++;
    }
  }

  saveManifest(manifest);

  console.log('\n' + '='.repeat(50));
  console.log(`Synced: ${success}, Failed: ${failed}`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
