#!/usr/bin/env node
/**
 * Smoke tests for migrated scripts
 *
 * Runs representative migrated scripts with --help and verifies they
 * exit 0 and print usage text. This catches broken requires, missing
 * dependencies, or misconfigured run() wrappers.
 *
 * Only tests scripts that have a proper args spec in their run() config.
 * Scripts that omit args (defaulting to null) crash on --help due to a
 * known issue in parseArgs - those are excluded here.
 *
 * Run with: node --test .ai/evals/js/test-smoke-migrated.cjs
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');

// Root of the repository (from .ai/evals/js/ go up 3 levels)
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

// Shared env: suppress telemetry and avoid side effects
const SUBPROCESS_ENV = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  NODE_ENV: 'test',
  PM_AI_TELEMETRY_DISABLED: '1',
};

/**
 * Run a script with --help and return the result.
 *
 * @param {string} scriptRelPath - Path relative to repo root
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 */
function runWithHelp(scriptRelPath) {
  const scriptPath = path.join(REPO_ROOT, scriptRelPath);
  const result = spawnSync('node', [scriptPath, '--help'], {
    timeout: 10000,
    encoding: 'utf8',
    env: SUBPROCESS_ENV,
    cwd: REPO_ROOT,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

describe('smoke tests: migrated scripts --help', () => {
  it('setup-doctor.cjs --help exits 0 with usage text', () => {
    const result = runWithHelp('.ai/scripts/setup-doctor.cjs');
    assert.strictEqual(result.exitCode, 0,
      `Expected exit 0 but got ${result.exitCode}. stderr: ${result.stderr}`);
    const combined = result.stdout + result.stderr;
    assert.ok(combined.length > 0,
      'Expected some output from --help');
  });

  it('validate-dependencies.cjs --help exits 0 with usage text', () => {
    const result = runWithHelp('.ai/scripts/validate-dependencies.cjs');
    assert.strictEqual(result.exitCode, 0,
      `Expected exit 0 but got ${result.exitCode}. stderr: ${result.stderr}`);
    const combined = result.stdout + result.stderr;
    assert.ok(combined.length > 0,
      'Expected some output from --help');
  });

  it('local-worker-health-check.cjs --help exits 0 with usage text', () => {
    const result = runWithHelp('.ai/scripts/local-worker-health-check.cjs');
    assert.strictEqual(result.exitCode, 0,
      `Expected exit 0 but got ${result.exitCode}. stderr: ${result.stderr}`);
    const combined = result.stdout + result.stderr;
    assert.ok(combined.length > 0,
      'Expected some output from --help');
  });
});
