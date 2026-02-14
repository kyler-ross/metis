#!/usr/bin/env node

/**
 * PM AI Setup Wizard - Main Orchestrator
 *
 * Hybrid approach: Claude calls this script for each phase, script returns JSON.
 * Claude interprets results and guides user through the process.
 *
 * Usage:
 *   node setup-wizard.cjs status          # Show current progress
 *   node setup-wizard.cjs next            # Run next pending phase
 *   node setup-wizard.cjs run <phase>     # Run specific phase
 *   node setup-wizard.cjs reset           # Clear state and start over
 *   node setup-wizard.cjs help            # Show all phases
 */

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync, spawn } = require('child_process');

// Import existing modules
const SetupState = require('./lib/state-manager.cjs');
const PlatformDetector = require('./lib/platform-detector.cjs');
const SystemPackagesInstaller = require('./installers/system-packages.cjs');
const MCPGenerator = require('./installers/mcp-generator.cjs');
const { track, trackScript, trackComplete, trackError, flush } = require('./lib/telemetry.cjs');
const { findEnvFile, ENV_FILE_LOCATIONS, parseEnvFile, countRealCredentials, safeWriteEnvFile, fixCrlf } = require('./lib/env-guard.cjs');

const PM_DIR = path.resolve(__dirname, '../..');

/**
 * Get the .env file path (dynamic, never cached)
 */
function getEnvFile() {
  return findEnvFile();
}

/**
 * Load environment variables from .env file
 * Delegates to env-guard for CRLF-safe parsing.
 */
function loadEnvFile() {
  const envFile = findEnvFile();
  if (!fs.existsSync(envFile)) return {};

  return parseEnvFile(envFile).vars;
}

// Phase definitions with descriptions
const PHASES = {
  preflight: {
    name: 'Pre-flight Checks',
    description: 'Verify Node.js, Python, and Git are installed',
    required: true
  },
  system_packages: {
    name: 'System Packages',
    description: 'Install tesseract (OCR), poppler (PDF), ffmpeg (media)',
    required: false
  },
  env_file: {
    name: 'Environment File',
    description: 'Create .env file for API credentials',
    required: true
  },
  credentials: {
    name: 'API Credentials',
    description: 'Validate Atlassian, GitHub, Gemini, PostHog keys',
    required: true
  },
  google_oauth: {
    name: 'Google OAuth',
    description: 'Set up Google Sheets/Drive access',
    required: false
  },
  mcp_config: {
    name: 'MCP Configuration',
    description: 'Generate .claude/mcp.json for integrations',
    required: true
  },
  slash_commands: {
    name: 'Slash Commands',
    description: 'Install /pm-ai, /pm-coach, etc. commands',
    required: true
  },
  analytics: {
    name: 'Analytics System',
    description: 'Initialize conversation analytics database',
    required: false
  },
  daemon: {
    name: 'Background Daemon',
    description: 'Install enrichment daemon (LaunchAgent/systemd)',
    required: false
  },
  shell_alias: {
    name: 'Shell Alias',
    description: 'Add pm-claude function to shell config',
    required: false
  },
  pm_shortcut: {
    name: 'PM Quick Launch',
    description: 'Add "pm" alias to launch Claude Code with /pm-ai',
    required: false
  },
  ralph: {
    name: 'Ralph Orchestrator',
    description: 'Install ralph-orchestrator for autonomous AI agent sessions',
    required: false
  },
  menubar: {
    name: 'PM Menu Bar App',
    description: 'Install and launch the PM Menu Bar status app (macOS)',
    required: false
  }
};

const PHASE_ORDER = Object.keys(PHASES);

/**
 * Output JSON result for Claude to parse
 */
function output(result) {
  console.log(JSON.stringify(result, null, 2));
}

/**
 * Get platform info
 */
function getPlatformInfo() {
  const platform = new PlatformDetector();
  return {
    os: platform.isMacOS() ? 'macos' : platform.isLinux() ? 'linux' : 'unknown',
    packageManager: platform.getPackageManager(),
    shell: process.env.SHELL || 'unknown'
  };
}

/**
 * Check version of a command
 */
