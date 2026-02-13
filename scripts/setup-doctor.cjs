// PM AI Starter Kit - setup-doctor.cjs
// See scripts/README.md for setup
#!/usr/bin/env node

/**
 * PM AI Setup Doctor
 *
 * Comprehensive diagnostic tool for PM AI system setup.
 * Validates all integrations and provides actionable fixes.
 *
 * Usage:
 *   node scripts/setup-doctor.cjs          # Run diagnostics
 *   node scripts/setup-doctor.cjs --json   # JSON output
 *   node scripts/setup-doctor.cjs --fix    # Auto-repair where possible
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const SCRIPT_DIR = __dirname;
const PROJECT_DIR = path.resolve(SCRIPT_DIR, '..');
const SHELL_ENV_PATH = path.join(os.homedir(), '.pm-ai-env.sh');
const ZSHRC_PATH = path.join(os.homedir(), '.zshrc');

// Environment file locations
const ENV_FILE_LOCATIONS = [
  path.join(SCRIPT_DIR, '.env'),
];

// All integrations to check
const INTEGRATIONS = {
  atlassian: {
    name: 'Jira/Confluence',
    envKeys: ['ATLASSIAN_EMAIL', 'JIRA_API_KEY'],
    required: true,
    docs: 'https://id.atlassian.com/manage-profile/security/api-tokens'
  },
  google: {
    name: 'Google OAuth',
    envKeys: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    required: false,
    docs: 'https://console.cloud.google.com/apis/credentials'
  },
  slack: {
    name: 'Slack',
    envKeys: ['SLACK_BOT_TOKEN'],
    required: false,
    docs: 'https://api.slack.com/apps'
  },
  dovetail: {
    name: 'Dovetail',
    envKeys: ['DOVETAIL_API_TOKEN'],
    required: false,
    docs: 'https://dovetail.com/help/api'
  },
  anthropic: {
    name: 'Anthropic',
    envKeys: ['ANTHROPIC_API_KEY'],
    required: false,
    docs: 'https://console.anthropic.com/settings/keys'
  },
  gemini: {
    name: 'Gemini AI',
    envKeys: ['GEMINI_API_KEY'],
    required: false,
    docs: 'https://aistudio.google.com/apikey'
  },
  github: {
    name: 'GitHub',
    envKeys: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
    required: false,
    docs: 'https://github.com/settings/tokens'
  },
  posthog: {
    name: 'PostHog',
    envKeys: ['POSTHOG_API_KEY'],
    required: false,
    docs: 'https://posthog.com/docs/api'
  },
  figma: {
    name: 'Figma',
    envKeys: ['FIGMA_PERSONAL_ACCESS_TOKEN'],
    required: false,
    docs: 'https://www.figma.com/developers/api#access-tokens'
  }
};

// MCP env vars that must be resolvable in the shell environment
const MCP_ENV_VARS = {
  POSTHOG_API_KEY: { server: 'posthog', usage: 'Authorization header' },
  GITHUB_PERSONAL_ACCESS_TOKEN: { server: 'github', usage: 'env block' },
  FIGMA_PERSONAL_ACCESS_TOKEN: { server: 'figma', usage: 'env block' },
};

/**
 * Check shell environment setup (~/.pm-ai-env.sh and zshrc sourcing)
 */
function checkShellEnv() {
  const results = [];

  // Check ~/.pm-ai-env.sh exists
  if (fs.existsSync(SHELL_ENV_PATH)) {
    const content = fs.readFileSync(SHELL_ENV_PATH, 'utf8');
    const exportCount = (content.match(/^export\s+/gm) || []).length;
    results.push({
      name: 'Shell env file',
      status: 'ok',
      message: `~/.pm-ai-env.sh (${exportCount} exports)`,
    });
  } else {
    results.push({
      name: 'Shell env file',
      status: 'missing',
      message: '~/.pm-ai-env.sh not found',
      suggestion: 'Create ~/.pm-ai-env.sh with your MCP env vars (POSTHOG_API_KEY, GITHUB_PERSONAL_ACCESS_TOKEN, etc.)',
    });
  }

  // Check zshrc sourcing
  if (fs.existsSync(ZSHRC_PATH)) {
    const zshrc = fs.readFileSync(ZSHRC_PATH, 'utf8');

    if (zshrc.includes('.pm-ai-env.sh')) {
      results.push({
        name: 'Shell sourcing',
        status: 'ok',
        message: '~/.zshrc sources ~/.pm-ai-env.sh',
      });
    } else {
      results.push({
        name: 'Shell sourcing',
        status: 'missing',
        message: '~/.zshrc does not source ~/.pm-ai-env.sh',
        suggestion: 'Add to ~/.zshrc: [ -f ~/.pm-ai-env.sh ] && source ~/.pm-ai-env.sh',
      });
    }
  }

  return results;
}

/**
 * Check MCP env var resolution
 */
