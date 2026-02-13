#!/usr/bin/env node
// PM AI Starter Kit - Google Auth Setup
// See scripts/README.md for setup instructions
//
// Runs a local OAuth2 flow to get Google API credentials.
// Required env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
//
// Usage:
//   node google-auth-setup.js

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const http = require('http');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URL = 'http://localhost:3000/oauth2callback';
const TOKEN_PATH = path.join(__dirname, '.google-token.json');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('ERROR: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in scripts/.env');
  console.error('See scripts/README.md for Google Cloud Console setup instructions.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);

// Start local server to capture the auth code
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URL);
  const code = url.searchParams.get('code');

  if (!code) {
    res.writeHead(400);
    res.end('No authorization code received');
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens), { mode: 0o600 });

    res.writeHead(200);
    res.end('Authorization successful! You can close this window. Token saved.');

    console.log('Token saved to:', TOKEN_PATH);
    process.exit(0);
  } catch (error) {
    res.writeHead(500);
    res.end('Authorization failed. Check the console for details.');
    console.error('OAuth error:', error.message);
    process.exit(1);
  }
});

server.listen(3000, () => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/docs', 'https://www.googleapis.com/auth/drive']
  });

  console.log('Opening browser for authorization...');
  console.log('Auth URL:', authUrl);

  require('child_process').spawn('open', [authUrl], { stdio: 'ignore' });
});
