#!/usr/bin/env node

/**
 * PM AI Setup Doctor
 *
 * Comprehensive diagnostic tool for PM AI system setup.
 * Validates all integrations and provides actionable fixes.
 *
 * Usage:
 *   node .ai/scripts/setup-doctor.cjs          # Run diagnostics
 *   node .ai/scripts/setup-doctor.cjs --json   # JSON output
 *   node .ai/scripts/setup-doctor.cjs --fix    # Auto-repair where possible
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { track } = require('./lib/telemetry.cjs');
const { run } = require('./lib/script-runner.cjs');

const os = require('os');
const { ENV_FILE_LOCATIONS, parseEnvFile, countRealCredentials, findBestBackup, safeWriteEnvFile, fixCrlf, normalizeLF } = require('./lib/env-guard.cjs');

const SCRIPT_DIR = __dirname;
const PM_DIR = path.resolve(SCRIPT_DIR, '../..');
const VALIDATORS_DIR = path.join(SCRIPT_DIR, 'validators');
const SHELL_ENV_PATH = path.join(os.homedir(), '.cloaked-env.sh');
const ZSHRC_PATH = path.join(os.homedir(), '.zshrc');

// All integrations to check
const INTEGRATIONS = {
  gemini: {
    name: 'Gemini AI',
    envKeys: ['GEMINI_API_KEY'],
    validator: 'gemini-validator.cjs',
    required: true,
    docs: 'https://aistudio.google.com/apikey'
  },
  github: {
    name: 'GitHub',
    envKeys: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
    validator: 'github-validator.cjs',
    required: true,
    docs: 'https://github.com/settings/tokens'
  },
  atlassian: {
    name: 'Jira/Confluence',
    envKeys: ['ATLASSIAN_EMAIL', 'JIRA_API_KEY'],
    validator: 'atlassian-validator.cjs',
    required: true,
    docs: 'https://id.atlassian.com/manage-profile/security/api-tokens'
  },
  google: {
    name: 'Google OAuth',
    envKeys: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    validator: 'google-oauth-validator.cjs',
    required: false,
    docs: 'https://console.cloud.google.com/apis/credentials'
  },
  posthog: {
    name: 'PostHog',
    envKeys: ['POSTHOG_API_KEY'],
    validator: 'posthog-validator.cjs',
    required: false,
    docs: 'https://posthog.com/docs/api'
  },
  slack: {
    name: 'Slack',
    envKeys: ['SLACK_BOT_TOKEN'],
    validator: 'slack-validator.cjs',
    required: false,
    docs: 'https://api.slack.com/apps'
  },
  dovetail: {
    name: 'Dovetail',
    envKeys: ['DOVETAIL_API_TOKEN'],
    validator: 'dovetail-validator.cjs',
    required: false,
    docs: 'https://dovetail.com/help/api'
  },
  figma: {
    name: 'Figma',
    envKeys: ['FIGMA_PERSONAL_ACCESS_TOKEN'],
    validator: 'figma-validator.cjs',
    required: false,
    docs: 'https://www.figma.com/developers/api#access-tokens'
  },
  anthropic: {
    name: 'Anthropic',
    envKeys: ['ANTHROPIC_API_KEY'],
    validator: 'anthropic-validator.cjs',
    required: false,
    docs: 'https://console.anthropic.com/settings/keys'
  }
};

// MCP env vars that must be resolvable in the shell environment
const MCP_ENV_VARS = {
  POSTHOG_API_KEY: { server: 'posthog', usage: 'Authorization header' },
  GITHUB_PERSONAL_ACCESS_TOKEN: { server: 'github', usage: 'env block' },
  FIGMA_PERSONAL_ACCESS_TOKEN: { server: 'figma', usage: 'env block' },
};

/**
 * Check shell environment setup (~/.cloaked-env.sh and zshrc sourcing)
 */
