#!/usr/bin/env node
/**
 * Slack to GitHub Migration Script
 * 
 * Migrates useful Slack import pages from Confluence to GitHub.
 * Filters out short comments and keeps substantive updates.
 */

const { confluence } = require('./atlassian-api');
const fs = require('fs').promises;
const path = require('path');

// Simple HTML to Markdown converter
function htmlToMarkdown(html) {
  if (!html) return '';
  
  return html
    // Headers
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
    // Lists
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<\/?[uo]l[^>]*>/gi, '\n')
    // Bold/Italic
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
    // Links
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    // Paragraphs and breaks
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // Code
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    .replace(/<pre[^>]*>(.*?)<\/pre>/gi, '```\n$1\n```\n')
    // Remove remaining tags
    .replace(/<[^>]+>/g, '')
    // Clean up entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    // Clean up whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const OUTPUT_DIR = path.join(__dirname, '../updates');
const WORK_DIR = path.join(__dirname, '../work/slack-migration');
const CLASSIFICATION_FILE = path.join(__dirname, '../work/confluence-migration/classification-results.json');
const REPORT_FILE = path.join(WORK_DIR, 'slack-migration-report.json');
const LOG_FILE = path.join(WORK_DIR, 'slack-migration-log.json');

async function fetchAllSlackPages() {
  console.log('Loading Slack imports from classification data...');
  
  // Load classification results
  const classificationData = JSON.parse(await fs.readFile(CLASSIFICATION_FILE, 'utf8'));
  
  // Filter to Slack Import type only
  const slackPages = classificationData.filter(p => p.type === 'Slack Import');
  console.log(`  Found ${slackPages.length} Slack imports in classification data`);
  
  // Fetch full content from Confluence for substantive ones (>200 chars)
  const substantiveIds = slackPages.filter(p => p.charCount > 200).map(p => p.id);
  console.log(`  ${substantiveIds.length} are substantive (>200 chars)`);
  
  const allPages = [];
  for (let i = 0; i < substantiveIds.length; i++) {
    try {
      const page = await confluence.getPage(substantiveIds[i]);
      allPages.push(page);
      if ((i + 1) % 10 === 0) {
        console.log(`  Fetched ${i + 1}/${substantiveIds.length} pages...`);
      }
    } catch (error) {
      console.error(`  Error fetching page ${substantiveIds[i]}: ${error.message}`);
    }
  }
  
  console.log(`  Fetched ${allPages.length} pages total`);
  return allPages;
}

function analyzePages(pages) {
  const substantivePages = [];
  const commentPages = [];
  
  for (const page of pages) {
    const content = page.body?.storage?.value || '';
    const markdown = htmlToMarkdown(content);
    const wordCount = markdown.split(/\s+/).filter(Boolean).length;
    
    // Substantive = more than 30 words OR has structure (headers, lists)
    const hasStructure = /(^#+\s|\n- |\n\* |\n\d+\. )/m.test(markdown);
    
    // Parse author and date from title like "From Lucas Weiner on 2025-09-02T13:58:20.000Z"
    const titleMatch = page.title.match(/^From (.+?) on (\d{4}-\d{2}-\d{2}T[\d:.]+Z?)$/);
    const author = titleMatch ? titleMatch[1] : (page.version?.by?.displayName || 'Unknown');
    const createdDate = titleMatch ? titleMatch[2] : (page.version?.when || new Date().toISOString());
    
    const pageInfo = {
      id: page.id,
      title: page.title,
      author,
      createdDate,
      wordCount,
      markdown,
      url: `${process.env.ATLASSIAN_URL}/wiki/spaces/PM/pages/${page.id}`
    };
    
    if (wordCount > 30 || hasStructure) {
      substantivePages.push(pageInfo);
    } else {
      commentPages.push({
        ...pageInfo,
        reason: wordCount <= 30 ? 'Too short' : 'No structure'
      });
    }
  }
  
  return { substantivePages, commentPages };
}

async function migratePages(pages, dryRun = true) {
  const migrationLog = [];
  
  console.log(`\n=== ${dryRun ? 'DRY RUN' : 'MIGRATING'} ===\n`);
  
  if (!dryRun) {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
  }
  
  const usedPaths = new Set();
  
  for (const page of pages) {
    const date = new Date(page.createdDate);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const authorSlug = page.author.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    
    let filename = `${year}-${month}-${day}-${authorSlug}.md`;
    const dir = path.join(OUTPUT_DIR, String(year), month);
    let filePath = path.join(dir, filename);
    
    // Handle duplicates
    let counter = 0;
    while (usedPaths.has(filePath)) {
      counter++;
      filename = `${year}-${month}-${day}-${authorSlug}-${Date.now() + counter}.md`;
      filePath = path.join(dir, filename);
    }
    usedPaths.add(filePath);
    
    // Create markdown with frontmatter
    const content = `---
title: "${page.title.replace(/"/g, '\\"')}"
author: ${page.author}
date: ${page.createdDate}
source: confluence
page_id: ${page.id}
---

${page.markdown}
`;
    
    if (dryRun) {
      console.log(`  ${path.relative(OUTPUT_DIR, filePath)}`);
    } else {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, content);
      console.log(`✅ ${path.relative(OUTPUT_DIR, filePath)}`);
    }
    
    migrationLog.push({
      pageId: page.id,
      title: page.title,
      confluenceUrl: page.url,
      githubPath: path.relative(OUTPUT_DIR, filePath),
      status: dryRun ? 'dry_run' : 'migrated',
      timestamp: new Date().toISOString()
    });
  }
  
  return migrationLog;
}

async function main() {
  await fs.mkdir(WORK_DIR, { recursive: true });
  
  const allPages = await fetchAllSlackPages();
  console.log(`\nFound ${allPages.length} Slack import pages\n`);
  
  const { substantivePages, commentPages } = analyzePages(allPages);
  
  console.log('=== ANALYSIS ===\n');
  console.log(`Total pages: ${allPages.length}`);
  console.log(`Substantive (will migrate): ${substantivePages.length}`);
  console.log(`Comments (will skip): ${commentPages.length}\n`);
  
  // Save report
  const report = {
    total: allPages.length,
    substantive: substantivePages.length,
    comments: commentPages.length,
    substantivePages: substantivePages.map(p => ({
      id: p.id, title: p.title, author: p.author, 
      createdDate: p.createdDate, wordCount: p.wordCount, url: p.url
    })),
    commentPages: commentPages.map(p => ({
      id: p.id, title: p.title, author: p.author,
      createdDate: p.createdDate, wordCount: p.wordCount, reason: p.reason, url: p.url
    }))
  };
  await fs.writeFile(REPORT_FILE, JSON.stringify(report, null, 2));
  console.log(`Report saved: ${REPORT_FILE}\n`);
  
  // Run migration
  if (process.argv.includes('--migrate')) {
    const log = await migratePages(substantivePages, false);
    await fs.writeFile(LOG_FILE, JSON.stringify(log, null, 2));
    console.log(`\nMigration log: ${LOG_FILE}`);
  } else if (process.argv.includes('--dry-run')) {
    await migratePages(substantivePages, true);
  } else {
    console.log('Usage:');
    console.log('  node slack-to-github.js --dry-run   Preview migration');
    console.log('  node slack-to-github.js --migrate   Execute migration');
  }
}

main().catch(console.error);

