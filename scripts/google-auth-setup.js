#!/usr/bin/env node

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const http = require('http');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { run } = require('./lib/script-runner.cjs');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URL = 'http://localhost:3000/oauth2callback';
const TOKEN_PATH = path.join(__dirname, '.google-token.json');

run({
  name: 'google-auth-setup',
  mode: 'operational',
  services: ['google'],
}, async (ctx) => {
  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);

  await new Promise((resolve, reject) => {
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
        server.close();
        resolve();
      } catch (error) {
        res.writeHead(500);
        res.end('Authorization failed. Check the console for details.');
        server.close();
        reject(error);
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
  });
});
