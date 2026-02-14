#!/usr/bin/env node
/**
 * Tests for structured-output.cjs - formatError, formatLogLine, formatRecovery, report
 *
 * Uses Node.js built-in test runner (node:test) and assertions (node:assert).
 * Run with: node --test .ai/evals/js/test-structured-output.cjs
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// Load the module under test
const {
  formatError,
  formatLogLine,
  formatRecovery,
  report,
  log,
  logError,
} = require(path.join(__dirname, '..', '..', 'scripts', 'lib', 'structured-output.cjs'));

// ---- formatError ----

describe('formatError', () => {
  it('categorizes a 401 auth error', () => {
    const err = new Error('Request failed with status 401 Unauthorized');
    err.status = 401;
    const result = formatError(err);

    assert.ok(result.type.includes('auth'), `Expected type to contain "auth", got "${result.type}"`);
    assert.strictEqual(result.category, 'auth');
    assert.strictEqual(result.retryable, false);
    assert.ok(Array.isArray(result.recovery), 'recovery should be an array');
    assert.strictEqual(typeof result.retryable, 'boolean');
    assert.strictEqual(result.service, null);
  });

  it('categorizes a network error (ECONNREFUSED)', () => {
    const err = new Error('connect ECONNREFUSED 127.0.0.1:443');
    err.code = 'ECONNREFUSED';
    const result = formatError(err);

    assert.ok(result.type.includes('network'), `Expected type to contain "network", got "${result.type}"`);
    assert.strictEqual(result.category, 'network');
    assert.strictEqual(result.retryable, true);
  });

  it('returns required fields: type, category, message, recovery, retryable, service', () => {
    const err = new Error('Something went wrong');
    const result = formatError(err);

    assert.ok('type' in result, 'Missing field: type');
    assert.ok('category' in result, 'Missing field: category');
    assert.ok('message' in result, 'Missing field: message');
    assert.ok('recovery' in result, 'Missing field: recovery');
    assert.ok('retryable' in result, 'Missing field: retryable');
    assert.ok('service' in result, 'Missing field: service');
    assert.ok(Array.isArray(result.recovery), 'recovery should be an array');
    assert.strictEqual(typeof result.retryable, 'boolean');
  });

  it('populates service field when service parameter is provided', () => {
    const err = new Error('Auth failed');
    err.status = 401;
    const result = formatError(err, 'jira');

    assert.strictEqual(result.service, 'jira');
    // Service-specific guidance should be present for jira auth
    assert.ok(result.recovery.length > 0, 'Should have recovery steps for jira auth');
  });

  it('sets service to null when no service is provided', () => {
    const err = new Error('generic error');
    const result = formatError(err);
    assert.strictEqual(result.service, null);
  });

  it('categorizes rate limit errors', () => {
    const err = new Error('Rate limit exceeded');
    err.status = 429;
    const result = formatError(err);

    assert.strictEqual(result.type, 'rate_limit');
    assert.strictEqual(result.category, 'throttle');
    assert.strictEqual(result.retryable, true);
  });

  it('categorizes server errors', () => {
    const err = new Error('Internal Server Error');
    err.status = 500;
    const result = formatError(err);

    assert.strictEqual(result.type, 'server_error');
    assert.strictEqual(result.category, 'server');
    assert.strictEqual(result.retryable, true);
  });

  it('categorizes not found errors', () => {
    const err = new Error('Resource not found');
    err.status = 404;
    const result = formatError(err);

    assert.strictEqual(result.type, 'not_found');
    assert.strictEqual(result.category, 'client');
    assert.strictEqual(result.retryable, false);
  });

  it('includes suggestion field', () => {
    const err = new Error('Something broke');
    const result = formatError(err);
    assert.strictEqual(typeof result.suggestion, 'string');
  });
});

// ---- formatLogLine ----

describe('formatLogLine', () => {
  it('produces [ERROR] prefix for error level', () => {
    const line = formatLogLine('error', 'something failed');
    assert.ok(line.includes('[ERROR]'), `Expected "[ERROR]" in: ${line}`);
    assert.ok(line.includes('something failed'), 'Should contain the message');
  });

  it('produces [WARN] prefix for warn level', () => {
    const line = formatLogLine('warn', 'watch out');
    assert.ok(line.includes('[WARN]'), `Expected "[WARN]" in: ${line}`);
  });

  it('produces [INFO] prefix for info level', () => {
    const line = formatLogLine('info', 'all good');
    assert.ok(line.includes('[INFO]'), `Expected "[INFO]" in: ${line}`);
  });

  it('handles unknown level with uppercase brackets', () => {
    const line = formatLogLine('debug', 'trace data');
    assert.ok(line.includes('[DEBUG]'), `Expected "[DEBUG]" in: ${line}`);
  });

  it('adds service context when meta.service is present', () => {
    const line = formatLogLine('error', 'auth failed', { service: 'jira' });
    assert.ok(line.includes('jira'), `Expected "jira" in: ${line}`);
  });

  it('does not add service context when meta.service is absent', () => {
    const line = formatLogLine('info', 'processing', {});
    // Should not have parenthesized service name
    assert.ok(!line.includes('(undefined)'), 'Should not contain (undefined)');
    assert.ok(!line.includes('(null)'), 'Should not contain (null)');
  });
});

// We test JSON mode by requiring the module in a subprocess with --json argv
describe('formatLogLine in JSON mode', () => {
  it('produces valid JSON when --json is in argv (via subprocess)', async () => {
    const { execFile } = require('node:child_process');
    const { promisify } = require('node:util');
    const exec = promisify(execFile);

    // Run a small script that loads structured-output with --json in argv
    const script = `
      // Inject --json into argv before requiring the module
      process.argv.push('--json');
      const mod = require('${path.join(__dirname, '..', '..', 'scripts', 'lib', 'structured-output.cjs').replace(/\\/g, '\\\\')}');
      const line = mod.formatLogLine('error', 'test message', { service: 'google' });
      process.stdout.write(line);
    `;

    const { stdout } = await exec('node', ['-e', script]);
    const parsed = JSON.parse(stdout);

    assert.strictEqual(parsed.level, 'error');
    assert.strictEqual(parsed.message, 'test message');
    assert.strictEqual(parsed.service, 'google');
    assert.ok('timestamp' in parsed, 'JSON mode should include timestamp');
  });
});

// ---- formatRecovery ----

describe('formatRecovery', () => {
  it('returns empty string for empty array', () => {
    assert.strictEqual(formatRecovery([]), '');
  });

  it('returns empty string for null', () => {
    assert.strictEqual(formatRecovery(null), '');
  });

  it('returns empty string for undefined', () => {
    assert.strictEqual(formatRecovery(undefined), '');
  });

  it('formats array of steps with -> prefix', () => {
    const steps = ['Check your API key', 'Run setup again'];
    const result = formatRecovery(steps);

    assert.ok(result.includes('->'), 'Should contain "->" prefix');
    assert.ok(result.includes('Check your API key'), 'Should contain first step');
    assert.ok(result.includes('Run setup again'), 'Should contain second step');
  });

  it('produces indented lines', () => {
    const steps = ['Step 1', 'Step 2'];
    const result = formatRecovery(steps);
    const lines = result.split('\n');

    assert.strictEqual(lines.length, 2);
    assert.ok(lines[0].startsWith('  -> '), `Expected indented arrow, got: "${lines[0]}"`);
    assert.ok(lines[1].startsWith('  -> '), `Expected indented arrow, got: "${lines[1]}"`);
  });

  it('handles single step', () => {
    const result = formatRecovery(['Just one step']);
    assert.strictEqual(result, '  -> Just one step');
  });
});

// ---- report ----

describe('report', () => {
  let stderrOutput;
  let originalStderrWrite;

  beforeEach(() => {
    stderrOutput = '';
    originalStderrWrite = process.stderr.write;
    process.stderr.write = (s) => { stderrOutput += s; return true; };
  });

  afterEach(() => {
    process.stderr.write = originalStderrWrite;
  });

  it('writes errors to stderr', () => {
    report({
      errors: [{ message: 'Jira auth failed', service: 'jira' }],
      warnings: [],
      ok: [],
    });

    assert.ok(stderrOutput.includes('Jira auth failed'), `Expected error message in output: ${stderrOutput}`);
    assert.ok(stderrOutput.includes('1 error'), `Expected "1 error" in summary: ${stderrOutput}`);
  });

  it('writes warnings to stderr', () => {
    report({
      errors: [],
      warnings: [{ message: 'PostHog key not set', service: 'posthog' }],
      ok: [],
    });

    assert.ok(stderrOutput.includes('PostHog key not set'), `Expected warning in output: ${stderrOutput}`);
    assert.ok(stderrOutput.includes('1 warning'), `Expected "1 warning" in summary: ${stderrOutput}`);
  });

  it('writes ok items to stderr', () => {
    report({
      errors: [],
      warnings: [],
      ok: [{ message: 'Google OAuth valid', service: 'google' }],
    });

    assert.ok(stderrOutput.includes('Google OAuth valid'), `Expected ok message in output: ${stderrOutput}`);
    assert.ok(stderrOutput.includes('[OK]'), `Expected "[OK]" prefix: ${stderrOutput}`);
    assert.ok(stderrOutput.includes('1 ok'), `Expected "1 ok" in summary: ${stderrOutput}`);
  });

  it('writes title when provided', () => {
    report({
      errors: [],
      warnings: [],
      ok: [{ message: 'test' }],
    }, { title: 'System Health Check' });

    assert.ok(stderrOutput.includes('System Health Check'), `Expected title in output: ${stderrOutput}`);
  });

  it('handles empty results', () => {
    report({ errors: [], warnings: [], ok: [] });
    // Should not throw, just write a summary line
    assert.ok(stderrOutput.length > 0 || stderrOutput === '\n', 'Should produce some output');
  });

  it('includes recovery steps in error output', () => {
    report({
      errors: [{ message: 'Auth failed', service: 'jira', recovery: ['Check your token'] }],
      warnings: [],
      ok: [],
    });

    assert.ok(stderrOutput.includes('Check your token'), `Expected recovery step: ${stderrOutput}`);
  });
});

// ---- log methods ----

describe('log', () => {
  let stderrOutput;
  let originalStderrWrite;

  beforeEach(() => {
    stderrOutput = '';
    originalStderrWrite = process.stderr.write;
    process.stderr.write = (s) => { stderrOutput += s; return true; };
  });

  afterEach(() => {
    process.stderr.write = originalStderrWrite;
  });

  it('log.info writes to stderr with [INFO]', () => {
    log.info('Processing items');
    assert.ok(stderrOutput.includes('[INFO]'), `Expected [INFO] in: ${stderrOutput}`);
    assert.ok(stderrOutput.includes('Processing items'));
  });

  it('log.warn writes to stderr with [WARN]', () => {
    log.warn('Token expiring soon');
    assert.ok(stderrOutput.includes('[WARN]'), `Expected [WARN] in: ${stderrOutput}`);
  });

  it('log.error writes to stderr with [ERROR]', () => {
    log.error('Connection failed');
    assert.ok(stderrOutput.includes('[ERROR]'), `Expected [ERROR] in: ${stderrOutput}`);
  });

  it('log.warn includes recovery steps when provided', () => {
    log.warn('Token expiring', { recovery: ['Refresh your token'] });
    assert.ok(stderrOutput.includes('Refresh your token'), `Expected recovery in: ${stderrOutput}`);
  });

  it('log.error includes recovery steps when provided', () => {
    log.error('Auth failed', { recovery: ['Check credentials', 'Run setup'] });
    assert.ok(stderrOutput.includes('Check credentials'));
    assert.ok(stderrOutput.includes('Run setup'));
  });
});

// ---- logError ----

describe('logError', () => {
  let stderrOutput;
  const originalWrite = process.stderr.write;

  beforeEach(() => {
    stderrOutput = '';
    process.stderr.write = (chunk) => { stderrOutput += chunk.toString(); };
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
  });

  it('writes error type and message to stderr', () => {
    const err = new Error('connection refused');
    err.code = 'ECONNREFUSED';
    logError(err, null);
    assert.ok(stderrOutput.includes('network'), 'should include error type');
    assert.ok(stderrOutput.includes('connection refused'), 'should include message');
  });

  it('includes service name when provided', () => {
    const err = new Error('unauthorized');
    err.code = 401;
    logError(err, 'jira');
    assert.ok(stderrOutput.includes('jira'), 'should include service name');
  });

  it('includes recovery steps', () => {
    const err = new Error('unauthorized');
    err.code = 401;
    logError(err, 'jira');
    assert.ok(stderrOutput.includes('->'), 'should include recovery steps with arrow prefix');
  });

  it('handles null error gracefully', () => {
    assert.doesNotThrow(() => logError(null, null));
  });
});