function checkShellEnv() {
  const results = [];

  // Check ~/.cloaked-env.sh exists
  if (fs.existsSync(SHELL_ENV_PATH)) {
    const content = fs.readFileSync(SHELL_ENV_PATH, 'utf8');
    const exportCount = (content.match(/^export\s+/gm) || []).length;
    results.push({
      name: 'Shell env file',
      status: 'ok',
      message: `~/.cloaked-env.sh (${exportCount} exports)`,
    });
  } else {
    results.push({
      name: 'Shell env file',
      status: 'missing',
      message: '~/.cloaked-env.sh not found',
      suggestion: 'Run: node .ai/scripts/setup-shell-env.cjs',
    });
  }

  // Check zshrc sourcing
  if (fs.existsSync(ZSHRC_PATH)) {
    const zshrc = fs.readFileSync(ZSHRC_PATH, 'utf8');

    // Bad: sourcing .env directly
    if (zshrc.includes('.ai/scripts/.env')) {
      results.push({
        name: 'Shell config',
        status: 'failed',
        message: '~/.zshrc sources .ai/scripts/.env directly',
        suggestion: 'Run: node .ai/scripts/setup-shell-env.cjs --fix',
      });
    }

    // Good: sourcing ~/.cloaked-env.sh
    if (zshrc.includes('.cloaked-env.sh')) {
      results.push({
        name: 'Shell sourcing',
        status: 'ok',
        message: '~/.zshrc sources ~/.cloaked-env.sh',
      });
    } else {
      results.push({
        name: 'Shell sourcing',
        status: 'missing',
        message: '~/.zshrc does not source ~/.cloaked-env.sh',
        suggestion: 'Run: node .ai/scripts/setup-shell-env.cjs --fix',
      });
    }

    // Check for hardcoded MCP exports in zshrc
    const hardcoded = [];
    for (const key of Object.keys(MCP_ENV_VARS)) {
      if (new RegExp(`^export\\s+${key}=`, 'm').test(zshrc)) {
        hardcoded.push(key);
      }
    }
    if (hardcoded.length > 0) {
      results.push({
        name: 'Hardcoded exports',
        status: 'failed',
        message: `~/.zshrc has hardcoded: ${hardcoded.join(', ')}`,
        suggestion: 'Move to ~/.cloaked-env.sh: node .ai/scripts/setup-shell-env.cjs --fix',
      });
    }
  }

  return results;
}

/**
 * Check MCP env var resolution - do the ${VAR} references in mcp.json resolve?
 */
