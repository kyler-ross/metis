#!/usr/bin/env node
/**
 * Structured Output - Consistent logging and reporting for PM AI scripts
 *
 * Used by script-runner.cjs internally, also available standalone.
 *
 * Output conventions:
 * - Errors, warnings, info go to STDERR (keeps stdout clean for data)
 * - Data/results go to STDOUT
 * - --json flag produces machine-parseable output
 *
 * Usage:
 *   const { log, report, formatError } = require('./structured-output.cjs');
 *
 *   log.info('Processing 42 experiments');
 *   log.warn('Google OAuth token expires in 2 hours');
 *   log.error('Jira API returned 401', { service: 'jira', recovery: ['Check JIRA_API_KEY'] });
 *
 *   // Diagnostic summary
 *   report({
 *     errors: [{ message: 'Jira auth failed', service: 'jira' }],
 *     warnings: [{ message: 'PostHog key not set', service: 'posthog' }],
 *     ok: [{ message: 'Google OAuth valid', service: 'google' }],
 *   });
 */

const { categorizeError, getErrorGuidance } = require('./error-categories.cjs');

// Check if --json flag is present in argv
const JSON_MODE = process.argv.includes('--json');

// ANSI colors for terminal output
const C = {
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

// Detect if stderr is a TTY (disable colors if piped)
const USE_COLOR = process.stderr.isTTY === true;
const c = (code, text) => USE_COLOR ? `${code}${text}${C.reset}` : text;

/**
 * Format a structured log line for stderr
 */
function formatLogLine(level, message, meta = {}) {
  if (JSON_MODE) {
    return JSON.stringify({ level, message, ...meta, timestamp: new Date().toISOString() });
  }

  const prefixes = {
    error: c(C.red, '[ERROR]'),
    warn: c(C.yellow, '[WARN]'),
    info: c(C.dim, '[INFO]'),
  };

  const prefix = prefixes[level] || `[${level.toUpperCase()}]`;
  let line = `${prefix} ${message}`;

  // Add service context if present
  if (meta.service) {
    line = `${prefix} ${c(C.dim, `(${meta.service})`)} ${message}`;
  }

  return line;
}

/**
 * Format recovery steps as indented lines
 */
function formatRecovery(steps) {
  if (!steps || steps.length === 0) return '';
  return steps.map(step => `  -> ${step}`).join('\n');
}

/**
 * Structured logger - all output to stderr
 */
const log = {
  info(message, meta = {}) {
    process.stderr.write(formatLogLine('info', message, meta) + '\n');
  },

  warn(message, meta = {}) {
    const line = formatLogLine('warn', message, meta);
    process.stderr.write(line + '\n');
    if (meta.recovery) {
      process.stderr.write(formatRecovery(meta.recovery) + '\n');
    }
  },

  error(message, meta = {}) {
    const line = formatLogLine('error', message, meta);
    process.stderr.write(line + '\n');
    if (meta.recovery) {
      process.stderr.write(formatRecovery(meta.recovery) + '\n');
    }
  },
};

/**
 * Format an Error object into a structured error with categorization and guidance
 *
 * @param {Error} err - Error object
 * @param {string} [service] - Service name for guidance lookup
 * @returns {{ type: string, category: string, message: string, recovery: string[], retryable: boolean }}
 */
function formatError(err, service = null) {
  const cat = categorizeError(err);
  const guidance = getErrorGuidance(cat.type, service);

  return {
    type: cat.type,
    category: cat.category,
    message: err.message || String(err),
    recovery: guidance.recoverySteps || [],
    suggestion: guidance.suggestion || '',
    retryable: cat.retryable,
    service: service || null,
  };
}

/**
 * Log a formatted error with categorization and recovery guidance
 *
 * @param {Error} err - Error object
 * @param {string} [service] - Service name for guidance
 */
function logError(err, service = null) {
  if (!err) {
    log.error('unknown_error: (no error provided)');
    return;
  }
  const formatted = formatError(err, service);

  const typeLabel = `${formatted.type}${service ? ` (${service})` : ''}`;
  log.error(`${typeLabel}: ${formatted.message}`, {
    service,
    recovery: formatted.recovery,
  });
}

/**
 * Report diagnostic results - for health checks, validators, setup scripts
 *
 * @param {{ errors: Array, warnings: Array, ok: Array }} results
 * @param {Object} [options]
 * @param {string} [options.title] - Report title
 */
function report(results, options = {}) {
  const { errors = [], warnings = [], ok = [] } = results;
  const { title } = options;

  if (JSON_MODE) {
    const output = {
      status: errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ok',
      errors,
      warnings,
      ok,
      summary: {
        error_count: errors.length,
        warning_count: warnings.length,
        ok_count: ok.length,
      },
    };
    // Diagnostic JSON goes to stdout for machine consumption
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    return;
  }

  // Helpers to extract fields from mixed string/object items
  const extractMsg = (item) => typeof item === 'string' ? item : (item.message || String(item));
  const extractMeta = (item) => typeof item === 'string' ? {} : { service: item.service, recovery: item.recovery };

  // Human-readable report to stderr
  if (title) {
    process.stderr.write(`\n${c(C.bold, title)}\n`);
  }

  for (const e of errors) {
    log.error(extractMsg(e), extractMeta(e));
  }

  for (const w of warnings) {
    log.warn(extractMsg(w), extractMeta(w));
  }

  for (const o of ok) {
    process.stderr.write(`${c(C.green, '[OK]')} ${extractMsg(o)}\n`);
  }

  // Summary line
  const parts = [];
  if (errors.length > 0) parts.push(c(C.red, `${errors.length} error${errors.length !== 1 ? 's' : ''}`));
  if (warnings.length > 0) parts.push(c(C.yellow, `${warnings.length} warning${warnings.length !== 1 ? 's' : ''}`));
  if (ok.length > 0) parts.push(c(C.green, `${ok.length} ok`));

  process.stderr.write(`\n${parts.join(', ')}\n`);
}

module.exports = {
  log,
  logError,
  formatError,
  report,
  JSON_MODE,
  // Expose for testing
  formatLogLine,
  formatRecovery,
};
