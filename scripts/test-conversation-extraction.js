#!/usr/bin/env node
/**
 * Test conversation extraction to verify [MSG X] indices match database
 */

import Database from 'better-sqlite3';
import { homedir } from 'os';
import { join } from 'path';

const dbPath = join(homedir(), '.pm-ai', 'chats.db');
const db = new Database(dbPath);

// Test the first enriched session
const sessionId = 'claude:-Users-kyler-Documents-code-cloaked-pm:291f00ba-a2fa-409f-bea8-56b84b0a285b';

console.log('=== Testing Conversation Extraction ===\n');

// Get all messages in order
const messages = db.prepare(`
  SELECT message_index, type, tool_name, substr(content, 1, 100) as preview
  FROM messages
  WHERE session_id = ?
  ORDER BY message_index ASC
`).all(sessionId);

console.log(`Total messages: ${messages.length}\n`);
console.log('Message breakdown by type:');
console.log('INDEX | TYPE          | PREVIEW');
console.log('------|---------------|--------');

const boilerplatePatterns = [
  /I'm Claude Code/i,
  /I'm ready to help/i,
  /operating in.*mode/i,
  /I understand\. I'm ready/i,
];

function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/<command-message>.*?<\/command-message>/gs, '')
    .replace(/<command-name>.*?<\/command-name>/gs, '')
    .replace(/<command-args>[\s\S]*?<\/command-args>/gs, '')
    .replace(/<local-command-stdout>.*?<\/local-command-stdout>/gs, '')
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gs, '')
    .replace(/^Caveat:.*$/gm, '')
    .trim();
}

let conversationParts = 0;

for (const msg of messages.slice(0, 30)) {
  const skip = [];

  let included = false;
  if (msg.type === 'user') {
    const text = cleanText(msg.preview);
    if (text && text.length > 1) {
      included = true;
      conversationParts++;
    } else {
      skip.push('cleaned to empty');
    }
  } else if (msg.type === 'assistant') {
    const text = cleanText(msg.preview);
    if (text && !boilerplatePatterns.some(p => p.test(text)) && text.length > 20) {
      included = true;
      conversationParts++;
    } else {
      if (!text || text.length <= 20) skip.push('too short');
      if (boilerplatePatterns.some(p => p.test(text))) skip.push('boilerplate');
    }
  } else if (msg.type === 'tool_use') {
    included = true; // ALWAYS included with marker
    conversationParts++;
  } else if (msg.type === 'tool_result') {
    included = true; // ALWAYS included with marker
    conversationParts++;
  }

  const status = included ? '✓ INC' : '✗ SKIP';
  const reason = skip.length > 0 ? ` (${skip.join(', ')})` : '';
  const preview = msg.preview ? msg.preview.substring(0, 50) : msg.tool_name || '(empty)';

  console.log(`${msg.message_index.toString().padStart(5)} | ${(msg.type + (msg.tool_name ? `:${msg.tool_name}` : '')).padEnd(13)} | ${status} ${preview.replace(/\n/g, ' ')}${reason}`);
}

console.log(`\n... (showing first 30 of ${messages.length} total)`);
console.log(`\nConversation parts that would be included: ${conversationParts}`);

// Now check the key moments
const session = db.prepare('SELECT key_moments FROM sessions WHERE id = ?').get(sessionId);
const keyMoments = JSON.parse(session.key_moments);

console.log(`\n=== KEY MOMENTS (${keyMoments.length}) ===`);
for (const moment of keyMoments) {
  const msg = messages.find(m => m.message_index === moment.index);
  if (msg) {
    console.log(`[MSG ${moment.index}] ${msg.type.toUpperCase().padEnd(12)} - ${moment.title}`);
    if (msg.type === 'tool_use' || msg.type === 'tool_result') {
      console.log(`  ⚠️  WARNING: Key moment points to ${msg.type.toUpperCase()}, not USER/ASSISTANT`);
    }
  } else {
    console.log(`[MSG ${moment.index}] ❌ MISSING - ${moment.title}`);
  }
}

db.close();
