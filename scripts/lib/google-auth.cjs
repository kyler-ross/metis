// PM AI Starter Kit - Google Auth Library (Multi-Account)
// See scripts/README.md for setup instructions
//
// Unified OAuth2 authentication for all Google services.
// Supports multiple accounts with per-account token storage.

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');

// Load environment variables from scripts/.env
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Configuration from environment (loaded after dotenv)
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const TOKENS_DIR = path.join(__dirname, '../.google-tokens');
const ACCOUNTS_FILE = path.join(__dirname, '../.google-accounts.json');
const LEGACY_TOKEN_PATH = path.join(__dirname, '../.google-suite-token.json');
const LEGACY_SHEETS_TOKEN = path.join(__dirname, '../.google-sheets-token.json');
const REDIRECT_URL = 'http://localhost:3001/oauth2callback';

// Current account context (can be set per-request)
let currentAccount = null;

// All scopes for Google Suite access
const SCOPES = [
  'https://www.googleapis.com/auth/drive',           // Drive full access
  'https://www.googleapis.com/auth/spreadsheets',    // Sheets read/write
  'https://www.googleapis.com/auth/presentations',   // Slides read/write
  'https://www.googleapis.com/auth/documents',       // Docs read/write
  'https://www.googleapis.com/auth/calendar',        // Calendar full access (CRUD, freebusy)
  'https://www.googleapis.com/auth/gmail.modify',    // Gmail read/send/modify (not full access)
  'https://www.googleapis.com/auth/gmail.settings.basic' // Gmail settings (filters, labels)
];

/**
 * Check credentials are set
 */
function checkCredentials() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in environment.\n' +
      'Add to scripts/.env:\n' +
      '  GOOGLE_CLIENT_ID=your-client-id\n' +
      '  GOOGLE_CLIENT_SECRET=your-client-secret'
    );
  }
}

/**
 * Ensure tokens directory exists
 */
function ensureTokensDir() {
  if (!fs.existsSync(TOKENS_DIR)) {
    fs.mkdirSync(TOKENS_DIR, { recursive: true });
  }
}

/**
 * Get token path for a specific account
 */
function getTokenPathForAccount(email) {
  ensureTokensDir();
  const safeEmail = email.replace(/[^a-zA-Z0-9@.-]/g, '_');
  return path.join(TOKENS_DIR, `${safeEmail}.json`);
}

/**
 * Load accounts config
 */
function loadAccounts() {
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    return { default: null, accounts: [] };
  }
  return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8'));
}

/**
 * Save accounts config
 */
function saveAccounts(config) {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(config, null, 2));
}

/**
 * List all configured accounts
 */
function listAccounts() {
  const config = loadAccounts();
  return {
    default: config.default,
    accounts: config.accounts || []
  };
}

/**
 * Set the default account
 */
function setDefaultAccount(email) {
  const config = loadAccounts();
  if (!config.accounts.includes(email)) {
    throw new Error(`Account ${email} not found. Add it first with addAccount().`);
  }
  config.default = email;
  saveAccounts(config);
}

/**
 * Set current account for this session
 */
function setCurrentAccount(email) {
  currentAccount = email;
}

/**
 * Get current account (session > default > first available)
 */
function getCurrentAccount() {
  if (currentAccount) return currentAccount;
  const config = loadAccounts();
  if (config.default) return config.default;
  if (config.accounts && config.accounts.length > 0) return config.accounts[0];
  return null;
}

/**
 * Migrate legacy token to new multi-account system
 */
function migrateLegacyToken() {
  // Check for legacy unified token
  if (fs.existsSync(LEGACY_TOKEN_PATH)) {
    ensureTokensDir();
    const token = JSON.parse(fs.readFileSync(LEGACY_TOKEN_PATH, 'utf-8'));

    // We need to get the email from the token - do a test API call
    // For now, use a placeholder that will be updated on first use
    const email = 'default@migrated';
    const newPath = getTokenPathForAccount(email);

    if (!fs.existsSync(newPath)) {
      fs.writeFileSync(newPath, JSON.stringify(token));

      // Update accounts config
      const config = loadAccounts();
      if (!config.accounts.includes(email)) {
        config.accounts.push(email);
      }
      if (!config.default) {
        config.default = email;
      }
      saveAccounts(config);

      console.log('Migrated legacy token to multi-account system');
    }
    return true;
  }
  return false;
}

/**
 * Create OAuth2 client
 */
function createOAuth2Client() {
  checkCredentials();
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);
}

/**
 * Get authorized OAuth2 client for an account
 * Will open browser for authorization if no valid token exists
 *
 * @param {Object|string} options - Options object or account email string
 * @param {string} options.account - Account email to use
 * @param {boolean} options.forceReauth - Force re-authorization even if token exists
 * @returns {Promise<OAuth2Client>} Authorized client
 */
