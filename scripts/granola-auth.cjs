// PM AI Starter Kit - granola-auth.cjs
#!/usr/bin/env node
/**
 * granola-auth.cjs - Manage independent Granola API tokens.
 *
 * Creates and maintains a separate auth session from the Granola desktop app,
 * so token refreshes don't conflict with each other.
 *
 * Required environment variables:
 *   None (uses WorkOS OAuth flow)
 *
 * Usage:
 *   node scripts/granola-auth.cjs login     [--user=<id>]  # One-time: authenticate via browser
 *   node scripts/granola-auth.cjs refresh   [--user=<id>]  # Refresh access token (for cron/scheduler)
 *   node scripts/granola-auth.cjs status    [--user=<id>]  # Check token status
 *   node scripts/granola-auth.cjs push-gha  [--user=<id>]  # Refresh + push to GHA secret
 *
 * Tokens stored at: local/granola-tokens-{userId}.json (gitignored)
 */
'use strict';

const { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } = require('fs');
const { join } = require('path');
const { spawnSync, spawn } = require('child_process');
const http = require('http');
const { URL } = require('url');
const crypto = require('crypto');

// WorkOS client configuration for Granola
const CLIENT_ID = 'client_01JZJ0XBDAT8PHJWQY09Y0VD61';
const WORKOS_BASE = 'https://api.workos.com';
const SUPABASE_PATH = join(require('os').homedir(), 'Library', 'Application Support', 'Granola', 'supabase.json');

// Resolve user from --user= flag
const DEFAULT_USER = process.env.PM_AI_DEFAULT_USER || 'default';
function resolveUserId() {
  const userArg = process.argv.find(a => a.startsWith('--user='));
  return userArg ? userArg.split('=')[1] : DEFAULT_USER;
}

const userId = resolveUserId();
const TOKEN_PATH = join(__dirname, '..', 'local', `granola-tokens-${userId}.json`);
const LEGACY_TOKEN_PATH = join(__dirname, '..', 'local', 'granola-tokens.json');

// Detect repo for GHA secret push
function detectRepo() {
  try {
    const result = spawnSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], {
      encoding: 'utf-8',
      timeout: 5000,
    });
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  } catch {}
  return process.env.GITHUB_REPOSITORY || 'your-org/your-repo';
}

const REPO = detectRepo();

// Ensure local/ exists
const localDir = join(__dirname, '..', 'local');
if (!existsSync(localDir)) mkdirSync(localDir, { recursive: true });

function loadTokens() {
  // Try per-user path first, fall back to legacy path for backward compat
  const paths = [TOKEN_PATH];
  if (userId === DEFAULT_USER && !existsSync(TOKEN_PATH) && existsSync(LEGACY_TOKEN_PATH)) {
    paths.push(LEGACY_TOKEN_PATH);
  }
  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      const tokens = JSON.parse(readFileSync(p, 'utf-8'));
      // Migrate legacy token to per-user path
      if (p === LEGACY_TOKEN_PATH && p !== TOKEN_PATH) {
        renameSync(LEGACY_TOKEN_PATH, TOKEN_PATH);
        console.log(`Migrated legacy tokens to ${TOKEN_PATH}`);
      }
      return tokens;
    } catch { continue; }
  }
  return null;
}

