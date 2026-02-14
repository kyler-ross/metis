#!/usr/bin/env node
/**
 * Rebuild enrichment queue with proper UUIDs
 * Fixes issue where jobs had NULL ids
 */

import { getDatabase } from '../tools/lib/analytics-db/sync.js';
import { EnrichmentQueue } from '../services/enrichment-queue.js';
import { randomUUID } from 'crypto';

const db = getDatabase();
const queue = new EnrichmentQueue(db);

console.log('Rebuilding enrichment queue...\n');

// Get all enrichable sessions (2+ messages required for enrichment)
const sessions = db.prepare(`
  SELECT id, source, enriched_at
  FROM sessions
  WHERE message_count >= 2
  ORDER BY source, updated_at DESC
`).all();

console.log(`Found ${sessions.length} enrichable sessions (2+ messages)`);

// Clear existing queue
const deleted = db.prepare('DELETE FROM enrichment_jobs').run();
console.log(`Cleared ${deleted.changes} existing jobs`);

// Enqueue all sessions
let enqueuedCount = 0;
for (const session of sessions) {
  const priority = session.enriched_at ? 10 : 50; // Lower priority for already enriched
  const status = session.enriched_at ? 'completed' : 'pending';

  // Use proper UUID generation
  try {
    const jobId = randomUUID();
    db.prepare(`
      INSERT INTO enrichment_jobs (id, session_id, source, priority, status, completed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(jobId, session.id, session.source, priority, status, session.enriched_at);
    enqueuedCount++;
  } catch (err) {
    console.error(`Failed to enqueue ${session.source}:${session.id}: ${err.message}`);
  }
}

console.log(`Enqueued ${enqueuedCount} jobs\n`);

// Show stats
const stats = db.prepare(`
  SELECT status, COUNT(*) as count
  FROM enrichment_jobs
  GROUP BY status
  ORDER BY
    CASE status
      WHEN 'processing' THEN 1
      WHEN 'pending' THEN 2
      WHEN 'completed' THEN 3
      WHEN 'failed' THEN 4
    END
`).all();

console.log('Queue status:');
for (const stat of stats) {
  console.log(`  ${stat.status}: ${stat.count}`);
}

// Verify no NULL ids
const nullCount = db.prepare(`
  SELECT COUNT(*) as count FROM enrichment_jobs WHERE id IS NULL
`).get();

if (nullCount.count > 0) {
  console.error(`\n❌ ERROR: ${nullCount.count} jobs still have NULL ids!`);
} else {
  console.log('\n✓ All jobs have valid UUIDs');
}

db.close();