function checkMcpEnvResolution() {
  const results = [];

  for (const [varName, meta] of Object.entries(MCP_ENV_VARS)) {
    const value = process.env[varName];
    if (value && value.length > 0) {
      results.push({
        name: `MCP: ${varName}`,
        status: 'ok',
        message: `Resolves for ${meta.server} (${meta.usage})`,
      });
    } else {
      results.push({
        name: `MCP: ${varName}`,
        status: 'failed',
        message: `Not in environment - ${meta.server} MCP will fail`,
        suggestion: `Add to ~/.pm-ai-env.sh and restart terminal`,
      });
    }
  }

  return results;
}

/**
 * Check .env file for CRLF line endings
 */
function checkEnvFileCrlf() {
  const results = [];

  for (const loc of ENV_FILE_LOCATIONS) {
    if (fs.existsSync(loc)) {
      const content = fs.readFileSync(loc, 'utf8');
      if (content.includes('\r')) {
        results.push({
          status: 'failed',
          file: loc,
          message: `${loc} has Windows line endings (CRLF)`,
          suggestion: "Run: perl -pi -e 's/\\r\\n/\\n/g' " + loc,
        });
      }
      break;
    }
  }

  if (fs.existsSync(SHELL_ENV_PATH)) {
    const content = fs.readFileSync(SHELL_ENV_PATH, 'utf8');
    if (content.includes('\r')) {
      results.push({
        status: 'failed',
        file: SHELL_ENV_PATH,
        message: `${SHELL_ENV_PATH} has Windows line endings (CRLF) - all MCP tokens will have trailing \\r`,
        suggestion: "Run: perl -pi -e 's/\\r\\n/\\n/g' " + SHELL_ENV_PATH,
      });
    }
  }

  if (results.length === 0) {
    return { status: 'ok' };
  }
  return { ...results[0], all: results };
}

/**
 * Load environment variables from .env file
 */
function loadEnvFile() {
  const env = {};
  let file = null;

  for (const loc of ENV_FILE_LOCATIONS) {
    if (fs.existsSync(loc)) {
      const content = fs.readFileSync(loc, 'utf8');
      for (const line of content.split('\n')) {
        if (!line.trim() || line.startsWith('#')) continue;
        const cleanLine = line.replace(/\r$/, '');
        const match = cleanLine.match(/^([^=]+)=(.*)$/);
        if (match) {
          env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
        }
      }
      file = loc;
      break;
    }
  }

  // Also check process.env for MCP vars
  for (const key of Object.keys(MCP_ENV_VARS)) {
    if (!env[key] && process.env[key]) {
      env[key] = process.env[key];
    }
  }

  return { env, file };
}

/**
 * Check if credential keys are present
 */
function checkCredentialPresence(env, keys) {
  const missing = [];
  const present = [];
  for (const key of keys) {
    if (env[key] && env[key].length > 0) {
      present.push(key);
    } else {
      missing.push(key);
    }
  }
  return { missing, present, allPresent: missing.length === 0 };
}

/**
 * Format results for display
 */
function formatResults(results, jsonMode) {
  if (jsonMode) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log('\n' + '='.repeat(60));
  console.log('  PM AI SETUP DOCTOR');
  console.log('='.repeat(60) + '\n');

  // Environment file
  console.log('Environment Files');
  if (results.envFile) {
    console.log(`   [OK] Found: ${results.envFile}`);
  } else {
    console.log(`   [MISSING] Not found`);
    console.log(`   -> Copy .env.example to .env and fill in credentials`);
  }

  // CRLF check
  const crlfItems = results.envCrlf && results.envCrlf.all ? results.envCrlf.all : (results.envCrlf && results.envCrlf.status === 'failed' ? [results.envCrlf] : []);
  for (const crlf of crlfItems) {
    console.log(`   [FAIL] ${crlf.message}`);
    console.log(`     -> ${crlf.suggestion}`);
  }
  console.log();

  // Shell environment
  if (results.shellEnv && results.shellEnv.length > 0) {
    console.log('Shell Environment\n');
    for (const check of results.shellEnv) {
      const icon = check.status === 'ok' ? 'OK' : check.status === 'missing' ? 'MISSING' : 'FAIL';
      console.log(`   [${icon}] ${check.message}`);
      if (check.suggestion) {
        console.log(`     -> ${check.suggestion}`);
      }
    }
    console.log();
  }

  // MCP env resolution
  if (results.mcpEnvResolution && results.mcpEnvResolution.length > 0) {
    console.log('MCP Environment Variables\n');
    for (const check of results.mcpEnvResolution) {
      const icon = check.status === 'ok' ? 'OK' : 'FAIL';
      console.log(`   [${icon}] ${check.name}: ${check.message}`);
      if (check.suggestion) {
        console.log(`     -> ${check.suggestion}`);
      }
    }
    console.log();
  }

  // Integrations
  console.log('Integrations\n');
  console.log('   Service          | Status  | Details');
  console.log('   ' + '-'.repeat(55));

  for (const [key, check] of Object.entries(results.integrations)) {
    const name = check.name.padEnd(17);
    const statusText = check.status.toUpperCase().padEnd(7);
    const required = check.required ? '*' : ' ';
    const details = (check.message || '').substring(0, 30);
    console.log(`  ${required}${name} | ${statusText} | ${details}`);
  }

  console.log('   * = required\n');

  // Summary
  const total = Object.keys(results.integrations).length;
  const ok = Object.values(results.integrations).filter(i => i.status === 'ok').length;
  const failed = Object.values(results.integrations).filter(i => i.status === 'failed').length;
  const missing = Object.values(results.integrations).filter(i => i.status === 'missing').length;

  console.log('-'.repeat(60));
  console.log(`Summary: ${ok}/${total} OK, ${failed} failed, ${missing} not configured`);

  if (failed > 0 || (missing > 0 && Object.values(results.integrations).some(i => i.required && i.status === 'missing'))) {
    console.log('\nNext steps:');

    for (const [key, check] of Object.entries(results.integrations)) {
      if (check.status === 'failed' || (check.status === 'missing' && check.required)) {
        console.log(`  - ${check.name}: ${check.suggestion || 'Check configuration'}`);
        if (INTEGRATIONS[key]?.docs) {
          console.log(`    Docs: ${INTEGRATIONS[key].docs}`);
        }
      }
    }
  } else if (ok === total) {
    console.log('\nAll integrations healthy!');
  }
  console.log();
}

