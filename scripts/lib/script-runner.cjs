#!/usr/bin/env node
/**
 * Script Runner - Core wrapper for PM AI scripts
 *
 * Composes existing modules (telemetry, auth-check, structured-output, error-categories)
 * into a single entry point that handles:
 * - Argument parsing and validation
 * - Auth checking via service-definitions
 * - Global error handlers (unhandled rejections/exceptions)
 * - Structured error output with categorization and recovery guidance
 * - Telemetry tracking (start, complete, error)
 * - Exit code management based on mode
 *
 * Modes:
 * - 'diagnostic' -> always exit 0, issues reported in output
 * - 'operational' (default) -> exit 1 on any error
 * - 'ci' -> exit 1 on any error (for GitHub Actions)
 *
 * Usage:
 *   const { run } = require('./lib/script-runner.cjs');
 *
 *   run({
 *     name: 'setup-doctor',
 *     mode: 'diagnostic',
 *     services: ['jira', 'google'],
 *     args: { required: ['command'], optional: ['--json', '--fix'] },
 *   }, async (ctx) => {
 *     // ctx.args - parsed argv
 *     // ctx.log - structured logger (info/warn/error)
 *     // ctx.report() - diagnostic report
 *     // ctx.withRetry() - retry wrapper
 *     const results = await checkIntegrations();
 *     ctx.report(results);
 *   });
 */

const path = require('path');

// Load env with explicit path
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { initScript, trackComplete, trackError, flush } = require('./telemetry.cjs');
const { log, logError, formatError, report, JSON_MODE } = require('./structured-output.cjs');
const { categorizeError, getErrorGuidance } = require('./error-categories.cjs');
const { withRetry } = require('./with-retry.cjs');

/** Default boolean flags that never take a value */
const DEFAULT_BOOLEAN_FLAGS = [
  'json', 'fix', 'dry-run', 'verbose', 'help',
  'check', 'force', 'quiet', 'all', 'debug',
];

/**
 * Parse command-line arguments into a structured object
 *
 * @param {string[]} rawArgs - process.argv.slice(2)
 * @param {{ required: string[], optional: string[], booleanFlags: string[] }} argSpec - Argument specification
 * @returns {{ positional: string[], flags: Object, raw: string[] }}
 */
function parseArgs(rawArgs, argSpec = {}) {
  const positional = [];
  const flags = {};
  const raw = rawArgs;

  // Build known-boolean set from defaults + any extras declared in config
  const knownBooleans = new Set([
    ...DEFAULT_BOOLEAN_FLAGS,
    ...(argSpec.booleanFlags || []),
  ]);

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];

    if (arg === '--') {
      positional.push(...rawArgs.slice(i + 1));
      break;
    }

    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else if (knownBooleans.has(arg.slice(2))) {
        // Boolean flags - always true, never consume the next arg
        flags[arg.slice(2)] = true;
      } else if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('--')) {
        flags[arg.slice(2)] = rawArgs[++i];
      } else {
        flags[arg.slice(2)] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  return { positional, flags, raw };
}

/**
 * Generate a usage message from the arg spec
 */
function generateUsage(name, argSpec) {
  if (!argSpec) return null;

  const parts = [`Usage: ${name}`];
  if (argSpec.required) {
    parts.push(...argSpec.required.map(a => `<${a}>`));
  }
  if (argSpec.optional) {
    parts.push(...argSpec.optional.map(a => `[${a}]`));
  }
  return parts.join(' ');
}

/**
 * Run a script with full lifecycle management
 *
 * @param {Object} config - Script configuration
 * @param {string} config.name - Script name for telemetry and error reporting
 * @param {string} [config.mode='operational'] - Exit code mode: 'diagnostic', 'operational', 'ci'
 * @param {string[]} [config.services=[]] - Required services for auth checking
 * @param {Object} [config.args] - Argument spec: { required: string[], optional: string[], booleanFlags: string[] }
 * @param {string} [config.description] - Script description for --help
 * @param {Function} fn - Async main function receiving context object
 */