function saveTokens(tokens) {
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

function tokenStatus(tokens) {
  if (!tokens) return { valid: false, reason: 'No tokens found' };
  const now = Date.now();
  const expiresAt = (tokens.obtained_at || 0) + (tokens.expires_in || 0) * 1000;
  const remainingMs = expiresAt - now;
  const remainingMin = Math.round(remainingMs / 60000);
  if (remainingMs <= 0) return { valid: false, reason: `Expired ${-remainingMin} minutes ago`, remainingMin };
  return { valid: true, remainingMin };
}

// ============ Login Flow ============

async function loginWithDeviceFlow() {
  console.log('Requesting device authorization...');

  // Try device auth flow first
  const resp = await fetch(`${WORKOS_BASE}/user_management/authorize/device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID }),
  });

  if (resp.ok) {
    const data = await resp.json();
    console.log(`\nOpen this URL in your browser:\n  ${data.verification_uri_complete || data.verification_uri}\n`);
    if (data.user_code) console.log(`Enter code: ${data.user_code}\n`);

    // Open browser automatically
    try { spawn('open', [data.verification_uri_complete || data.verification_uri], { stdio: 'ignore' }); } catch {}

    console.log('Waiting for authorization...');
    const tokens = await pollForTokens(data.device_code, data.expires_in || 300, data.interval || 5);
    return tokens;
  }

  // Fall back to PKCE authorization code flow with local redirect
  console.log('Device flow not available, using PKCE flow...');
  return loginWithPKCE();
}

async function pollForTokens(deviceCode, expiresIn, interval) {
  const deadline = Date.now() + expiresIn * 1000;

  while (Date.now() < deadline) {
    const resp = await fetch(`${WORKOS_BASE}/user_management/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: deviceCode,
        client_id: CLIENT_ID,
      }),
    });

    const data = await resp.json();

    if (resp.ok) {
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in || 21600,
        obtained_at: Date.now(),
        user: data.user,
      };
    }

    if (data.error === 'authorization_pending') {
      await new Promise(r => setTimeout(r, interval * 1000));
    } else if (data.error === 'slow_down') {
      interval += 1;
      await new Promise(r => setTimeout(r, interval * 1000));
    } else {
      throw new Error(`Authorization failed: ${data.error} - ${data.error_description || ''}`);
    }
  }
  throw new Error('Authorization timed out');
}

async function loginWithPKCE() {
  // Generate PKCE code verifier and challenge
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  // Start local HTTP server to receive the callback
  const port = 8742;
  let resolveCode, rejectCode;
  const codePromise = new Promise((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (code) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h2>Authenticated! You can close this tab.</h2><script>window.close()</script>');
      resolveCode(code);
    } else {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(`<h2>Error: ${error || 'No code received'}</h2>`);
      rejectCode(new Error(error || 'No code'));
    }
  });

  server.listen(port);

  const redirectUri = `http://localhost:${port}`;
  const authUrl = `${WORKOS_BASE}/user_management/authorize?` + new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    provider: 'authkit',
  }).toString();

  console.log(`\nOpen this URL in your browser:\n  ${authUrl}\n`);
  try { spawn('open', [authUrl], { stdio: 'ignore' }); } catch {}
  console.log('Waiting for authorization...');

  // Wait for callback
  const code = await Promise.race([
    codePromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out after 5 minutes')), 300000)),
  ]);

  server.close();

  // Exchange code for tokens
  const resp = await fetch(`${WORKOS_BASE}/user_management/authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Token exchange failed: ${resp.status} ${body.substring(0, 200)}`);
  }

  const data = await resp.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in || 21600,
    obtained_at: Date.now(),
    user: data.user,
  };
}

// ============ Refresh Flow ============

async function refreshTokens() {
  const tokens = loadTokens();
  if (!tokens?.refresh_token) throw new Error('No refresh token found. Run: node scripts/granola-auth.cjs login');

  const resp = await fetch(`${WORKOS_BASE}/user_management/authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Token refresh failed (${resp.status}): ${body.substring(0, 200)}. May need to re-login: node scripts/granola-auth.cjs login`);
  }

  const data = await resp.json();
  const updated = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in || 21600,
    obtained_at: Date.now(),
    user: tokens.user,
  };
  saveTokens(updated);
  return updated;
}

// ============ Push to GHA ============

function buildSupabaseJson(tokens) {
  // Build the supabase.json format that granola-fetch.cjs expects
  return JSON.stringify({
    workos_tokens: JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      obtained_at: tokens.obtained_at,
    }),
  });
}

