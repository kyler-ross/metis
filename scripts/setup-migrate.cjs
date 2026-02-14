#!/usr/bin/env node
/**
 * PM AI Auth Migration Script
 *
 * Migrates credentials from shell environment into .env file.
 * Run this if you have credentials in your .zshrc/.bashrc that
 * should be centralized in .env.
 *
 * Usage:
 *   node .ai/scripts/setup-migrate.cjs
 *   node .ai/scripts/setup-migrate.cjs --dry-run
 *   node .ai/scripts/setup-migrate.cjs --force
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const { run } = require('./lib/script-runner.cjs');
const { track } = require('./lib/telemetry.cjs');

const ENV_PATH = path.join(__dirname, '.env');
const ENV_EXAMPLE_PATH = path.join(__dirname, '.env.example');

// All known credential variables
const KNOWN_VARS = {
  // Google
  GOOGLE_CLIENT_ID: { section: 'Google OAuth', required: true },
  GOOGLE_CLIENT_SECRET: { section: 'Google OAuth', required: true },
  GOOGLE_API_KEY: { section: 'Google API', required: false },

  // Gemini
  GEMINI_API_KEY: { section: 'Gemini AI', required: true },

  // GitHub
  GITHUB_PERSONAL_ACCESS_TOKEN: { section: 'GitHub', required: true },

  // Jira/Confluence
  ATLASSIAN_URL: { section: 'Jira/Confluence', required: true },
  ATLASSIAN_EMAIL: { section: 'Jira/Confluence', required: true },
  ATLASSIAN_API_TOKEN: { section: 'Jira/Confluence', required: true },
  JIRA_INSTANCE_URL: { section: 'Jira/Confluence', required: false, alias: 'ATLASSIAN_URL' },
  JIRA_USER_EMAIL: { section: 'Jira/Confluence', required: false, alias: 'ATLASSIAN_EMAIL' },
  JIRA_API_KEY: { section: 'Jira/Confluence', required: false, alias: 'ATLASSIAN_API_TOKEN' },

  // Slack
  SLACK_BOT_TOKEN: { section: 'Slack', required: false },

  // PostHog
  POSTHOG_API_KEY: { section: 'PostHog', required: false },

  // Figma
  FIGMA_PERSONAL_ACCESS_TOKEN: { section: 'Figma', required: false },

  // Datadog
  DD_API_KEY: { section: 'Datadog', required: false },
  DD_APP_KEY: { section: 'Datadog', required: false },

  // Dovetail
  DOVETAIL_API_TOKEN: { section: 'Dovetail', required: false },

  // Anthropic
  ANTHROPIC_API_KEY: { section: 'Anthropic', required: false },
};

const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

function log(msg) {
  console.log(msg);
}

function success(msg) {
  console.log(`${colors.green}✓${colors.reset} ${msg}`);
}

function warn(msg) {
  console.log(`${colors.yellow}⚠${colors.reset} ${msg}`);
}

function error(msg) {
  console.log(`${colors.red}✗${colors.reset} ${msg}`);
}

function info(msg) {
  console.log(`${colors.blue}ℹ${colors.reset} ${msg}`);
}

/**
 * Parse .env file into object
 */
function parseEnvFile(content) {
  const result = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) {
      let value = match[2];
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      result[match[1]] = value;
    }
  }

  return result;
}

/**
 * Check if a value looks like a placeholder
 */
function isPlaceholder(value) {
  if (!value) return true;
  const placeholders = ['your_', 'xxx', 'placeholder', 'enter_', 'add_', 'put_'];
  const lower = value.toLowerCase();
  return placeholders.some(p => lower.includes(p));
}

/**
 * Check if value looks like a real credential
 */
function looksLikeCredential(varName, value) {
  if (!value || isPlaceholder(value)) return false;

  // Check for known patterns
  const patterns = {
    GITHUB_PERSONAL_ACCESS_TOKEN: /^gh[ps]_[a-zA-Z0-9]{36,}$/,
    SLACK_BOT_TOKEN: /^xox[bpas]-/,
    POSTHOG_API_KEY: /^phc_/,
    FIGMA_PERSONAL_ACCESS_TOKEN: /^figd_/,
    GEMINI_API_KEY: /^AIza/,
    GOOGLE_API_KEY: /^AIza/,
    ATLASSIAN_API_TOKEN: /^ATATT/,
    JIRA_API_KEY: /^ATATT/,
    DOVETAIL_API_TOKEN: /^api\./,
  };

  if (patterns[varName]) {
    return patterns[varName].test(value);
  }

  // Generic check: has some length and alphanumeric content
  return value.length > 10 && /[a-zA-Z0-9]/.test(value);
}

