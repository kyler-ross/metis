#!/usr/bin/env node
/**
 * granola-fetch.cjs - Direct Granola API client for CI/headless environments.
 *
 * Reads auth from ~/Library/Application Support/Granola/supabase.json
 * (same path as granola-mcp-plus) and calls the Granola API directly.
 * This bypasses MCP, which has reliability issues in GitHub Actions.
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

const { run } = require('./lib/script-runner.cjs');

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

run({
  name: 'granola-fetch',
  mode: 'operational',
  services: ['granola'],
}, async (ctx) => {
  const command = ctx.args.positional[0];
  const restArgs = ctx.args.positional.slice(1);

  if (!command || command === '--help') {
    console.error('Usage: node granola-fetch.cjs <list|transcript|document|search> [args]');
    throw new Error('No command specified');
  }

  switch (command) {
    case 'list': {
      const limitFlag = ctx.args.flags.limit;
      const limit = limitFlag ? parseInt(limitFlag) || 20 : 20;
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
      if (!restArgs[0]) { throw new Error('Error: document_id required'); }
      const transcript = await getTranscript(restArgs[0]);
      console.log(JSON.stringify(transcript, null, 2));
      break;
    }
    case 'document': {
      if (!restArgs[0]) { throw new Error('Error: document_id required'); }
      const doc = await getDocument(restArgs[0]);
      console.log(JSON.stringify(doc, null, 2));
      break;
    }
    case 'search': {
      if (!restArgs[0]) { throw new Error('Error: query required'); }
      const results = await searchDocuments(restArgs.join(' '));
      console.log(JSON.stringify(results.map(d => ({
        id: d.id,
        title: d.title,
        created_at: d.created_at,
      })), null, 2));
      break;
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
});