function pushToGHA(tokens) {
  const supabaseJson = buildSupabaseJson(tokens);

  // Merge this user's token into the per-user PM_USER_CREDENTIALS manifest
  const manifestPath = join(__dirname, '..', 'local', 'pm-user-credentials.json');
  let manifest = {};
  try { manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')); } catch {}
  if (!manifest[userId]) manifest[userId] = {};
  manifest[userId].GRANOLA_AUTH_JSON = supabaseJson;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });

  try {
    const result = spawnSync('gh', ['secret', 'set', 'PM_USER_CREDENTIALS', '-R', REPO], {
      input: JSON.stringify(manifest),
      stdio: ['pipe', 'inherit', 'inherit'],
      timeout: 15000,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error('gh secret set failed');
    console.log(`PM_USER_CREDENTIALS secret updated (user: ${userId})`);
  } catch (err) {
    throw new Error(`Failed to push PM_USER_CREDENTIALS to GHA: ${err.message}`);
  }
}

function writeLocalSupabaseJson(tokens) {
  // Only write to shared supabase.json for default user (local Granola desktop app integration)
  if (userId !== DEFAULT_USER) {
    console.log(`Skipping supabase.json write for non-default user ${userId}`);
    return;
  }
  const dir = join(require('os').homedir(), 'Library', 'Application Support', 'Granola');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(SUPABASE_PATH, buildSupabaseJson(tokens), { mode: 0o600 });
}

// ============ Main ============

async function main() {
  const command = process.argv.slice(2).find(a => !a.startsWith('--'));

  switch (command) {
    case 'login': {
      const tokens = await loginWithDeviceFlow();
      saveTokens(tokens);
      writeLocalSupabaseJson(tokens);
      console.log(`\nAuthenticated as ${tokens.user?.email || 'unknown'}`);
      console.log(`Token valid for ${Math.round((tokens.expires_in || 21600) / 60)} minutes`);
      console.log(`Saved to ${TOKEN_PATH}`);
      break;
    }

    case 'refresh': {
      const status = tokenStatus(loadTokens());
      if (status.valid && status.remainingMin > 60) {
        console.log(`Token still valid for ${status.remainingMin} minutes, skipping refresh`);
        return;
      }
      console.log('Refreshing tokens...');
      const tokens = await refreshTokens();
      writeLocalSupabaseJson(tokens);
      const newStatus = tokenStatus(tokens);
      console.log(`Token refreshed, valid for ${newStatus.remainingMin} minutes`);
      break;
    }

    case 'status': {
      const tokens = loadTokens();
      const status = tokenStatus(tokens);
      if (status.valid) {
        console.log(`Token valid for ${status.remainingMin} more minutes`);
        console.log(`User: ${tokens?.user?.email || 'unknown'}`);
      } else {
        console.log(`Token invalid: ${status.reason}`);
        console.log('Run: node scripts/granola-auth.cjs login');
      }
      break;
    }

    case 'push-gha': {
      let tokens = loadTokens();
      const status = tokenStatus(tokens);

      // Refresh if expired or expiring within 60 minutes
      if (!status.valid || status.remainingMin < 60) {
        console.log('Refreshing tokens before push...');
        tokens = await refreshTokens();
        writeLocalSupabaseJson(tokens);
      }

      const newStatus = tokenStatus(tokens);
      console.log(`Token valid for ${newStatus.remainingMin} minutes`);
      pushToGHA(tokens);
      break;
    }

    default:
      console.error(`Usage: node granola-auth.cjs <login|refresh|status|push-gha> [--user=<id>]

Commands:
  login      Authenticate via browser (one-time setup)
  refresh    Refresh access token (for cron/scheduler)
  status     Check token status
  push-gha   Refresh + push to GitHub Actions secret

Options:
  --user=<id>   Specify user ID (default: ${DEFAULT_USER})
`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
