// PM AI Starter Kit - granola-fetch.cjs
#!/usr/bin/env node
/**
 * granola-fetch.cjs - Direct Granola API client for CI/headless environments.
 *
 * Reads auth from ~/Library/Application Support/Granola/supabase.json
 * (same path as granola-mcp-plus) and calls the Granola API directly.
 * This bypasses MCP, which has reliability issues in GitHub Actions.
 *
 * Required: Granola auth token (run granola-auth.cjs login first)
 *
 * Usage:
 *   node granola-fetch.cjs list [--limit N]           List recent documents
 *   node granola-fetch.cjs transcript <document_id>    Get transcript for a meeting
 *   node granola-fetch.cjs document <document_id>      Get document details
 *   node granola-fetch.cjs search <query>              Search documents
 */
'use strict';

const { readFileSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');

const GRANOLA_DIR = join(homedir(), 'Library', 'Application Support', 'Granola');
const API_BASE = 'https://api.granola.ai';

function loadToken() {
  const credsPath = join(GRANOLA_DIR, 'supabase.json');
  const data = JSON.parse(readFileSync(credsPath, 'utf-8'));
  const tokens = JSON.parse(data.workos_tokens);
  return tokens.access_token;
}

function headers(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Accept': '*/*',
    'User-Agent': 'Granola/5.354.0',
    'X-Client-Version': '5.354.0',
  };
}

async function listDocuments(limit = 20) {
  const token = loadToken();
  const resp = await fetch(`${API_BASE}/v2/get-documents`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ limit, offset: 0, include_last_viewed_panel: true }),
  });
  if (!resp.ok) throw new Error(`API error: ${resp.status} ${resp.statusText}`);
  const data = await resp.json();
  return data.docs || [];
}

async function getTranscript(documentId) {
  const token = loadToken();
  const resp = await fetch(`${API_BASE}/v1/get-document-transcript`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ document_id: documentId }),
  });
  if (resp.status === 404) return [];
  if (!resp.ok) throw new Error(`API error: ${resp.status} ${resp.statusText}`);
  return resp.json();
}

async function getDocument(documentId) {
  const token = loadToken();
  const resp = await fetch(`${API_BASE}/v2/get-documents`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ limit: 100, offset: 0, include_last_viewed_panel: true }),
  });
  if (!resp.ok) throw new Error(`API error: ${resp.status} ${resp.statusText}`);
  const data = await resp.json();
  return (data.docs || []).find(d => d.id === documentId) || null;
}

async function searchDocuments(query, limit = 10) {
  const docs = await listDocuments(100);
  const q = query.toLowerCase();
  return docs.filter(d => {
    const title = (d.title || '').toLowerCase();
    const markdown = (d.markdown || '').toLowerCase();
    return title.includes(q) || markdown.includes(q);
  }).slice(0, limit);
}

async function main() {
  const [,, command, ...args] = process.argv;

  if (!command || command === '--help') {
    console.error(`Usage: node granola-fetch.cjs <list|transcript|document|search> [args]

Commands:
  list [--limit N]           List recent Granola documents
  transcript <document_id>    Get full transcript for a meeting
  document <document_id>      Get document details
  search <query>              Search documents by title/content

Examples:
  node scripts/granola-fetch.cjs list --limit 10
  node scripts/granola-fetch.cjs transcript abc-123-def
  node scripts/granola-fetch.cjs search "product review"

Prerequisites:
  Run 'node scripts/granola-auth.cjs login' first to authenticate.
`);
    process.exit(1);
  }

  try {
    switch (command) {
      case 'list': {
        const limitIdx = args.indexOf('--limit');
        const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) || 20 : 20;
        const docs = await listDocuments(limit);
        console.log(JSON.stringify(docs.map(d => ({
          id: d.id,
          title: d.title,
          created_at: d.created_at,
          updated_at: d.updated_at,
          markdown: d.markdown ? d.markdown.substring(0, 500) : null,
        })), null, 2));
        break;
      }
      case 'transcript': {
        if (!args[0]) { console.error('Error: document_id required'); process.exit(1); }
        const transcript = await getTranscript(args[0]);
        console.log(JSON.stringify(transcript, null, 2));
        break;
      }
      case 'document': {
        if (!args[0]) { console.error('Error: document_id required'); process.exit(1); }
        const doc = await getDocument(args[0]);
        console.log(JSON.stringify(doc, null, 2));
        break;
      }
      case 'search': {
        if (!args[0]) { console.error('Error: query required'); process.exit(1); }
        const results = await searchDocuments(args.join(' '));
        console.log(JSON.stringify(results.map(d => ({
          id: d.id,
          title: d.title,
          created_at: d.created_at,
        })), null, 2));
        break;
      }
      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
