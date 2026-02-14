#!/usr/bin/env node
/**
 * Test script to validate key moments indices
 * Checks if all key moment indices point to actual messages
 */

import Database from 'better-sqlite3';
import { homedir } from 'os';
import { join } from 'path';

const dbPath = join(homedir(), '.pm-ai', 'chats.db');
const db = new Database(dbPath);

// Get all sessions with key moments
const sessions = db.prepare(`
  SELECT id, enriched_title, key_moments
  FROM sessions
  WHERE key_moments IS NOT NULL
    AND json_array_length(key_moments) > 0
  LIMIT 20
`).all();

console.log(`Testing ${sessions.length} sessions with key moments...\n`);

let totalMoments = 0;
let validMoments = 0;
let invalidMoments = 0;
let toolCallMoments = 0;
let toolResultMoments = 0;

for (const session of sessions) {
  const keyMoments = JSON.parse(session.key_moments);
  console.log(`\n=== ${session.enriched_title || session.id} ===`);
  console.log(`Key moments: ${keyMoments.length}`);

  for (const moment of keyMoments) {
    totalMoments++;
    const idx = moment.index;

    // Check if this message exists
    const message = db.prepare(`
      SELECT message_index, type, substr(content, 1, 100) as content_preview
      FROM messages
      WHERE session_id = ? AND message_index = ?
    `).get(session.id, idx);

    if (!message) {
      console.log(`  ❌ [MSG ${idx}] MISSING - ${moment.title}`);
      invalidMoments++;
    } else if (message.type === 'tool_use') {
      console.log(`  ⚠️  [MSG ${idx}] TOOL_USE - ${moment.title} (should be USER/ASSISTANT)`);
      toolCallMoments++;
    } else if (message.type === 'tool_result') {
      console.log(`  ⚠️  [MSG ${idx}] TOOL_RESULT - ${moment.title} (should be USER/ASSISTANT)`);
      toolResultMoments++;
    } else {
      console.log(`  ✓  [MSG ${idx}] ${message.type} - ${moment.title}`);
      validMoments++;
    }
  }
}

console.log(`\n\n=== RESULTS ===`);
console.log(`Total key moments: ${totalMoments}`);
console.log(`Valid (USER/ASSISTANT): ${validMoments} (${Math.round(validMoments/totalMoments*100)}%)`);
console.log(`Invalid (missing index): ${invalidMoments} (${Math.round(invalidMoments/totalMoments*100)}%)`);
console.log(`Tool calls: ${toolCallMoments} (${Math.round(toolCallMoments/totalMoments*100)}%)`);
console.log(`Tool results: ${toolResultMoments} (${Math.round(toolResultMoments/totalMoments*100)}%)`);

db.close();