async function run(config, fn) {
  const {
    name,
    mode = 'operational',
    services = [],
    args: argSpec = null,
    description = null,
  } = config;

  const rawArgs = process.argv.slice(2);
  const args = parseArgs(rawArgs, argSpec);

  // --help exits before telemetry init (intentional - help should always work even if auth is broken)
  if (args.flags.help) {
    const usage = generateUsage(name, argSpec);
    if (usage) process.stderr.write(usage + '\n');
    if (description) process.stderr.write(description + '\n');
    process.exit(0);
  }

  // Validate required args
  if (argSpec && argSpec.required) {
    // Only validate if there are required positional args and none provided
    if (argSpec.required.length > 0 && args.positional.length < argSpec.required.length && !args.flags.help) {
      const usage = generateUsage(name, argSpec);
      if (usage) process.stderr.write(usage + '\n');
      if (mode === 'diagnostic') {
        process.exit(0);
      } else {
        process.exit(1);
      }
    }
  }

  // Install global error handlers
  let globalErrorHandled = false;

  const handleGlobalError = (err, operation) => {
    if (globalErrorHandled) return;
    globalErrorHandled = true;

    logError(err, services[0] || null);
    trackError(name, err, { operation });

    flush().catch(() => {}).finally(() => {
      process.exit(mode === 'diagnostic' ? 0 : 1);
    });
  };

  process.once('unhandledRejection', (reason) => {
    handleGlobalError(reason instanceof Error ? reason : new Error(String(reason)), 'unhandled_rejection');
  });

  process.once('uncaughtException', (err) => {
    handleGlobalError(err, 'uncaught_exception');
  });

  // Build context object
  const ctx = {
    args,
    log,
    report: (results, options) => report(results, options),
    withRetry: (fn, options = {}) => withRetry(fn, { service: services[0], ...options }),
    name,
    mode,
    services,
  };

  // Initialize telemetry + auth check
  let startTime;
  try {
    startTime = initScript(name, args.positional[0] || 'run', services.length > 0 ? services : null);
  } catch (authErr) {
    // Auth check failed (thrown by auth-check.cjs when exitOnCritical is true)
    if (authErr.code === 'AUTH_CRITICAL') {
      logError(authErr, services[0] || null);

      if (JSON_MODE) {
        const formatted = formatError(authErr, services[0]);
        process.stdout.write(JSON.stringify({
          status: 'error',
          error: formatted,
        }, null, 2) + '\n');
      }

      await flush().catch(() => {});
      process.exit(mode === 'diagnostic' ? 0 : 1);
    }
    // Non-auth errors from initScript - proceed anyway
    startTime = Date.now();
    log.warn(`Telemetry init failed: ${authErr.message}`);
  }

  // Execute the main function
  try {
    await fn(ctx);

    trackComplete(name, startTime, { success: true });
    await flush().catch(() => {});
    // Let Node exit naturally to allow pending I/O to flush
    // (error paths still call process.exit(1) to guarantee non-zero exit)
    process.exitCode = 0;
  } catch (err) {
    if (globalErrorHandled) return;

    // User cancellation is not an error
    if (err && err.isUserCancellation) {
      process.exitCode = 130;
      return;
    }

    globalErrorHandled = true;

    // Categorize and log
    logError(err, services[0] || null);

    // JSON output for machine consumption
    if (JSON_MODE) {
      const formatted = formatError(err, services[0]);
      process.stdout.write(JSON.stringify({
        status: 'error',
        error: formatted,
      }, null, 2) + '\n');
    }

    // Track error in telemetry
    trackError(name, err, {
      operation: args.positional[0] || 'run',
      service: services[0],
    });
    trackComplete(name, startTime, { success: false });

    await flush().catch(() => {});

    // Exit code based on mode
    if (mode === 'diagnostic') {
      process.exit(0);
    } else {
      process.exit(1);
    }
  }
}

module.exports = {
  run,
  parseArgs,
};