/**
 * Scan for credentials in shell environment
 */
function scanShellEnv() {
  const found = {};
  const shellVars = {};

  for (const varName of Object.keys(KNOWN_VARS)) {
    const value = process.env[varName];
    if (value && !isPlaceholder(value)) {
      shellVars[varName] = value;
      if (looksLikeCredential(varName, value)) {
        found[varName] = value;
      }
    }
  }

  return { found, shellVars };
}

/**
 * Compare shell env with .env file
 */
function compareEnvs(shellVars, envFileVars) {
  const comparison = {
    inBoth: {},           // Same value in both
    shellOnly: {},        // Only in shell (should migrate)
    envOnly: {},          // Only in .env file
    different: {},        // Different values
    missingRequired: [],  // Required but missing everywhere
  };

  const allVars = new Set([...Object.keys(shellVars), ...Object.keys(envFileVars)]);

  for (const varName of allVars) {
    const shellVal = shellVars[varName];
    const envVal = envFileVars[varName];
    const shellReal = shellVal && !isPlaceholder(shellVal);
    const envReal = envVal && !isPlaceholder(envVal);

    if (shellReal && envReal) {
      if (shellVal === envVal) {
        comparison.inBoth[varName] = shellVal;
      } else {
        comparison.different[varName] = { shell: shellVal, env: envVal };
      }
    } else if (shellReal && !envReal) {
      comparison.shellOnly[varName] = shellVal;
    } else if (!shellReal && envReal) {
      comparison.envOnly[varName] = envVal;
    }
  }

  // Check for missing required
  for (const [varName, config] of Object.entries(KNOWN_VARS)) {
    if (config.required && !config.alias) {
      const shellVal = shellVars[varName];
      const envVal = envFileVars[varName];
      if ((!shellVal || isPlaceholder(shellVal)) && (!envVal || isPlaceholder(envVal))) {
        comparison.missingRequired.push(varName);
      }
    }
  }

  return comparison;
}

/**
 * Generate updated .env content
 */
function generateEnvContent(existingContent, newVars) {
  let content = existingContent;

  for (const [varName, value] of Object.entries(newVars)) {
    // Check if var already exists in content
    const regex = new RegExp(`^${varName}=.*$`, 'm');
    if (regex.test(content)) {
      // Replace existing
      content = content.replace(regex, `${varName}=${value}`);
    } else {
      // Find the right section to add to
      const config = KNOWN_VARS[varName];
      const sectionHeader = `# ${config?.section || 'Other'}`;
      const sectionRegex = new RegExp(`(# =+\\n# ${config?.section || 'Other'}[\\s\\S]*?)(\\n# =|$)`, 'm');

      const match = content.match(sectionRegex);
      if (match) {
        // Add after the section's existing vars
        const sectionEnd = match.index + match[1].length;
        content = content.slice(0, sectionEnd) + `\n${varName}=${value}` + content.slice(sectionEnd);
      } else {
        // Just append
        content += `\n${varName}=${value}`;
      }
    }
  }

  return content;
}

/**
 * Main migration logic
 */