async function getAuthClient(options = {}) {
  // Handle string argument as account email
  if (typeof options === 'string') {
    options = { account: options };
  }

  // Migrate legacy tokens if needed
  migrateLegacyToken();

  const oauth2Client = createOAuth2Client();
  const account = options.account || getCurrentAccount();
  const tokenPath = account ? getTokenPathForAccount(account) : LEGACY_TOKEN_PATH;

  // Check if token exists and is valid
  if (!options.forceReauth && fs.existsSync(tokenPath)) {
    const token = JSON.parse(fs.readFileSync(tokenPath));
    oauth2Client.setCredentials(token);

    // Check if token is expired
    if (token.expiry_date && token.expiry_date > Date.now()) {
      return oauth2Client;
    }

    // Try to refresh if we have a refresh token
    if (token.refresh_token) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);
        fs.writeFileSync(tokenPath, JSON.stringify(credentials));
        return oauth2Client;
      } catch (err) {
        console.log('Token refresh failed, re-authorizing...');
      }
    }
  }

  // If we have no account specified, do the OAuth flow and detect the email
  return addAccount();
}

/**
 * Add a new account via OAuth flow
 * Returns the authorized client and saves the account
 *
 * @returns {Promise<{client: OAuth2Client, email: string}>}
 */
async function addAccount() {
  const oauth2Client = createOAuth2Client();

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, `http://localhost:3001`);
        const code = url.searchParams.get('code');

        if (!code) {
          res.writeHead(400);
          res.end('No authorization code received');
          return;
        }

        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // Get the user's email address
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();
        const email = userInfo.data.email;

        // Save token for this account
        ensureTokensDir();
        const tokenPath = getTokenPathForAccount(email);
        fs.writeFileSync(tokenPath, JSON.stringify(tokens));

        // Update accounts config
        const config = loadAccounts();
        if (!config.accounts.includes(email)) {
          config.accounts.push(email);
        }
        if (!config.default) {
          config.default = email;
        }
        saveAccounts(config);

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
              <h1>Account Added Successfully!</h1>
              <p><strong>${email}</strong></p>
              <p>Access granted for: Sheets, Drive, Slides, Docs, Gmail, Calendar</p>
              <p>You can close this window and return to the terminal.</p>
            </body>
          </html>
        `);

        server.close();
        resolve({ client: oauth2Client, email });
      } catch (error) {
        res.writeHead(500);
        res.end('Error: ' + error.message);
        server.close();
        reject(error);
      }
    });

    server.listen(3001, () => {
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [...SCOPES, 'https://www.googleapis.com/auth/userinfo.email']
      });

      console.log('\nOpening browser for Google account authorization...');
      console.log('Requesting access to: Sheets, Drive, Slides, Docs, Gmail, Calendar\n');
      require('child_process').exec(`open "${authUrl}"`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error('Port 3001 is in use. Close other applications using it and retry.'));
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Remove an account
 */
function removeAccount(email) {
  const config = loadAccounts();
  config.accounts = config.accounts.filter(a => a !== email);
  if (config.default === email) {
    config.default = config.accounts[0] || null;
  }
  saveAccounts(config);

  // Remove token file
  const tokenPath = getTokenPathForAccount(email);
  if (fs.existsSync(tokenPath)) {
    fs.unlinkSync(tokenPath);
  }
}

/**
 * Check if we have valid authentication for an account
 * @param {string} account - Account email (optional, uses current/default)
 * @returns {boolean} True if valid token exists
 */
function hasValidToken(account) {
  const email = account || getCurrentAccount();
  if (!email) return false;

  const tokenPath = getTokenPathForAccount(email);
  if (!fs.existsSync(tokenPath)) {
    return false;
  }

  try {
    const token = JSON.parse(fs.readFileSync(tokenPath));
    if (token.expiry_date && token.expiry_date < Date.now() + 300000) {
      return !!token.refresh_token;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the token file path for an account
 * @param {string} account - Account email (optional)
 * @returns {string} Path to token file
 */
function getTokenPath(account) {
  const email = account || getCurrentAccount();
  return email ? getTokenPathForAccount(email) : LEGACY_TOKEN_PATH;
}

/**
 * Delete stored token for an account
 * @param {string} account - Account email (optional)
 */
function clearToken(account) {
  const tokenPath = getTokenPath(account);
  if (fs.existsSync(tokenPath)) {
    fs.unlinkSync(tokenPath);
  }
}

module.exports = {
  // Auth
  getAuthClient,
  addAccount,
  removeAccount,

  // Account management
  listAccounts,
  setDefaultAccount,
  setCurrentAccount,
  getCurrentAccount,

  // Token utilities
  hasValidToken,
  getTokenPath,
  clearToken,

  // Constants
  SCOPES
};