/**
 * Auto-fix common issues
 */
async function autoFix(results) {
  console.log('\nAttempting auto-fix...\n');
  let fixed = 0;

  // Fix: Missing .env file
  if (!results.envFile) {
    const examplePath = path.join(SCRIPT_DIR, '.env.example');
    const targetPath = ENV_FILE_LOCATIONS[0];

    if (fs.existsSync(examplePath)) {
      fs.copyFileSync(examplePath, targetPath);
      console.log(`   [FIXED] Created ${targetPath} from template`);
      console.log(`     -> Edit this file to add your API credentials`);
      fixed++;
    } else {
      console.log(`   [SKIP] Cannot create .env - no template found`);
    }
  }

  // Fix: CRLF in env files
  const crlfItems = results.envCrlf && results.envCrlf.all ? results.envCrlf.all : (results.envCrlf && results.envCrlf.status === 'failed' ? [results.envCrlf] : []);
  for (const crlf of crlfItems) {
    try {
      const content = fs.readFileSync(crlf.file, 'utf8');
      fs.writeFileSync(crlf.file, content.replace(/\r\n/g, '\n'));
      console.log(`   [FIXED] Fixed CRLF line endings in ${crlf.file}`);
      fixed++;
    } catch (err) {
      console.log(`   [FAIL] Failed to fix CRLF in ${crlf.file}: ${err.message}`);
    }
  }

  console.log(`\n${fixed} issue(s) auto-fixed.`);
  if (fixed > 0) {
    console.log('Run doctor again to verify: node scripts/setup-doctor.cjs\n');
  }
}

/**
 * Main diagnostic function
 */
async function runDiagnostics(options = {}) {
  const { json, fix } = options;

  // Load environment
  const { env, file: envFile } = loadEnvFile();

  // Check all integrations
  const integrations = {};

  for (const [key, config] of Object.entries(INTEGRATIONS)) {
    const presence = checkCredentialPresence(env, config.envKeys);

    if (!presence.allPresent) {
      integrations[key] = {
        name: config.name,
        status: 'missing',
        message: `Missing: ${presence.missing.join(', ')}`,
        suggestion: `Add to .env or get from ${config.docs}`,
        required: config.required
      };
      continue;
    }

    // Credentials present - mark as OK (no live validation in starter kit)
    integrations[key] = {
      name: config.name,
      status: 'ok',
      message: 'Credentials configured',
      required: config.required
    };
  }

  // Check shell environment setup
  const shellEnv = checkShellEnv();

  // Check MCP env var resolution
  const mcpEnvResolution = checkMcpEnvResolution();

  // Check .env CRLF
  const envCrlf = checkEnvFileCrlf();

  const results = {
    envFile,
    envCrlf,
    integrations,
    shellEnv,
    mcpEnvResolution,
    timestamp: new Date().toISOString()
  };

  // Output results
  formatResults(results, json);

  // Auto-fix if requested
  if (fix) {
    await autoFix(results);
  }

  // Return exit code based on required integrations
  const requiredFailed = Object.entries(integrations)
    .filter(([_, i]) => i.required && (i.status === 'failed' || i.status === 'missing'))
    .length;

  return requiredFailed > 0 ? 1 : 0;
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const fix = args.includes('--fix');

  runDiagnostics({ json, fix })
    .then(code => {
      process.exit(code);
    })
    .catch(err => {
      console.error('Doctor failed:', err.message);
      process.exit(1);
    });
}

module.exports = { runDiagnostics, loadEnvFile };