function checkMcpEnvResolution() {
  const results = [];
  const mcpPath = path.join(PM_DIR, '.claude/mcp.json');

  if (!fs.existsSync(mcpPath)) {
    return results;
  }

  const mcpContent = fs.readFileSync(mcpPath, 'utf8');

  for (const [varName, meta] of Object.entries(MCP_ENV_VARS)) {
    // Check if this var is referenced in mcp.json
    if (!mcpContent.includes(`\${${varName}}`)) continue;

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
        suggestion: `Add to ~/.cloaked-env.sh and restart terminal`,
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

  // Check .env files
  for (const loc of ENV_FILE_LOCATIONS) {
    if (fs.existsSync(loc)) {
      const { hasCrlf } = parseEnvFile(loc);
      if (hasCrlf) {
        results.push({
          status: 'failed',
          file: loc,
          message: `${loc} has Windows line endings (CRLF)`,
          suggestion: 'Run: node .ai/scripts/setup-doctor.cjs --fix',
        });
      }
      break;
    }
  }

  // Check ~/.cloaked-env.sh (CRLF here silently corrupts every exported value)
  if (fs.existsSync(SHELL_ENV_PATH)) {
    const content = fs.readFileSync(SHELL_ENV_PATH, 'utf8');
    if (content.includes('\r')) {
      results.push({
        status: 'failed',
        file: SHELL_ENV_PATH,
        message: `${SHELL_ENV_PATH} has Windows line endings (CRLF) - all MCP tokens will have trailing \\r`,
        suggestion: 'Run: node .ai/scripts/setup-doctor.cjs --fix',
      });
    }
  }

  return { status: results.length === 0 ? 'ok' : 'failed', items: results };
}

/**
 * Load environment variables from .env file
 * Delegates to env-guard for CRLF-safe parsing.
 */
function loadEnvFile() {
  let env = {};
  let file = null;

  // Load from .env file using env-guard (handles CRLF automatically)
  for (const loc of ENV_FILE_LOCATIONS) {
    if (fs.existsSync(loc)) {
      env = parseEnvFile(loc).vars;
      file = loc;
      break;
    }
  }

  // Also check process.env for MCP vars (from ~/.cloaked-env.sh or shell)
  // This ensures doctor finds credentials regardless of where they're set
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
 * Run a validator and return result
 */
async function runValidator(validatorFile, env, integration) {
  const validatorPath = path.join(VALIDATORS_DIR, validatorFile);

  if (!fs.existsSync(validatorPath)) {
    return {
      status: 'skipped',
      message: 'Validator not found',
      suggestion: `Create ${validatorFile}`
    };
  }

  try {
    const validator = require(validatorPath);

    // Get credentials for this integration
    const creds = integration.envKeys.map(k => env[k]);

    // Call validator with appropriate args
    let result;
    if (creds.length === 1) {
      result = await validator(creds[0]);
    } else if (creds.length === 2) {
      result = await validator(creds[0], creds[1]);
    } else {
      result = await validator(...creds);
    }

    return {
      status: result.valid ? 'ok' : 'failed',
      message: result.valid ? 'Connected' : result.error,
      suggestion: result.suggestion,
      details: result
    };
  } catch (err) {
    return {
      status: 'error',
      message: err.message,
      suggestion: 'Check validator implementation'
    };
  }
}

/**
 * Check token files (Google OAuth, etc.)
 */
function checkTokenFiles() {
  const results = [];

  // Google OAuth tokens
  const googleTokenPaths = [
    path.join(SCRIPT_DIR, '.google-tokens'),
    path.join(SCRIPT_DIR, '.google-suite-token.json'),
  ];

  let googleTokenFound = false;
  for (const tokenPath of googleTokenPaths) {
    if (fs.existsSync(tokenPath)) {
      if (fs.statSync(tokenPath).isDirectory()) {
        const files = fs.readdirSync(tokenPath);
        if (files.length > 0) {
          googleTokenFound = true;
          results.push({
            name: 'Google OAuth Tokens',
            status: 'ok',
            message: `${files.length} account(s) configured`,
            path: tokenPath
          });
        }
      } else {
        try {
          JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
          googleTokenFound = true;
          results.push({
            name: 'Google OAuth Token',
            status: 'ok',
            message: 'Token file valid',
            path: tokenPath
          });
        } catch {
          results.push({
            name: 'Google OAuth Token',
            status: 'failed',
            message: 'Token file corrupted',
            suggestion: 'Delete and re-authenticate',
            path: tokenPath
          });
        }
      }
      break;
    }
  }

  if (!googleTokenFound) {
    results.push({
      name: 'Google OAuth Tokens',
      status: 'missing',
      message: 'No tokens found',
      suggestion: 'Run: node .ai/scripts/google-auth-setup.cjs'
    });
  }

  return results;
}

/**
 * Check MCP configuration
 */
function checkMcpConfig() {
  const mcpPath = path.join(PM_DIR, '.claude/mcp.json');

  if (!fs.existsSync(mcpPath)) {
    return {
      status: 'missing',
      message: 'MCP config not found',
      suggestion: 'Run setup wizard: node .ai/scripts/setup-wizard.cjs run mcp_config'
    };
  }

  try {
    const config = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    const servers = Object.keys(config.mcpServers || {});
    return {
      status: 'ok',
      message: `${servers.length} server(s) configured`,
      servers
    };
  } catch (err) {
    return {
      status: 'failed',
      message: 'Invalid JSON',
      suggestion: 'Regenerate MCP config'
    };
  }
}

/**
 * Format results for display
 */
function formatResults(results, jsonMode) {
  if (jsonMode) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    PM AI SETUP DOCTOR                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Environment file
  console.log('📁 Environment Files');
  if (results.envFile) {
    console.log(`   ✓ Found: ${results.envFile}`);
  } else {
    console.log(`   ✗ Not found`);
    console.log(`   → Run: /pm-setup or create .ai/scripts/.env`);
  }

  // CRLF check
  const crlfItems = results.envCrlf.items || [];
  for (const crlf of crlfItems) {
    console.log(`   ✗ ${crlf.message}`);
    console.log(`     → ${crlf.suggestion}`);
  }
  console.log();

  // Shell environment
  if (results.shellEnv && results.shellEnv.length > 0) {
    console.log('🐚 Shell Environment\n');
    for (const check of results.shellEnv) {
      const icon = check.status === 'ok' ? '✓' : check.status === 'missing' ? '○' : '✗';
      console.log(`   ${icon} ${check.message}`);
      if (check.suggestion) {
        console.log(`     → ${check.suggestion}`);
      }
    }
    console.log();
  }

  // MCP env resolution
  if (results.mcpEnvResolution && results.mcpEnvResolution.length > 0) {
    console.log('🔗 MCP Environment Variables\n');
    for (const check of results.mcpEnvResolution) {
      const icon = check.status === 'ok' ? '✓' : '✗';
      console.log(`   ${icon} ${check.name}: ${check.message}`);
      if (check.suggestion) {
        console.log(`     → ${check.suggestion}`);
      }
    }
    console.log();
  }

  // Integrations
  console.log('🔌 Integrations\n');
  console.log('   ┌─────────────────┬──────────┬────────────────────────────────────┐');
  console.log('   │ Service         │ Status   │ Details                            │');
  console.log('   ├─────────────────┼──────────┼────────────────────────────────────┤');

  for (const [key, check] of Object.entries(results.integrations)) {
    const name = check.name.padEnd(15);
    let statusIcon, statusText;

    switch (check.status) {
      case 'ok':
        statusIcon = '✓';
        statusText = 'OK'.padEnd(8);
        break;
      case 'failed':
        statusIcon = '✗';
        statusText = 'FAILED'.padEnd(8);
        break;
      case 'missing':
        statusIcon = '○';
        statusText = 'MISSING'.padEnd(8);
        break;
      case 'skipped':
        statusIcon = '–';
        statusText = 'SKIPPED'.padEnd(8);
        break;
      default:
        statusIcon = '?';
        statusText = 'UNKNOWN'.padEnd(8);
    }

    const details = (check.message || '').substring(0, 34).padEnd(34);
    const required = check.required ? '*' : ' ';
    console.log(`   │${required}${name} │ ${statusIcon} ${statusText}│ ${details} │`);
  }

  console.log('   └─────────────────┴──────────┴────────────────────────────────────┘');
  console.log('   * = required\n');

  // Token files
  console.log('🔑 Token Files\n');
  for (const token of results.tokenFiles) {
    const icon = token.status === 'ok' ? '✓' : token.status === 'missing' ? '○' : '✗';
    console.log(`   ${icon} ${token.name}: ${token.message}`);
    if (token.suggestion) {
      console.log(`     → ${token.suggestion}`);
    }
  }
  console.log();

  // MCP Config
  console.log('⚙️  MCP Configuration\n');
  const mcp = results.mcpConfig;
  const mcpIcon = mcp.status === 'ok' ? '✓' : mcp.status === 'missing' ? '○' : '✗';
  console.log(`   ${mcpIcon} ${mcp.message}`);
  if (mcp.servers) {
    console.log(`     Servers: ${mcp.servers.join(', ')}`);
  }
  if (mcp.suggestion) {
    console.log(`     → ${mcp.suggestion}`);
  }
  console.log();

  // Summary
  const total = Object.keys(results.integrations).length;
  const ok = Object.values(results.integrations).filter(i => i.status === 'ok').length;
  const failed = Object.values(results.integrations).filter(i => i.status === 'failed').length;
  const missing = Object.values(results.integrations).filter(i => i.status === 'missing').length;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Summary: ${ok}/${total} OK, ${failed} failed, ${missing} not configured`);

  if (failed > 0 || (missing > 0 && Object.values(results.integrations).some(i => i.required && i.status === 'missing'))) {
    console.log('\nNext steps:');

    // Show specific fixes
    for (const [key, check] of Object.entries(results.integrations)) {
      if (check.status === 'failed' || (check.status === 'missing' && check.required)) {
        console.log(`  • ${check.name}: ${check.suggestion || 'Check configuration'}`);
        if (INTEGRATIONS[key]?.docs) {
          console.log(`    Docs: ${INTEGRATIONS[key].docs}`);
        }
      }
    }
  } else if (ok === total) {
    console.log('\n✓ All integrations healthy!');
  }
  console.log();
}

/**
 * Auto-fix common issues
 */
async function autoFix(results) {
  console.log('\n🔧 Attempting auto-fix...\n');
  let fixed = 0;

  // Fix: Missing .env file - but NEVER overwrite existing credentials
  if (!results.envFile) {
    const targetPath = ENV_FILE_LOCATIONS[0];

    // Double-check: the target might actually exist with credentials
    // (path resolution can differ from the check that set results.envFile)
    if (fs.existsSync(targetPath)) {
      const { vars } = parseEnvFile(targetPath);
      const realCount = countRealCredentials(vars);
      if (realCount > 0) {
        console.log(`   ⚠ Skipping .env overwrite - file has ${realCount} real credential(s)`);
      } else {
        console.log(`   ○ .env exists but has no real credentials - leave it for user to fill in`);
      }
    } else {
      // File truly missing - check for a restorable backup first
      const bestBackup = findBestBackup();
      if (bestBackup) {
        // Read backup, normalize CRLF, and write via safeWriteEnvFile for atomic write + audit trail
        const backupContent = fs.readFileSync(bestBackup.path, 'utf8');
        const normalized = normalizeLF(backupContent);
        safeWriteEnvFile(targetPath, normalized, { force: true });
        console.log(`   ✓ Restored ${targetPath} from backup (${bestBackup.credentialCount} credentials)`);
        fixed++;
      } else {
        // No backup - create from template
        const examplePath = path.join(SCRIPT_DIR, '.env.example');
        if (fs.existsSync(examplePath)) {
          safeWriteEnvFile(targetPath, fs.readFileSync(examplePath, 'utf8'), { force: true });
          console.log(`   ✓ Created ${targetPath} from template`);
          console.log(`     → Edit this file to add your API credentials`);
          fixed++;
        } else {
          console.log(`   ✗ Cannot create .env - no template or backup found`);
        }
      }
    }
  }

  // Fix: Missing MCP config
  if (results.mcpConfig.status === 'missing' || results.mcpConfig.status === 'failed') {
    try {
      execSync('node .ai/scripts/setup-wizard.cjs run mcp_config', {
        cwd: PM_DIR,
        stdio: 'pipe'
      });
      console.log(`   ✓ Regenerated MCP configuration`);
      fixed++;
    } catch (err) {
      console.log(`   ✗ Failed to regenerate MCP config: ${err.message}`);
    }
  }

  // Fix: Corrupted token files
  for (const token of results.tokenFiles) {
    if (token.status === 'failed' && token.path) {
      try {
        fs.unlinkSync(token.path);
        console.log(`   ✓ Removed corrupted token: ${token.path}`);
        console.log(`     → Re-authenticate with: node .ai/scripts/google-auth-setup.cjs`);
        fixed++;
      } catch (err) {
        console.log(`   ✗ Failed to remove ${token.path}: ${err.message}`);
      }
    }
  }

  // Fix: CRLF in env files
  const crlfItems = results.envCrlf.items || [];
  for (const crlf of crlfItems) {
    try {
      // Use env-guard's fixCrlf which creates a backup and does atomic write
      if (crlf.file.includes('.env')) {
        fixCrlf(crlf.file);
      } else {
        // For non-.env files (e.g. ~/.cloaked-env.sh), use raw fix since env-guard
        // targets .env specifically. Still better than no fix.
        const content = fs.readFileSync(crlf.file, 'utf8');
        fs.writeFileSync(crlf.file, content.replace(/\r\n/g, '\n').replace(/\r/g, '\n'), { mode: 0o600 });
      }
      console.log(`   ✓ Fixed CRLF line endings in ${crlf.file}`);
      fixed++;
    } catch (err) {
      console.log(`   ✗ Failed to fix CRLF in ${crlf.file}: ${err.message}`);
    }
  }

  // Fix: Shell environment setup
  const shellSetupScript = path.join(SCRIPT_DIR, 'setup-shell-env.cjs');
  if (fs.existsSync(shellSetupScript)) {
    const hasShellIssues = (results.shellEnv || []).some(
      s => s.status === 'failed' || s.status === 'missing'
    );
    if (hasShellIssues) {
      try {
        execSync(`node "${shellSetupScript}" --fix`, {
          cwd: PM_DIR,
          stdio: 'pipe'
        });
        console.log(`   ✓ Fixed shell environment setup`);
        fixed++;
      } catch (err) {
        console.log(`   ✗ Failed to fix shell env: ${err.message}`);
      }
    }
  }

  console.log(`\n${fixed} issue(s) auto-fixed.`);
  if (fixed > 0) {
    console.log('Run doctor again to verify: node .ai/scripts/setup-doctor.cjs\n');
  }

  // Track auto-fix results
  track('doctor_autofix', { issues_fixed: fixed });
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

    // Run validator if credentials present
    const validatorResult = await runValidator(config.validator, env, config);
    integrations[key] = {
      name: config.name,
      ...validatorResult,
      required: config.required
    };

    // Track each integration check
    track('doctor_check', {
      integration: key,
      status: validatorResult.status,
      required: config.required
    });
  }

  // Check token files
  const tokenFiles = checkTokenFiles();

  // Check MCP config
  const mcpConfig = checkMcpConfig();

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
    tokenFiles,
    mcpConfig,
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

  // Track summary
  const ok = Object.values(integrations).filter(i => i.status === 'ok').length;
  const failed = Object.values(integrations).filter(i => i.status === 'failed').length;
  const missing = Object.values(integrations).filter(i => i.status === 'missing').length;

  track('doctor_summary', {
    integrations_ok: ok,
    integrations_failed: failed,
    integrations_missing: missing,
    required_failed: requiredFailed,
    has_env_file: !!envFile,
    mcp_status: mcpConfig.status
  });

  return requiredFailed > 0 ? 1 : 0;
}

// CLI
if (require.main === module) {
  run({
    name: 'setup-doctor',
    mode: 'diagnostic',
    services: ['gemini', 'github', 'atlassian', 'google', 'posthog', 'slack', 'dovetail', 'figma', 'anthropic'],
    args: { required: [], optional: ['--json', '--fix'] },
  }, async (ctx) => {
    const json = ctx.args.flags.json || false;
    const fix = ctx.args.flags.fix || false;

    const code = await runDiagnostics({ json, fix });

    if (code !== 0) {
      throw new Error(`${code} required integration(s) failed`);
    }
  });
}

module.exports = { runDiagnostics, loadEnvFile };
