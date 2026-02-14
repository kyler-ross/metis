#!/usr/bin/env node
/**
 * Integration tests for script-runner.cjs run() function
 *
 * Since run() calls process.exit() and installs global handlers, each test
 * spawns a subprocess with a tiny script that exercises a specific behavior.
 *
 * Run with: node --test .ai/evals/js/test-run-integration.cjs
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Absolute path to the runner module
// __dirname is .ai/evals/js, so ../../scripts/lib/ reaches .ai/scripts/lib/
const RUNNER_PATH = path.resolve(__dirname, '..', '..', 'scripts', 'lib', 'script-runner.cjs');

// Shared env for subprocesses: suppress telemetry and avoid .env side effects
const SUBPROCESS_ENV = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  NODE_ENV: 'test',
  PM_AI_TELEMETRY_DISABLED: '1',
};

/**
 * Write a temporary .cjs script and execute it in a subprocess.
 * Uses spawnSync to capture both stdout and stderr regardless of exit code.
 *
 * @param {string} code - Script source code
 * @param {string[]} args - CLI arguments to pass
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 */
function runTestScript(code, args = []) {
  const scriptPath = path.join('/tmp', `test-runner-${Date.now()}-${Math.random().toString(36).slice(2)}.cjs`);
  fs.writeFileSync(scriptPath, code);
  try {
    const result = spawnSync('node', [scriptPath, ...args], {
      timeout: 10000,
      encoding: 'utf8',
      env: SUBPROCESS_ENV,
    });
    return {
      exitCode: result.status ?? 1,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
    };
  } finally {
    try { fs.unlinkSync(scriptPath); } catch {}
  }
}

/**
 * Strip dotenv warning lines from output.
 * dotenv prints "[dotenv@...]" warnings to stdout when .env is missing.
 */
function stripDotenvWarnings(output) {
  return output.split('\n').filter(line => !line.startsWith('[dotenv@')).join('\n');
}