async function migrate(options = {}) {
  const { dryRun = false, force = false } = options;

  log('');
  log(`${colors.bold}╔══════════════════════════════════════════════════════════════╗${colors.reset}`);
  log(`${colors.bold}║              PM AI Auth Migration Tool                       ║${colors.reset}`);
  log(`${colors.bold}╚══════════════════════════════════════════════════════════════╝${colors.reset}`);
  log('');

  // Step 1: Scan shell environment
  info('Scanning shell environment for credentials...');
  const { found: shellCreds, shellVars } = scanShellEnv();
  log(`   Found ${Object.keys(shellCreds).length} credentials in shell environment`);

  // Step 2: Read existing .env
  let envFileVars = {};
  let envContent = '';

  if (fs.existsSync(ENV_PATH)) {
    envContent = fs.readFileSync(ENV_PATH, 'utf8');
    envFileVars = parseEnvFile(envContent);
    log(`   Found ${Object.keys(envFileVars).length} variables in .env file`);
  } else {
    warn('.env file does not exist');
    if (fs.existsSync(ENV_EXAMPLE_PATH)) {
      info('Will create from .env.example template');
      envContent = fs.readFileSync(ENV_EXAMPLE_PATH, 'utf8');
    } else {
      throw new Error('No .env.example found. Run /pm-setup instead.');
    }
  }

  // Step 3: Compare
  log('');
  info('Comparing environments...');
  const comparison = compareEnvs(shellVars, envFileVars);

  // Report findings
  log('');
  log(`${colors.bold}Analysis Results:${colors.reset}`);
  log(`${colors.dim}─────────────────────────────────────${colors.reset}`);

  if (Object.keys(comparison.inBoth).length > 0) {
    success(`${Object.keys(comparison.inBoth).length} credentials already in sync`);
  }

  if (Object.keys(comparison.envOnly).length > 0) {
    success(`${Object.keys(comparison.envOnly).length} credentials only in .env (good)`);
  }

  if (Object.keys(comparison.shellOnly).length > 0) {
    warn(`${Object.keys(comparison.shellOnly).length} credentials only in shell (will migrate):`);
    for (const varName of Object.keys(comparison.shellOnly)) {
      const val = comparison.shellOnly[varName];
      const masked = val.substring(0, 8) + '...' + val.substring(val.length - 4);
      log(`      ${varName}=${masked}`);
    }
  }

  if (Object.keys(comparison.different).length > 0) {
    warn(`${Object.keys(comparison.different).length} credentials differ between shell and .env:`);
    for (const varName of Object.keys(comparison.different)) {
      const { shell, env } = comparison.different[varName];
      log(`      ${varName}:`);
      log(`        Shell: ${shell.substring(0, 8)}...`);
      log(`        .env:  ${env.substring(0, 8)}...`);
    }
  }

  if (comparison.missingRequired.length > 0) {
    error(`${comparison.missingRequired.length} required credentials missing everywhere:`);
    for (const varName of comparison.missingRequired) {
      log(`      ${varName}`);
    }
  }

  // Step 4: Determine what to migrate
  const toMigrate = { ...comparison.shellOnly };

  // For different values, prefer shell (newer) unless --force uses .env
  if (!force) {
    for (const varName of Object.keys(comparison.different)) {
      toMigrate[varName] = comparison.different[varName].shell;
    }
  }

  if (Object.keys(toMigrate).length === 0 && comparison.missingRequired.length === 0) {
    log('');
    success('Nothing to migrate! Your .env is up to date.');
    log('');
    return;
  }

  // Step 5: Perform migration
  log('');
  if (Object.keys(toMigrate).length > 0) {
    if (dryRun) {
      info(`[DRY RUN] Would migrate ${Object.keys(toMigrate).length} credentials to .env`);
    } else {
      info(`Migrating ${Object.keys(toMigrate).length} credentials to .env...`);

      const newContent = generateEnvContent(envContent, toMigrate);

      // Backup existing .env
      if (fs.existsSync(ENV_PATH)) {
        const backupPath = ENV_PATH + '.backup-' + new Date().toISOString().replace(/[:.]/g, '-');
        fs.copyFileSync(ENV_PATH, backupPath);
        log(`   Backed up to ${path.basename(backupPath)}`);
      }

      fs.writeFileSync(ENV_PATH, newContent);
      success(`Updated .env with ${Object.keys(toMigrate).length} credentials`);
    }
  }

  // Step 6: Recommendations
  log('');
  log(`${colors.bold}Recommendations:${colors.reset}`);
  log(`${colors.dim}─────────────────────────────────────${colors.reset}`);

  if (Object.keys(comparison.shellOnly).length > 0 && !dryRun) {
    info('You can now remove these from your ~/.zshrc:');
    for (const varName of Object.keys(comparison.shellOnly)) {
      log(`      export ${varName}=...`);
    }
    log('');
    info('Your shell already sources .env via:');
    log('      source ~/Documents/code/cloaked/work/.ai/scripts/.env');
  }

  if (comparison.missingRequired.length > 0) {
    log('');
    warn('To configure missing required credentials, run:');
    log('      /pm-setup');
    log('');
    log('   Or manually add to .ai/scripts/.env:');
    for (const varName of comparison.missingRequired) {
      const config = KNOWN_VARS[varName];
      log(`      ${varName}=your_value`);
    }
  }

  log('');
  if (!dryRun && Object.keys(toMigrate).length > 0) {
    success('Migration complete!');
    info('Restart your terminal or run: source ~/.zshrc');
  }
  log('');
}

// CLI - wrapped by script-runner
run({
  name: 'setup-migrate',
  mode: 'operational',
  services: [],
  args: { required: [], optional: ['--dry-run', '--force'] },
  description: `PM AI Auth Migration Script

Migrates credentials from shell environment into .env file.

Options:
  --dry-run   Show what would be migrated without making changes
  --force     Keep .env values when they differ from shell`,
}, async (ctx) => {
  const dryRun = ctx.args.flags['dry-run'] || false;
  const force = ctx.args.flags.force || false;

  track('setup_migrate_start', { dry_run: dryRun, force });

  await migrate({ dryRun, force });
});