function getVersion(cmd, args = ['--version']) {
  try {
    const result = execSync(`${cmd} ${args.join(' ')}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const match = result.match(/(\d+\.\d+(\.\d+)?)/);
    return match ? match[1] : 'installed';
  } catch {
    return null;
  }
}

/**
 * Phase: preflight - Check system requirements
 */
async function runPreflight(state) {
  const checks = {
    node: { cmd: 'node', minVersion: '18.0.0' },
    python: { cmd: 'python3', minVersion: '3.9.0' },
    git: { cmd: 'git', minVersion: '2.0.0' }
  };

  const results = {};
  let allPassed = true;
  const issues = [];

  for (const [name, check] of Object.entries(checks)) {
    const version = getVersion(check.cmd);
    results[name] = { version, required: check.minVersion };

    if (!version) {
      allPassed = false;
      issues.push(`${name} not found - install ${check.cmd}`);
    } else if (version !== 'installed') {
      const [major, minor] = version.split('.').map(Number);
      const [reqMajor, reqMinor] = check.minVersion.split('.').map(Number);
      if (major < reqMajor || (major === reqMajor && minor < reqMinor)) {
        allPassed = false;
        issues.push(`${name} ${version} is below required ${check.minVersion}`);
      }
    }
  }

  const platform = getPlatformInfo();

  if (allPassed) {
    state.setEnvironment(platform.os, results.node.version, results.python.version);
    state.markPhaseCompleted('preflight', { checks: results, platform });
    return {
      phase: 'preflight',
      status: 'completed',
      progress: state.getCompletionPercentage() + '%',
      message: 'All pre-flight checks passed',
      details: results,
      platform,
      next_phase: state.getNextPhase()
    };
  } else {
    state.markPhaseFailed('preflight', issues.join('; '));
    return {
      phase: 'preflight',
      status: 'failed',
      progress: state.getCompletionPercentage() + '%',
      message: 'Pre-flight checks failed',
      issues,
      details: results,
      suggestion: 'Install missing dependencies before continuing'
    };
  }
}

/**
 * Phase: system_packages - Install optional packages
 */
async function runSystemPackages(state) {
  const installer = new SystemPackagesInstaller();
  const status = installer.getStatus();

  const allInstalled = Object.values(status).every(v => v);

  if (allInstalled) {
    state.markPhaseCompleted('system_packages', { packages: status });
    return {
      phase: 'system_packages',
      status: 'completed',
      progress: state.getCompletionPercentage() + '%',
      message: 'All system packages already installed',
      packages: status,
      next_phase: state.getNextPhase()
    };
  }

  // Return what needs to be installed - Claude will ask user
  const missing = Object.entries(status).filter(([_, installed]) => !installed).map(([pkg]) => pkg);

  return {
    phase: 'system_packages',
    status: 'needs_input',
    progress: state.getCompletionPercentage() + '%',
    message: 'Some packages are not installed',
    installed: Object.entries(status).filter(([_, v]) => v).map(([k]) => k),
    missing,
    packages: status,
    suggestion: `Run: node ${path.relative(process.cwd(), __dirname)}/installers/system-packages.cjs install`,
    skip_allowed: true
  };
}

/**
 * Phase: env_file - Create .env template
 *
 * SAFETY: Never overwrite an existing .env that has real credentials.
 * Uses env-guard to count credentials instead of checking for specific key names.
 */
async function runEnvFile(state) {
  const envFile = getEnvFile();
  if (fs.existsSync(envFile)) {
    // Fix CRLF if present (silent, non-destructive)
    fixCrlf(envFile);

    const { vars } = parseEnvFile(envFile);
    const realCount = countRealCredentials(vars);

    if (realCount > 0) {
      // File has real credentials - mark completed, never touch it
      state.markPhaseCompleted('env_file', { existed: true, credentialCount: realCount });
      return {
        phase: 'env_file',
        status: 'completed',
        progress: state.getCompletionPercentage() + '%',
        message: `.env file exists with ${realCount} credential(s)`,
        next_phase: state.getNextPhase()
      };
    }

    // File exists but is empty/all placeholders - tell user to fill it in, but DO NOT overwrite
    return {
      phase: 'env_file',
      status: 'needs_input',
      progress: state.getCompletionPercentage() + '%',
      message: '.env file exists but has no real credentials',
      file: envFile,
      suggestion: 'Fill in your API credentials in the .env file, then run credentials validation',
      required_keys: ['ATLASSIAN_EMAIL', 'JIRA_API_KEY', 'GITHUB_PERSONAL_ACCESS_TOKEN', 'GEMINI_API_KEY'],
      optional_keys: ['POSTHOG_API_KEY', 'GOOGLE_CLIENT_ID', 'SLACK_BOT_TOKEN', 'FIGMA_PERSONAL_ACCESS_TOKEN']
    };
  }

  // No .env file exists at all - create template using safe write
  const template = `# PM AI System Configuration
# Fill in your API credentials below
# See SETUP.md for detailed credential acquisition guides

# =============================================================================
# REQUIRED CREDENTIALS
# =============================================================================

# Atlassian (Jira/Confluence)
# Get token: https://id.atlassian.com/manage-profile/security/api-tokens
# Format: your-email@company.com
ATLASSIAN_EMAIL=
# Format: alphanumeric string (e.g., AbCdEf123456...)
JIRA_API_KEY=
ATLASSIAN_URL=https://yourcompany.atlassian.net

# GitHub Personal Access Token
# Get token: https://github.com/settings/tokens (needs repo, read:org scopes)
# Format: ghp_xxxxxxxxxxxx (classic) or github_pat_xxxx (fine-grained)
GITHUB_PERSONAL_ACCESS_TOKEN=

# Google AI (Gemini) - Required for transcript processing
# Get key: https://aistudio.google.com/apikey
# Format: AIzaSy... (39 characters)
GEMINI_API_KEY=

# =============================================================================
# OPTIONAL MCP INTEGRATIONS
# =============================================================================

# PostHog Analytics
# Get key: PostHog > Settings > Personal API Keys
# Format: phx_xxxxxxxxxxxxxxxx (bare key, no Bearer prefix needed)
# Optional custom endpoint for EU region or self-hosted:
# POSTHOG_MCP_ENDPOINT=https://eu.mcp.posthog.com/sse
POSTHOG_API_KEY=

# Google OAuth (for Sheets/Drive/Gmail/Calendar)
# See SETUP.md section 5 for setup guide
# Format: xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Slack Bot Token (used by CLI at .ai/scripts/slack-api.cjs)
# Get token: https://api.slack.com/apps > OAuth & Permissions
# Format: xoxb-xxxx-xxxx-xxxx
SLACK_BOT_TOKEN=

# Figma Personal Access Token
# Get token: https://www.figma.com/settings > Personal Access Tokens
# Format: figd_xxxxxxxxxxxx
FIGMA_PERSONAL_ACCESS_TOKEN=

# Customer.io MCP (set to true to enable)
# Accepts: true, false, 1, 0, yes, no, on, off, enabled, disabled
CUSTOMERIO_ENABLED=false

# Zapier MCP URL
# Get URL: https://zapier.com/app/settings/mcp (requires Pro plan or higher)
# Format: https://actions.zapier.com/mcp/xxxxx (must be HTTPS, zapier.com domain)
ZAPIER_MCP_URL=

# Intercom Token
# Get token: Intercom > Settings > Developer Hub > API Keys
# Format: alphanumeric string (no Bearer prefix needed)
INTERCOM_TOKEN=

# Zendesk Support
# Get token: Zendesk Admin > Apps > API > Token
# Subdomain format: yourcompany (from yourcompany.zendesk.com)
ZENDESK_SUBDOMAIN=
ZENDESK_EMAIL=
# Token format: alphanumeric string
ZENDESK_TOKEN=

# v0 (Vercel AI UI Generator)
# Get token: https://v0.dev/chat > Settings > API
V0_API_KEY=
`;

  safeWriteEnvFile(envFile, template, { force: true });

  return {
    phase: 'env_file',
    status: 'needs_input',
    progress: state.getCompletionPercentage() + '%',
    message: 'Created .env template file',
    file: envFile,
    suggestion: 'Fill in your API credentials in the .env file, then run credentials validation',
    required_keys: ['ATLASSIAN_EMAIL', 'JIRA_API_KEY', 'GITHUB_PERSONAL_ACCESS_TOKEN', 'GEMINI_API_KEY'],
    optional_keys: ['POSTHOG_API_KEY', 'GOOGLE_CLIENT_ID', 'SLACK_BOT_TOKEN', 'FIGMA_PERSONAL_ACCESS_TOKEN']
  };
}

// loadEnvFile() is defined at top of file

/**
 * Mask a credential value for safe display in logs/JSON output.
 * Shows only a short prefix for identification - never reveals the tail.
 */
function maskCred(val) {
  if (!val || val.length < 4) return '***';
  return val.slice(0, 4) + '...[redacted]';
}

/**
 * Phase: credentials - Validate API credentials
 */
async function runCredentials(state) {
  const env = loadEnvFile();
  const results = {};
  const issues = [];

  // Check each credential
  const checks = [
    { key: 'GEMINI_API_KEY', name: 'Gemini', required: true },
    { key: 'GITHUB_PERSONAL_ACCESS_TOKEN', name: 'GitHub', required: true },
    { key: 'JIRA_API_KEY', name: 'Atlassian', required: true, also: 'ATLASSIAN_EMAIL' },
    { key: 'POSTHOG_API_KEY', name: 'PostHog', required: false }
  ];

  for (const check of checks) {
    const value = env[check.key];
    const hasValue = value && value.length > 0;

    if (check.also) {
      const alsoValue = env[check.also];
      results[check.name.toLowerCase()] = {
        configured: hasValue && alsoValue && alsoValue.length > 0,
        key: check.key
      };
    } else {
      results[check.name.toLowerCase()] = {
        configured: hasValue,
        key: check.key
      };
    }

    if (check.required && !results[check.name.toLowerCase()].configured) {
      issues.push(`${check.name}: ${check.key} not set`);
    }
  }

  if (issues.length > 0) {
    return {
      phase: 'credentials',
      status: 'needs_input',
      progress: state.getCompletionPercentage() + '%',
      message: 'Some required credentials are missing',
      credentials: results,
      issues,
      suggestion: 'Add missing credentials to .env file',
      env_file: getEnvFile()
    };
  }

  // All credentials present - run validators to test API connections
  const validatorDir = path.join(__dirname, 'validators');
  const validatorConfigs = {
    gemini: { script: 'gemini-validator.cjs', args: [env.GEMINI_API_KEY] },
    github: { script: 'github-validator.cjs', args: [env.GITHUB_PERSONAL_ACCESS_TOKEN] },
    atlassian: { script: 'atlassian-validator.cjs', args: [env.ATLASSIAN_EMAIL, env.JIRA_API_KEY] }
  };

  // Run each validator using execFileSync (no shell) to prevent command injection
  const validationResults = {};
  for (const [name, config] of Object.entries(validatorConfigs)) {
    try {
      execFileSync('node', [path.join(validatorDir, config.script), ...config.args], {
        stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000
      });
      validationResults[name] = { status: 'pass' };
    } catch (err) {
      validationResults[name] = {
        status: 'fail',
        error: err.stderr ? err.stderr.toString().trim() : err.message
      };
    }
  }

  return {
    phase: 'credentials',
    status: 'ready_to_validate',
    progress: state.getCompletionPercentage() + '%',
    message: 'All required credentials configured - ready to validate',
    credentials: results,
    suggestion: 'Run validators to test API connections',
    validators: validationResults
  };
}

/**
 * Phase: google_oauth - Set up Google OAuth
 */
async function runGoogleOAuth(state) {
  const env = loadEnvFile();

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    state.markPhaseSkipped('google_oauth', 'Google OAuth credentials not configured');
    return {
      phase: 'google_oauth',
      status: 'skipped',
      progress: state.getCompletionPercentage() + '%',
      message: 'Google OAuth not configured (optional)',
      suggestion: 'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env to enable Sheets/Drive',
      next_phase: state.getNextPhase()
    };
  }

  // Check if tokens already exist
  const tokenFile = path.join(__dirname, '.google-tokens.json');
  if (fs.existsSync(tokenFile)) {
    state.markPhaseCompleted('google_oauth', { token_file: tokenFile });
    return {
      phase: 'google_oauth',
      status: 'completed',
      progress: state.getCompletionPercentage() + '%',
      message: 'Google OAuth tokens already configured',
      next_phase: state.getNextPhase()
    };
  }

  return {
    phase: 'google_oauth',
    status: 'needs_input',
    progress: state.getCompletionPercentage() + '%',
    message: 'Google OAuth needs browser authorization',
    suggestion: `Run: node ${path.join(__dirname, 'google-auth-setup.cjs')}`,
    skip_allowed: true
  };
}

/**
 * Phase: mcp_config - Generate MCP configuration
 *
 * Uses MCPGenerator class to generate MCP config from credentials.
 */
async function runMcpConfig(state) {
  const mcpFile = path.join(PM_DIR, '.claude/mcp.json');
  const envFile = findEnvFile();

  try {
    // Use MCPGenerator to generate config (single source of truth)
    const generator = new MCPGenerator(envFile);
    const result = generator.writeConfig(mcpFile, true);  // merge with existing
    const { config, skippedServers, serverCount } = result;
    const summary = generator.getSummary();

    // Log which servers were configured
    const enabledServers = Object.entries(summary)
      .filter(([_, enabled]) => enabled)
      .map(([name]) => name);

    // Build warnings array for skipped servers
    const warnings = skippedServers.map(({ server, reason }) =>
      `${server}: ${reason}`
    );

    state.markPhaseCompleted('mcp_config', {
      servers: Object.keys(config.mcpServers),
      file: mcpFile,
      skippedServers: skippedServers.length > 0 ? skippedServers : undefined
    });

    const response = {
      phase: 'mcp_config',
      status: 'completed',
      progress: state.getCompletionPercentage() + '%',
      message: `Generated MCP config with ${serverCount} servers`,
      servers: Object.keys(config.mcpServers),
      file: mcpFile,
      next_phase: state.getNextPhase()
    };

    // Add warnings if any servers were skipped
    if (warnings.length > 0) {
      response.warnings = warnings;
      response.message += ` (${warnings.length} skipped due to validation errors)`;
    }

    return response;
  } catch (error) {
    return {
      phase: 'mcp_config',
      status: 'error',
      progress: state.getCompletionPercentage() + '%',
      message: `Failed to write MCP config: ${error.message}`,
      error: error.message
    };
  }
}

/**
 * Phase: slash_commands - Install slash commands
 */
async function runSlashCommands(state) {
  const commandsDir = path.join(PM_DIR, '.claude/commands');

  // Check if commands exist
  const requiredCommands = ['pm-ai.md', 'pm-coach.md', 'pm-analyze.md', 'pm-daily.md'];
  const existing = requiredCommands.filter(cmd => fs.existsSync(path.join(commandsDir, cmd)));

  if (existing.length === requiredCommands.length) {
    state.markPhaseCompleted('slash_commands', { commands: existing });
    return {
      phase: 'slash_commands',
      status: 'completed',
      progress: state.getCompletionPercentage() + '%',
      message: `${existing.length} slash commands already installed`,
      commands: existing,
      next_phase: state.getNextPhase()
    };
  }

  // Run the installer
  try {
    execSync(`node ${path.join(__dirname, 'installers/slash-commands-installer.cjs')} install`, {
      stdio: 'pipe',
      cwd: PM_DIR
    });

    const installed = fs.readdirSync(commandsDir).filter(f => f.endsWith('.md'));
    state.markPhaseCompleted('slash_commands', { commands: installed });

    return {
      phase: 'slash_commands',
      status: 'completed',
      progress: state.getCompletionPercentage() + '%',
      message: `Installed ${installed.length} slash commands`,
      commands: installed,
      next_phase: state.getNextPhase()
    };
  } catch (error) {
    state.markPhaseFailed('slash_commands', error.message);
    return {
      phase: 'slash_commands',
      status: 'failed',
      progress: state.getCompletionPercentage() + '%',
      message: 'Failed to install slash commands',
      error: error.message,
      suggestion: 'Check file permissions and try again'
    };
  }
}

/**
 * Phase: analytics - Initialize analytics database
 */
async function runAnalytics(state) {
  const dbPath = path.join(process.env.HOME, '.pm-ai/chats.db');

  // Check if already initialized
  if (fs.existsSync(dbPath)) {
    state.markPhaseCompleted('analytics', { database: dbPath });
    return {
      phase: 'analytics',
      status: 'completed',
      progress: state.getCompletionPercentage() + '%',
      message: 'Analytics database already exists',
      database: dbPath,
      next_phase: state.getNextPhase()
    };
  }

  // Try .js first (ESM), then .cjs (CommonJS)
  const analyticsScripts = [
    path.join(__dirname, 'pm-analytics.js'),
    path.join(__dirname, 'pm-analytics.cjs')
  ];

  const analyticsScript = analyticsScripts.find(s => fs.existsSync(s));

  if (!analyticsScript) {
    return {
      phase: 'analytics',
      status: 'needs_input',
      progress: state.getCompletionPercentage() + '%',
      message: 'Analytics script not found',
      suggestion: 'Skip this optional phase',
      skip_allowed: true,
      next_phase: state.getNextPhase()
    };
  }

  try {
    execSync(`node ${analyticsScript} init`, { stdio: 'pipe', cwd: PM_DIR });
    state.markPhaseCompleted('analytics', { initialized: true, database: dbPath });

    return {
      phase: 'analytics',
      status: 'completed',
      progress: state.getCompletionPercentage() + '%',
      message: 'Analytics database initialized',
      database: dbPath,
      next_phase: state.getNextPhase()
    };
  } catch (error) {
    return {
      phase: 'analytics',
      status: 'failed',
      progress: state.getCompletionPercentage() + '%',
      message: 'Analytics initialization failed',
      error: error.message,
      suggestion: `Try manually: node ${analyticsScript} init`,
      skip_allowed: true,
      next_phase: state.getNextPhase()
    };
  }
}

/**
 * Phase: daemon - Install background daemon
 */
async function runDaemon(state) {
  const env = loadEnvFile();
  const daemonInstaller = path.join(__dirname, 'installers/daemon-installer.cjs');

  // Check if already running
  try {
    execSync('launchctl list | grep com.cloaked.pm-enrichment', { stdio: 'pipe' });
    state.markPhaseCompleted('daemon', { running: true });
    return {
      phase: 'daemon',
      status: 'completed',
      progress: state.getCompletionPercentage() + '%',
      message: 'Background daemon already running',
      next_phase: state.getNextPhase()
    };
  } catch {
    // Not running, continue
  }

  // Check prerequisites - but don't auto-skip, ask user
  if (!env.GEMINI_API_KEY) {
    return {
      phase: 'daemon',
      status: 'needs_input',
      progress: state.getCompletionPercentage() + '%',
      message: 'Daemon requires GEMINI_API_KEY (not found in .env)',
      missing: 'GEMINI_API_KEY',
      env_file: getEnvFile(),
      suggestion: 'Add GEMINI_API_KEY to .env, or skip this optional phase',
      skip_allowed: true,
      next_phase: state.getNextPhase()
    };
  }

  if (!fs.existsSync(daemonInstaller)) {
    return {
      phase: 'daemon',
      status: 'needs_input',
      progress: state.getCompletionPercentage() + '%',
      message: 'Daemon installer not found',
      suggestion: 'Skip this optional phase',
      skip_allowed: true,
      next_phase: state.getNextPhase()
    };
  }

  // Ready to install
  try {
    execSync(`node ${daemonInstaller} install`, { stdio: 'pipe', env: { ...process.env, ...env } });
    state.markPhaseCompleted('daemon', { installed: true });
    return {
      phase: 'daemon',
      status: 'completed',
      progress: state.getCompletionPercentage() + '%',
      message: 'Background daemon installed and started',
      next_phase: state.getNextPhase()
    };
  } catch (error) {
    return {
      phase: 'daemon',
      status: 'failed',
      progress: state.getCompletionPercentage() + '%',
      message: 'Failed to install daemon',
      error: error.message,
      suggestion: `Try manually: node ${daemonInstaller} install`,
      skip_allowed: true,
      next_phase: state.getNextPhase()
    };
  }
}

/**
 * Phase: shell_alias - Add shell alias
 */
async function runShellAlias(state) {
  const shellRc = process.env.SHELL?.includes('zsh') ?
    path.join(process.env.HOME, '.zshrc') :
    path.join(process.env.HOME, '.bashrc');

  if (fs.existsSync(shellRc)) {
    const content = fs.readFileSync(shellRc, 'utf8');
    if (content.includes('pm-claude')) {
      state.markPhaseCompleted('shell_alias', { file: shellRc, alias: 'pm-claude' });
      return {
        phase: 'shell_alias',
        status: 'completed',
        progress: state.getCompletionPercentage() + '%',
        message: 'pm-claude alias already configured',
        next_phase: state.getNextPhase()
      };
    }
  }

  // Add alias
  const aliasCode = `
# Cloaked PM AI System - Quick launch
pm-claude() {
    cd "${PM_DIR}" && claude .
}
`;

  fs.appendFileSync(shellRc, aliasCode);
  state.markPhaseCompleted('shell_alias', { file: shellRc, alias: 'pm-claude' });

  return {
    phase: 'shell_alias',
    status: 'completed',
    progress: state.getCompletionPercentage() + '%',
    message: 'Added pm-claude alias',
    file: shellRc,
    suggestion: `Run: source ${shellRc}`,
    next_phase: state.getNextPhase()
  };
}

/**
 * Phase: pm_shortcut - Add pm quick launch alias
 */
async function runPmShortcut(state) {
  const shellRc = process.env.SHELL?.includes('zsh') ?
    path.join(process.env.HOME, '.zshrc') :
    path.join(process.env.HOME, '.bashrc');

  if (fs.existsSync(shellRc)) {
    const content = fs.readFileSync(shellRc, 'utf8');
    if (content.includes('alias pm=')) {
      state.markPhaseCompleted('pm_shortcut', { file: shellRc, alias: 'pm' });
      return {
        phase: 'pm_shortcut',
        status: 'completed',
        progress: state.getCompletionPercentage() + '%',
        message: '"pm" shortcut already configured',
        next_phase: null
      };
    }
  }

  // Run the installer script
  const installerScript = path.join(__dirname, 'install-pm-alias.sh');

  if (fs.existsSync(installerScript)) {
    try {
      execSync(`bash ${installerScript}`, { stdio: 'pipe' });
      state.markPhaseCompleted('pm_shortcut', { file: shellRc, alias: 'pm' });

      return {
        phase: 'pm_shortcut',
        status: 'completed',
        progress: state.getCompletionPercentage() + '%',
        message: 'Added "pm" quick launch alias',
        file: shellRc,
        usage: 'Type "pm" from anywhere to launch Claude Code with /pm-ai',
        suggestion: `Run: source ${shellRc}`,
        next_phase: null
      };
    } catch (error) {
      // Fall through to manual add
    }
  }

  // Manual add
  const aliasCode = `
# PM AI quick launch
alias pm='cd "${PM_DIR}" && claude "/pm-ai"'
`;

  fs.appendFileSync(shellRc, aliasCode);
  state.markPhaseCompleted('pm_shortcut', { file: shellRc, alias: 'pm' });

  return {
    phase: 'pm_shortcut',
    status: 'completed',
    progress: state.getCompletionPercentage() + '%',
    message: 'Added "pm" quick launch alias',
    file: shellRc,
    usage: 'Type "pm" from anywhere to launch Claude Code with /pm-ai',
    suggestion: `Run: source ${shellRc}`,
    next_phase: state.getNextPhase()
  };
}

/**
 * Phase: ralph - Install Ralph Orchestrator
 */
async function runRalph(state) {
  // Check if already installed
  try {
    execSync('which ralph', { stdio: 'pipe' });
    const version = execSync('ralph --version 2>/dev/null || echo "installed"', { encoding: 'utf8' }).trim();
    state.markPhaseCompleted('ralph', { version });
    return {
      phase: 'ralph',
      status: 'completed',
      progress: state.getCompletionPercentage() + '%',
      message: `Ralph already installed (${version})`,
      next_phase: state.getNextPhase()
    };
  } catch {
    // Not installed, continue with installation instructions
  }

  // Ralph requires Python 3.10+ and is installed from GitHub (not pip)
  return {
    phase: 'ralph',
    status: 'needs_input',
    progress: state.getCompletionPercentage() + '%',
    message: 'Ralph Orchestrator not installed',
    requirements: 'Requires Python 3.10+',
    instructions: [
      'git clone https://github.com/mikeyobrien/ralph-orchestrator.git',
      'cd ralph-orchestrator',
      'uv sync  # or: python -m pip install -e .'
    ],
    docs: 'https://mikeyobrien.github.io/ralph-orchestrator/installation/',
    suggestion: 'Install from GitHub (not available on PyPI), or skip this optional phase',
    skip_allowed: true,
    next_phase: state.getNextPhase()
  };
}

/**
 * Phase: menubar - Install and launch PM Menu Bar App
 */
async function runMenuBar(state) {
  const appPaths = [
    '/Applications/PMMenuBar.app',
    path.join(process.env.HOME, 'Applications/PMMenuBar.app'),
    path.join(process.env.HOME, '.pm-ai/bin/PMMenuBar')
  ];
  const buildDir = path.join(PM_DIR, 'MenuBarApp');

  // Check if app exists in any location
  const appPath = appPaths.find(p => fs.existsSync(p));
  if (appPath) {
    // Check if running
    try {
      execSync('pgrep -x PMMenuBar', { stdio: 'pipe' });
      state.markPhaseCompleted('menubar', { path: appPath, running: true });
      return {
        phase: 'menubar',
        status: 'completed',
        progress: state.getCompletionPercentage() + '%',
        message: 'PM Menu Bar already installed and running',
        path: appPath,
        next_phase: state.getNextPhase()
      };
    } catch {
      // Not running, launch it
      try {
        if (appPath.endsWith('.app')) {
          execSync(`open "${appPath}"`, { stdio: 'pipe' });
        } else {
          execSync(`"${appPath}" &`, { stdio: 'pipe' });
        }
        state.markPhaseCompleted('menubar', { path: appPath, launched: true });
        return {
          phase: 'menubar',
          status: 'completed',
          progress: state.getCompletionPercentage() + '%',
          message: 'PM Menu Bar launched',
          path: appPath,
          next_phase: state.getNextPhase()
        };
      } catch (error) {
        return {
          phase: 'menubar',
          status: 'failed',
          progress: state.getCompletionPercentage() + '%',
          message: 'Failed to launch PM Menu Bar',
          error: error.message,
          path: appPath,
          next_phase: state.getNextPhase()
        };
      }
    }
  }

  // Check if build exists
  if (!fs.existsSync(buildDir)) {
    return {
      phase: 'menubar',
      status: 'needs_input',
      progress: state.getCompletionPercentage() + '%',
      message: 'Menu Bar App source not found',
      suggestion: 'Skip this optional phase (macOS only)',
      skip_allowed: true,
      next_phase: state.getNextPhase()
    };
  }

  return {
    phase: 'menubar',
    status: 'needs_input',
    progress: state.getCompletionPercentage() + '%',
    message: 'PM Menu Bar App not installed',
    suggestion: 'Build and install from MenuBarApp/ directory, or skip',
    instructions: 'See MenuBarApp/BUILDING.md for build instructions',
    skip_allowed: true,
    next_phase: state.getNextPhase()
  };
}

/**
 * Run a specific phase
 */
async function runPhase(phaseName, state) {
  const handlers = {
    preflight: runPreflight,
    system_packages: runSystemPackages,
    env_file: runEnvFile,
    credentials: runCredentials,
    google_oauth: runGoogleOAuth,
    mcp_config: runMcpConfig,
    slash_commands: runSlashCommands,
    analytics: runAnalytics,
    daemon: runDaemon,
    shell_alias: runShellAlias,
    pm_shortcut: runPmShortcut,
    ralph: runRalph,
    menubar: runMenuBar
  };

  const handler = handlers[phaseName];
  if (!handler) {
    trackError('setup_unknown_phase', { phase: phaseName });
    return {
      phase: phaseName,
      status: 'error',
      message: `Unknown phase: ${phaseName}`,
      valid_phases: PHASE_ORDER
    };
  }

  state.markPhaseStarted(phaseName);
  const startTime = Date.now();
  const result = await handler(state);

  // Track phase completion
  track('setup_phase_complete', {
    phase: phaseName,
    status: result.status,
    duration_ms: Date.now() - startTime
  });

  return result;
}

/**
 * Get current status
 */
function getStatus(state) {
  const summary = state.getSummary();
  const nextPhase = state.getNextPhase();
  const progress = state.getCompletionPercentage();

  const phases = PHASE_ORDER.map(name => ({
    name,
    title: PHASES[name].name,
    description: PHASES[name].description,
    status: summary[name],
    required: PHASES[name].required
  }));

  return {
    progress: progress + '%',
    next_phase: nextPhase,
    can_resume: state.canResume(),
    phases,
    platform: state.data.platform,
    started_at: state.data.started_at,
    last_updated: state.data.last_updated
  };
}

/**
 * Main CLI handler
 */
async function main() {
  const startTime = Date.now();
  const command = process.argv[2];
  const arg = process.argv[3];
  trackScript('setup-wizard', command || 'help', { phase: arg });

  if (!command || command === 'help') {
    output({
      usage: 'node setup-wizard.cjs <command>',
      commands: {
        status: 'Show current setup progress',
        next: 'Run the next pending phase',
        'run <phase>': 'Run a specific phase',
        reset: 'Clear state and start over',
        help: 'Show this help'
      },
      phases: PHASES
    });
    return;
  }

  const state = SetupState.load();

  switch (command) {
    case 'status':
      output(getStatus(state));
      break;

    case 'next': {
      const nextPhase = state.getNextPhase();
      if (!nextPhase) {
        output({
          status: 'complete',
          progress: '100%',
          message: 'All setup phases complete!',
          suggestion: 'Run: source ~/.zshrc && pm'
        });
      } else {
        const result = await runPhase(nextPhase, state);
        output(result);
      }
      break;
    }

    case 'run':
      if (!arg) {
        output({
          status: 'error',
          message: 'Phase name required',
          usage: 'node setup-wizard.cjs run <phase>',
          valid_phases: PHASE_ORDER
        });
      } else {
        const result = await runPhase(arg, state);
        output(result);
      }
      break;

    case 'reset':
      SetupState.clear();
      output({
        status: 'reset',
        message: 'Setup state cleared',
        suggestion: 'Run: node setup-wizard.cjs next'
      });
      break;

    case 'skip':
      if (!arg) {
        output({
          status: 'error',
          message: 'Phase name required',
          usage: 'node setup-wizard.cjs skip <phase>'
        });
      } else {
        state.markPhaseSkipped(arg, 'User skipped');
        output({
          phase: arg,
          status: 'skipped',
          progress: state.getCompletionPercentage() + '%',
          next_phase: state.getNextPhase()
        });
      }
      break;

    case 'complete':
      if (!arg) {
        output({
          status: 'error',
          message: 'Phase name required',
          usage: 'node setup-wizard.cjs complete <phase>'
        });
      } else {
        state.markPhaseCompleted(arg, { manual: true });
        output({
          phase: arg,
          status: 'completed',
          progress: state.getCompletionPercentage() + '%',
          next_phase: state.getNextPhase()
        });
      }
      break;

    case 'verify': {
      // Verify existing setup without modifying state
      const results = await verifySetup();
      output(results);
      break;
    }

    default:
      output({
        status: 'error',
        message: `Unknown command: ${command}`,
        valid_commands: ['status', 'next', 'run', 'reset', 'skip', 'complete', 'verify', 'help']
      });
  }
}

/**
 * Verify existing setup - checks all components without modifying state
 */
async function verifySetup() {
  const env = loadEnvFile();
  const checks = [];
  let healthy = true;

  // Check credentials
  const requiredCreds = ['GEMINI_API_KEY', 'JIRA_API_KEY', 'ATLASSIAN_EMAIL'];
  for (const key of requiredCreds) {
    const present = env[key] && env[key].length > 0;
    checks.push({
      component: `Credential: ${key}`,
      status: present ? 'ok' : 'missing',
      location: present ? getEnvFile() : null
    });
    if (!present) healthy = false;
  }

  // Check Google OAuth
  const googleTokens = path.join(__dirname, '.google-token.json');
  checks.push({
    component: 'Google OAuth',
    status: fs.existsSync(googleTokens) ? 'ok' : 'not_configured',
    location: googleTokens
  });

  // Check analytics database
  const dbPath = path.join(process.env.HOME, '.pm-ai/chats.db');
  checks.push({
    component: 'Analytics Database',
    status: fs.existsSync(dbPath) ? 'ok' : 'not_initialized',
    location: dbPath
  });

  // Check daemon
  let daemonRunning = false;
  try {
    execSync('launchctl list | grep com.cloaked.pm-enrichment', { stdio: 'pipe' });
    daemonRunning = true;
  } catch {}
  checks.push({
    component: 'Background Daemon',
    status: daemonRunning ? 'running' : 'not_running'
  });

  // Check menu bar app
  let menubarRunning = false;
  try {
    execSync('pgrep -x PMMenuBar', { stdio: 'pipe' });
    menubarRunning = true;
  } catch {}
  checks.push({
    component: 'Menu Bar App',
    status: menubarRunning ? 'running' : 'not_running'
  });

  // Check shell aliases
  const shellRc = process.env.SHELL?.includes('zsh') ?
    path.join(process.env.HOME, '.zshrc') :
    path.join(process.env.HOME, '.bashrc');
  let aliasConfigured = false;
  if (fs.existsSync(shellRc)) {
    const content = fs.readFileSync(shellRc, 'utf8');
    aliasConfigured = content.includes('pm-claude') || content.includes('alias pm=');
  }
  checks.push({
    component: 'Shell Aliases',
    status: aliasConfigured ? 'configured' : 'not_configured',
    file: shellRc
  });

  // Check MCP config
  const mcpConfig = path.join(PM_DIR, '.claude/mcp.json');
  checks.push({
    component: 'MCP Configuration',
    status: fs.existsSync(mcpConfig) ? 'configured' : 'not_found',
    file: mcpConfig
  });

  return {
    status: healthy ? 'healthy' : 'issues_found',
    env_file: getEnvFile(),
    checks,
    summary: {
      total: checks.length,
      ok: checks.filter(c => c.status === 'ok' || c.status === 'running' || c.status === 'configured').length,
      issues: checks.filter(c => c.status === 'missing' || c.status === 'not_found').length,
      optional: checks.filter(c => c.status === 'not_configured' || c.status === 'not_running' || c.status === 'not_initialized').length
    }
  };
}

main()
  .then(() => flush())
  .catch(async error => {
    trackError('setup_fatal', { error: error.message });
    await flush();
    output({
      status: 'error',
      message: error.message,
      stack: process.env.DEBUG ? error.stack : undefined
    });
    process.exit(1);
  });
