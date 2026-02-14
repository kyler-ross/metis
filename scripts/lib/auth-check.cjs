/**
 * Auth Check Module
 *
 * Shared module for CLI scripts to check auth status and provide
 * helpful guidance when credentials are missing or misconfigured.
 *
 * Usage:
 *   const { checkAuth, checkAuthFor } = require('./lib/auth-check.cjs');
 *
 *   // Check all required credentials
 *   checkAuth();
 *
 *   // Check specific service(s)
 *   checkAuthFor(['jira', 'slack']);
 */

const fs = require('fs');
const path = require('path');

// Load .env if not already loaded
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

// Import service definitions from shared module
const { SERVICES } = require('./service-definitions.cjs');

/**
 * Check if a service has valid credentials
 */
function checkService(serviceKey) {
  const service = SERVICES[serviceKey];
  if (!service) return { valid: true };

  // Check primary vars
  const missing = service.vars.filter(v => !process.env[v] || process.env[v].includes('your_'));

  // Check alt vars if primary missing
  if (missing.length > 0 && service.altVars) {
    const altPresent = service.altVars.some(v => process.env[v] && !process.env[v].includes('your_'));
    if (altPresent) {
      return { valid: true, service, usingAlt: true };
    }
  }

  // Check if vars exist in shell but not .env (migration candidate)
  const inShellOnly = missing.filter(v => {
    // We can't directly check shell env from here since we're in the same process
    // But we can check if the var exists but looks like a placeholder
    return process.env[v] && process.env[v].includes('your_');
  });

  return {
    valid: missing.length === 0,
    service,
    missing,
    inShellOnly,
  };
}

/**
 * Determine auth status and severity
 */
function getAuthStatus() {
  const envExists = fs.existsSync(envPath);
  const envContent = envExists ? fs.readFileSync(envPath, 'utf8') : '';

  // Check if .env has actual content (not just template)
  const hasRealContent = envContent.includes('=') &&
    !envContent.split('\n').every(line =>
      line.trim().startsWith('#') ||
      line.includes('your_') ||
      line.trim() === ''
    );

  const results = {};
  let missingRequired = [];
  let missingOptional = [];
  let migrationCandidates = [];

  for (const [key, service] of Object.entries(SERVICES)) {
    const check = checkService(key);
    results[key] = check;

    if (!check.valid) {
      if (service.required) {
        missingRequired.push({ key, ...check });
      } else {
        missingOptional.push({ key, ...check });
      }
    }
  }

  // Determine severity
  let severity;
  let action;
  let message;

  if (!envExists) {
    severity = 'critical';
    action = 'setup';
    message = 'No .env file found. Run /pm-setup to configure credentials.';
  } else if (!hasRealContent) {
    severity = 'critical';
    action = 'setup';
    message = '.env file is empty or contains only placeholders. Run /pm-setup to configure credentials.';
  } else if (missingRequired.length > 0) {
    // Check if these might be in shell env (migration candidate)
    const shellVars = missingRequired.flatMap(r => r.missing || []);
    const mightBeInShell = shellVars.some(v => {
      // Heuristic: if env var exists but is placeholder, it's not in shell
      // If env var doesn't exist at all, it might be in shell
      return !process.env[v];
    });

    if (mightBeInShell) {
      severity = 'medium';
      action = 'migrate';
      message = `Missing required credentials in .env. They may be in your shell - run: node .ai/scripts/setup-migrate.cjs`;
    } else {
      severity = 'high';
      action = 'setup';
      message = `Missing required credentials: ${missingRequired.map(r => r.service.name).join(', ')}. Run /pm-setup.`;
    }
  } else if (missingOptional.length > 0) {
    severity = 'low';
    action = 'warn';
    message = `Optional credentials not configured: ${missingOptional.map(r => r.service.name).join(', ')}`;
  } else {
    severity = 'ok';
    action = 'none';
    message = 'All credentials configured.';
  }

  return {
    severity,
    action,
    message,
    envExists,
    hasRealContent,
    results,
    missingRequired,
    missingOptional,
  };
}

/**
 * Check auth and print message if there are issues
 * @param {Object} options
 * @param {boolean} options.silent - Don't print anything
 * @param {boolean} options.exitOnCritical - Exit process on critical issues
 * @param {string[]} options.requiredServices - Only check these services
 * @returns {Object} Auth status
 */
function checkAuth(options = {}) {
  const { silent = false, exitOnCritical = false, requiredServices = null } = options;
  const status = getAuthStatus();

  // If checking specific services, override severity
  // When a script explicitly requires services, ALL of them become required for that script
  if (requiredServices) {
    // Combine both required and optional missing that match requested services
    const allMissing = [...status.missingRequired, ...status.missingOptional]
      .filter(r => requiredServices.includes(r.key));

    if (allMissing.length > 0) {
      // If script explicitly requires these services, treat as high severity
      status.severity = 'high';
      status.action = 'setup';
      status.message = `Missing required credentials for this operation: ${allMissing.map(r => r.service.name).join(', ')}`;
    } else {
      status.severity = 'ok';
    }
  }

  if (!silent && status.severity !== 'ok') {
    printAuthMessage(status);
  }

  if (exitOnCritical && (status.severity === 'critical' || status.severity === 'high')) {
    const err = new Error(status.message);
    err.code = 'AUTH_CRITICAL';
    err.authStatus = status;
    throw err;
  }

  return status;
}

/**
 * Check auth for specific services
 * @param {string[]} services - Service keys to check (e.g., ['jira', 'slack'])
 * @param {Object} options - Same as checkAuth options
 */
function checkAuthFor(services, options = {}) {
  return checkAuth({ ...options, requiredServices: services });
}

/**
 * Print formatted auth message
 */
function printAuthMessage(status) {
  const colors = {
    critical: '\x1b[31m', // red
    high: '\x1b[31m',     // red
    medium: '\x1b[33m',   // yellow
    low: '\x1b[33m',      // yellow
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
  };

  const icons = {
    critical: '🚨',
    high: '❌',
    medium: '⚠️',
    low: 'ℹ️',
  };

  console.error('');
  console.error(`${icons[status.severity]} ${colors[status.severity]}${colors.bold}Auth Issue${colors.reset}`);
  console.error(`${colors.dim}─────────────────────────────────────${colors.reset}`);
  console.error(status.message);
  console.error('');

  if (status.action === 'setup') {
    console.error(`${colors.bold}To fix:${colors.reset} Run /pm-setup in Claude Code or Cursor`);
    console.error(`${colors.dim}Or manually edit: .ai/scripts/.env${colors.reset}`);
  } else if (status.action === 'migrate') {
    console.error(`${colors.bold}To fix:${colors.reset} node .ai/scripts/setup-migrate.cjs`);
    console.error(`${colors.dim}This will import credentials from your shell into .env${colors.reset}`);
  }

  if (status.missingRequired.length > 0) {
    console.error('');
    console.error(`${colors.bold}Missing required:${colors.reset}`);
    for (const r of status.missingRequired) {
      console.error(`  • ${r.service.name}: ${r.missing.join(', ')}`);
      if (r.service.setupUrl) {
        console.error(`    ${colors.dim}${r.service.setupUrl}${colors.reset}`);
      }
    }
  }

  console.error('');
}

/**
 * Quick check if a specific service is configured
 * Returns true/false without printing anything
 */
function isConfigured(serviceKey) {
  return checkService(serviceKey).valid;
}

module.exports = {
  checkAuth,
  checkAuthFor,
  checkService,
  getAuthStatus,
  isConfigured,
  SERVICES,
};