describe('run() integration', () => {
  it('happy path exits 0', () => {
    const result = runTestScript(`
      const { run } = require('${RUNNER_PATH}');
      run({ name: 'test-happy', mode: 'operational', args: {} }, async () => {});
    `);
    assert.strictEqual(result.exitCode, 0, `Expected exit 0 but got ${result.exitCode}. stderr: ${result.stderr}`);
  });

  it('error in operational mode exits 1', () => {
    const result = runTestScript(`
      const { run } = require('${RUNNER_PATH}');
      run({ name: 'test-op-error', mode: 'operational', args: {} }, async () => {
        throw new Error('operational failure');
      });
    `);
    assert.strictEqual(result.exitCode, 1, `Expected exit 1 but got ${result.exitCode}. stderr: ${result.stderr}`);
  });

  it('error in diagnostic mode exits 0', () => {
    const result = runTestScript(`
      const { run } = require('${RUNNER_PATH}');
      run({ name: 'test-diag-error', mode: 'diagnostic', args: {} }, async () => {
        throw new Error('diagnostic failure');
      });
    `);
    assert.strictEqual(result.exitCode, 0, `Expected exit 0 but got ${result.exitCode}. stderr: ${result.stderr}`);
  });

  it('--help exits 0 and prints usage', () => {
    const result = runTestScript(`
      const { run } = require('${RUNNER_PATH}');
      run({
        name: 'test-help',
        mode: 'operational',
        description: 'A helpful test script',
        args: { required: ['command'], optional: ['--json'] },
      }, async () => {
        // Should never reach here when --help is passed
        throw new Error('should not run');
      });
    `, ['--help']);
    assert.strictEqual(result.exitCode, 0, `Expected exit 0 but got ${result.exitCode}. stderr: ${result.stderr}`);
    assert.ok(
      result.stderr.includes('Usage:') || result.stderr.includes('test-help'),
      `Expected usage text in stderr, got: "${result.stderr}"`
    );
  });

  it('missing required args in operational mode exits 1', () => {
    const result = runTestScript(`
      const { run } = require('${RUNNER_PATH}');
      run({
        name: 'test-missing-args',
        mode: 'operational',
        args: { required: ['cmd'] },
      }, async () => {
        // Should never reach here - missing required args
        throw new Error('should not run');
      });
    `);
    assert.strictEqual(result.exitCode, 1, `Expected exit 1 but got ${result.exitCode}. stderr: ${result.stderr}`);
  });

  it('missing required args in diagnostic mode exits 0', () => {
    const result = runTestScript(`
      const { run } = require('${RUNNER_PATH}');
      run({
        name: 'test-missing-diag',
        mode: 'diagnostic',
        args: { required: ['cmd'] },
      }, async () => {
        // Should never reach here - missing required args
        throw new Error('should not run');
      });
    `);
    assert.strictEqual(result.exitCode, 0, `Expected exit 0 but got ${result.exitCode}. stderr: ${result.stderr}`);
  });

  it('JSON mode error output writes structured JSON to stdout', () => {
    const result = runTestScript(`
      const { run } = require('${RUNNER_PATH}');
      run({ name: 'test-json-error', mode: 'operational', args: {} }, async () => {
        throw new Error('json test failure');
      });
    `, ['--json']);
    assert.strictEqual(result.exitCode, 1, `Expected exit 1 but got ${result.exitCode}`);

    // stdout may contain dotenv warnings before the JSON - strip them
    const cleaned = stripDotenvWarnings(result.stdout).trim();
    assert.ok(cleaned.length > 0, `Expected JSON output on stdout but got nothing. stderr: ${result.stderr}`);

    const parsed = JSON.parse(cleaned);
    assert.strictEqual(parsed.status, 'error');
    assert.ok(parsed.error, 'Expected error field in JSON output');
    assert.ok(
      parsed.error.message && parsed.error.message.includes('json test failure'),
      `Expected error message to contain 'json test failure', got: ${parsed.error.message}`
    );
  });

  it('unhandled rejection is caught and process exits 1', () => {
    const result = runTestScript(`
      const { run } = require('${RUNNER_PATH}');
      run({ name: 'test-rejection', mode: 'operational', args: {} }, async (ctx) => {
        // Fire the rejection immediately
        Promise.reject(new Error('unhandled rejection test'));
        // Wait long enough for the rejection handler to fire before main completes
        await new Promise(resolve => setTimeout(resolve, 500));
      });
    `);
    // The rejection handler should fire well before the 500ms await completes,
    // causing the process to exit 1 in operational mode.
    assert.strictEqual(result.exitCode, 1,
      `Expected exit 1 for unhandled rejection, got ${result.exitCode}. stderr: ${result.stderr}`);
  });

  it('error in ci mode exits 1', () => {
    const result = runTestScript(`
      const { run } = require('${RUNNER_PATH}');
      run({ name: 'test-ci-error', mode: 'ci', args: {} }, async () => {
        throw new Error('ci failure');
      });
    `);
    assert.strictEqual(result.exitCode, 1, `Expected exit 1 in ci mode but got ${result.exitCode}`);
  });

  it('context object has expected properties', () => {
    const result = runTestScript(`
      const { run } = require('${RUNNER_PATH}');
      run({
        name: 'test-ctx',
        mode: 'operational',
        services: ['test-svc'],
        args: { required: [], optional: ['--verbose'] },
      }, async (ctx) => {
        // Verify context shape by writing results to stdout
        const shape = {
          hasArgs: typeof ctx.args === 'object',
          hasLog: typeof ctx.log === 'object',
          hasReport: typeof ctx.report === 'function',
          hasWithRetry: typeof ctx.withRetry === 'function',
          name: ctx.name,
          mode: ctx.mode,
          services: ctx.services,
          positionalCount: ctx.args.positional.length,
          hasFlags: typeof ctx.args.flags === 'object',
        };
        process.stdout.write(JSON.stringify(shape));
      });
    `, ['some-cmd', '--verbose']);
    assert.strictEqual(result.exitCode, 0, `Expected exit 0 but got ${result.exitCode}. stderr: ${result.stderr}`);

    const cleaned = stripDotenvWarnings(result.stdout).trim();
    const ctx = JSON.parse(cleaned);
    assert.strictEqual(ctx.hasArgs, true);
    assert.strictEqual(ctx.hasLog, true);
    assert.strictEqual(ctx.hasReport, true);
    assert.strictEqual(ctx.hasWithRetry, true);
    assert.strictEqual(ctx.name, 'test-ctx');
    assert.strictEqual(ctx.mode, 'operational');
    assert.deepStrictEqual(ctx.services, ['test-svc']);
    assert.strictEqual(ctx.positionalCount, 1);
    assert.strictEqual(ctx.hasFlags, true);
  });

  it('diagnostic mode missing args prints usage on stderr', () => {
    const result = runTestScript(`
      const { run } = require('${RUNNER_PATH}');
      run({
        name: 'test-diag-usage',
        mode: 'diagnostic',
        args: { required: ['action'] },
      }, async () => {
        throw new Error('should not run');
      });
    `);
    assert.strictEqual(result.exitCode, 0);
    assert.ok(
      result.stderr.includes('Usage:') || result.stderr.includes('test-diag-usage'),
      `Expected usage text in stderr for missing args, got: "${result.stderr}"`
    );
  });

  it('parsed args are forwarded correctly', () => {
    const result = runTestScript(`
      const { run } = require('${RUNNER_PATH}');
      run({
        name: 'test-args-fwd',
        mode: 'operational',
        args: { required: ['action'], optional: ['--limit'], booleanFlags: ['dry-run'] },
      }, async (ctx) => {
        process.stdout.write(JSON.stringify({
          positional: ctx.args.positional,
          flags: ctx.args.flags,
        }));
      });
    `, ['deploy', '--limit', '5', '--dry-run']);
    assert.strictEqual(result.exitCode, 0, `Expected exit 0, got ${result.exitCode}. stderr: ${result.stderr}`);

    const cleaned = stripDotenvWarnings(result.stdout).trim();
    const parsed = JSON.parse(cleaned);
    assert.deepStrictEqual(parsed.positional, ['deploy']);
    assert.strictEqual(parsed.flags.limit, '5');
    assert.strictEqual(parsed.flags['dry-run'], true);
  });
});
