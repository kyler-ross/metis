#!/usr/bin/env node
/**
 * Compress Dossier Script
 *
 * Creates a compact version of about-cloaked.md and about-me.md by removing
 * verbose evidence quotes while preserving the facts and confidence levels.
 *
 * Usage: node .ai/scripts/compress-dossier.cjs [--dry-run]
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { track, trackComplete, flush } = require('./lib/telemetry.cjs');

const KNOWLEDGE_DIR = path.join(__dirname, '../knowledge');
const DOSSIER_FILES = ['about-cloaked.md', 'about-me.md'];

/**
 * Remove evidence lines and clean up the markdown
 */
function compressDossier(content) {
  const lines = content.split('\n');
  const compressed = [];
  let skipNext = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip evidence lines (start with "- Evidence:")
    if (line.trim().startsWith('- Evidence:')) {
      continue;
    }

    // Skip empty lines after fact lines (cleanup)
    if (skipNext && line.trim() === '') {
      skipNext = false;
      continue;
    }

    // Keep the line
    compressed.push(line);

    // Mark if this was a fact line (ends with confidence/sources)
    if (line.match(/\(Confidence: \d+%, Sources: \d+\)$/)) {
      skipNext = true;
    }
  }

  // Clean up multiple consecutive blank lines
  let result = compressed.join('\n');
  result = result.replace(/\n{3,}/g, '\n\n');

  return result;
}

/**
 * Process a single dossier file
 */
function processDossier(filename, dryRun = false) {
  const inputPath = path.join(KNOWLEDGE_DIR, filename);
  const outputPath = path.join(KNOWLEDGE_DIR, filename.replace('.md', '-compact.md'));

  if (!fs.existsSync(inputPath)) {
    console.log(`⚠ ${filename} not found, skipping`);
    return null;
  }

  const original = fs.readFileSync(inputPath, 'utf-8');
  const compressed = compressDossier(original);

  const originalLines = original.split('\n').length;
  const compressedLines = compressed.split('\n').length;
  const reduction = Math.round((1 - compressedLines / originalLines) * 100);

  if (dryRun) {
    console.log(`📊 ${filename}: ${originalLines} → ${compressedLines} lines (-${reduction}%)`);
  } else {
    // Add header noting this is a compact version
    const header = `<!--
  COMPACT VERSION - Evidence quotes removed for token efficiency
  Full version with evidence: ${filename}
  Generated: ${new Date().toISOString().split('T')[0]}
-->\n\n`;

    fs.writeFileSync(outputPath, header + compressed);
    console.log(`✓ Created ${path.basename(outputPath)}: ${originalLines} → ${compressedLines} lines (-${reduction}%)`);
  }

  return { original: originalLines, compressed: compressedLines, reduction };
}

// Main
async function main() {
  const startTime = Date.now();
  const dryRun = process.argv.includes('--dry-run');
  track('pm_ai_compress_dossier_start', { dryRun });

  console.log(dryRun ? '🔍 Dry run mode\n' : '📝 Creating compact dossiers\n');

  let totalOriginal = 0;
  let totalCompressed = 0;

  for (const file of DOSSIER_FILES) {
    const result = processDossier(file, dryRun);
    if (result) {
      totalOriginal += result.original;
      totalCompressed += result.compressed;
    }
  }

  const reduction = totalOriginal > 0 ? Math.round((1 - totalCompressed / totalOriginal) * 100) : 0;
  console.log(`\n📈 Total: ${totalOriginal} → ${totalCompressed} lines (-${reduction}%)`);

  if (!dryRun) {
    console.log('\n💡 Tip: Reference *-compact.md files in agents for lower token usage');
  }

  trackComplete('pm_ai_compress_dossier_complete', startTime, {
    dryRun,
    original_lines: totalOriginal,
    compressed_lines: totalCompressed,
    reduction_percent: reduction,
    success: true
  });
  await flush();
}

main();
