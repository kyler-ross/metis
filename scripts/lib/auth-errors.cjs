/**
 * Auth Error Helper
 *
 * Provides consistent error messages and recovery suggestions
 * for authentication failures across all CLI scripts.
 *
 * Usage:
 *   const { handleAuthError, checkCredentials } = require('./lib/auth-errors.cjs');
 *
 *   // Check before making API calls
 *   const creds = checkCredentials(['JIRA_API_KEY', 'ATLASSIAN_EMAIL'], 'Jira');
 *   if (!creds.ok) {
 *     console.error(creds.message);
 *     process.exit(1);
 *   }
 *
 *   // Handle API errors
 *   catch (err) {
 *     handleAuthError(err, 'Jira');
 *   }
 */

const fs = require('fs');
const path = require('path');

// Integration metadata for helpful error messages
const INTEGRATIONS = {
  jira: {
    name: 'Jira',
    keys: ['ATLASSIAN_EMAIL', 'JIRA_API_KEY'],
    docs: 'https://id.atlassian.com/manage-profile/security/api-tokens',
    setupCmd: 'node .ai/scripts/setup-wizard.cjs run credentials'
  },
  confluence: {
    name: 'Confluence',
    keys: ['ATLASSIAN_EMAIL', 'JIRA_API_KEY'],
    docs: 'https://id.atlassian.com/manage-profile/security/api-tokens',
    setupCmd: 'node .ai/scripts/setup-wizard.cjs run credentials'
  },
  google: {
    name: 'Google Sheets/Drive',
    keys: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    docs: 'https://console.cloud.google.com/apis/credentials',
    setupCmd: 'node .ai/scripts/google-auth-setup.cjs'
  },
  slack: {
    name: 'Slack',
    keys: ['SLACK_BOT_TOKEN'],
    docs: 'https://api.slack.com/apps',
    setupCmd: 'node .ai/scripts/setup-wizard.cjs run credentials'
  },
  gemini: {
    name: 'Gemini',
    keys: ['GEMINI_API_KEY'],
    docs: 'https://aistudio.google.com/apikey',
    setupCmd: 'node .ai/scripts/setup-wizard.cjs run credentials'
  },
  github: {
    name: 'GitHub',
    keys: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
    docs: 'https://github.com/settings/tokens',
    setupCmd: 'node .ai/scripts/setup-wizard.cjs run credentials'
  },
  posthog: {
    name: 'PostHog',
    keys: ['POSTHOG_API_KEY'],
    docs: 'https://posthog.com/docs/api',
    setupCmd: 'Check MCP config: .claude/mcp.json'
  },
  dovetail: {
    name: 'Dovetail',
    keys: ['DOVETAIL_API_TOKEN'],
    docs: 'https://dovetail.com/help/api',
    setupCmd: 'node .ai/scripts/setup-wizard.cjs run credentials'
  },
  anthropic: {
    name: 'Anthropic',
    keys: ['ANTHROPIC_API_KEY'],
    docs: 'https://console.anthropic.com/settings/keys',
    setupCmd: 'node .ai/scripts/setup-wizard.cjs run credentials'
  }
};

/**
 * Load .env file and return parsed values
 * Delegates to env-guard for CRLF-safe parsing.
 */
function loadEnv() {
  const { parseEnvFile, findEnvFile } = require('./env-guard.cjs');
  return parseEnvFile(findEnvFile()).vars;
}

/**
 * Check if required credentials are present
 *
 * @param {string[]} keys - Required environment variable names
 * @param {string} service - Service name for error messages (e.g., 'jira', 'google')
 * @returns {{ ok: boolean, message?: string, missing?: string[] }}
 */
function checkCredentials(keys, service) {
  const serviceLower = service.toLowerCase();
  const config = INTEGRATIONS[serviceLower] || { name: service, docs: '', setupCmd: '' };

  // Check process.env first, then .env file
  const env = { ...loadEnv(), ...process.env };

  const missing = keys.filter(k => !env[k] || env[k].length === 0);

  if (missing.length === 0) {
    return { ok: true };
  }

  const message = formatMissingCredentialsError(config, missing);
  return { ok: false, message, missing };
}

/**
 * Format a helpful error message for missing credentials
 */
function formatMissingCredentialsError(config, missing) {
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ ${config.name} Authentication Failed

Missing credentials: ${missing.join(', ')}

Quick fix options:

  1. Run diagnostics:
     /pm-setup-doctor

  2. Add credentials to .ai/scripts/.env:
     ${missing.map(k => `${k}=your-value-here`).join('\n     ')}

  3. Get credentials:
     ${config.docs}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`.trim();
}

/**
 * Handle an API error with helpful recovery suggestions
 *
 * @param {Error} error - The error object
 * @param {string} service - Service name
 * @param {Object} options - Additional options
 */
function handleAuthError(error, service, options = {}) {
  const serviceLower = service.toLowerCase();
  const config = INTEGRATIONS[serviceLower] || { name: service, docs: '' };

  const statusCode = error.response?.status || error.statusCode || error.code;
  const message = error.message || String(error);

  let errorType = 'unknown';
  let suggestion = '';

  // Detect error type
  if (statusCode === 401 || message.includes('401') || message.includes('Unauthorized')) {
    errorType = 'invalid_credentials';
    suggestion = 'Your API key/token is invalid or expired. Get a new one.';
  } else if (statusCode === 403 || message.includes('403') || message.includes('Forbidden')) {
    errorType = 'insufficient_permissions';
    suggestion = 'Your credentials lack required permissions. Check scopes/roles.';
  } else if (statusCode === 404 || message.includes('404')) {
    errorType = 'not_found';
    suggestion = 'Resource not found. Check the ID/path is correct.';
  } else if (statusCode === 429 || message.includes('429') || message.includes('rate')) {
    errorType = 'rate_limited';
    suggestion = 'Rate limited. Wait a moment and try again.';
  } else if (message.includes('ENOTFOUND') || message.includes('ECONNREFUSED')) {
    errorType = 'network';
    suggestion = 'Network error. Check your internet connection.';
  } else if (message.includes('token') || message.includes('credential') || message.includes('auth')) {
    errorType = 'auth_generic';
    suggestion = 'Authentication issue. Run /pm-setup-doctor to diagnose.';
  }

  const output = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ ${config.name} API Error

Error: ${message}
Type: ${errorType}

${suggestion}

Recovery options:

  1. Run diagnostics: /pm-setup-doctor
  2. Check credentials: ${(config.keys || []).map(k => k).join(', ') || serviceLower.toUpperCase() + '_API_KEY'} in .ai/scripts/.env
  3. Get new credentials: ${config.docs}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`.trim();

  console.error(output);

  // NOTE: Default is NOT to exit. Callers must pass { exit: true } explicitly.
  // This was intentionally changed from `exit !== false` (default-exit) to
  // `exit === true` (opt-in exit) so that callers like withAuthErrorHandling()
  // can log the error and re-throw without killing the process.
  if (options.exit === true) {
    throw new Error(`${config.name} API error: ${message} (${errorType})`);
  }

  return { errorType, suggestion };
}

/**
 * Wrap an async function with auth error handling
 *
 * @param {Function} fn - Async function to wrap
 * @param {string} service - Service name
 * @returns {Function} Wrapped function
 */
function withAuthErrorHandling(fn, service) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      handleAuthError(error, service);
      throw error;
    }
  };
}

module.exports = {
  checkCredentials,
  handleAuthError,
  withAuthErrorHandling,
  loadEnv,
  INTEGRATIONS
};
