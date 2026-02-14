#!/usr/bin/env node
/**
 * Tests for script-runner.cjs - parseArgs() function
 *
 * Uses Node.js built-in test runner (node:test) and assertions (node:assert).
 * Run with: node --test .ai/evals/js/test-script-runner.cjs
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// Load the module under test
const { parseArgs } = require(path.join(__dirname, '..', '..', 'scripts', 'lib', 'script-runner.cjs'));

describe('parseArgs', () => {
  it('parses positional args and boolean flags', () => {
    const result = parseArgs(['run', '--force']);
    assert.deepStrictEqual(result.positional, ['run']);
    assert.strictEqual(result.flags.force, true);
  });

  it('parses --key=value syntax', () => {
    const result = parseArgs(['--since=2024-01-01']);
    assert.deepStrictEqual(result.positional, []);
    assert.strictEqual(result.flags.since, '2024-01-01');
  });

  it('parses --key value pairs', () => {
    const result = parseArgs(['--limit', '10']);
    assert.strictEqual(result.flags.limit, '10');
  });

  it('detects boolean flags correctly', () => {
    const result = parseArgs(['--json', '--dry-run']);
    assert.strictEqual(result.flags.json, true);
    assert.strictEqual(result.flags['dry-run'], true);
  });

  it('treats unknown flags without a following value as boolean', () => {
    const result = parseArgs(['--unknown']);
    assert.strictEqual(result.flags.unknown, true);
  });

  it('treats unknown flags followed by another flag as boolean', () => {
    const result = parseArgs(['--unknown', '--another']);
    assert.strictEqual(result.flags.unknown, true);
    assert.strictEqual(result.flags.another, true);
  });

  it('treats unknown flags followed by a value as key-value', () => {
    const result = parseArgs(['--output', 'file.txt']);
    assert.strictEqual(result.flags.output, 'file.txt');
  });

  it('supports custom boolean flags from argSpec', () => {
    const result = parseArgs(['--custom-flag'], { booleanFlags: ['custom-flag'] });
    assert.strictEqual(result.flags['custom-flag'], true);
  });

  it('custom boolean flags do not consume the next arg', () => {
    const result = parseArgs(['--custom-flag', 'positional-value'], { booleanFlags: ['custom-flag'] });
    assert.strictEqual(result.flags['custom-flag'], true);
    assert.deepStrictEqual(result.positional, ['positional-value']);
  });

  it('returns empty results for empty args', () => {
    const result = parseArgs([]);
    assert.deepStrictEqual(result.positional, []);
    assert.deepStrictEqual(result.flags, {});
    assert.deepStrictEqual(result.raw, []);
  });

  it('handles mixed positional and flags', () => {
    const result = parseArgs(['cmd', 'subcmd', '--verbose', '--limit', '5']);
    assert.deepStrictEqual(result.positional, ['cmd', 'subcmd']);
    assert.strictEqual(result.flags.verbose, true);
    assert.strictEqual(result.flags.limit, '5');
  });

  it('preserves raw args', () => {
    const rawArgs = ['cmd', '--force', '--limit', '10'];
    const result = parseArgs(rawArgs);
    assert.deepStrictEqual(result.raw, rawArgs);
  });

  it('handles all default boolean flags', () => {
    // All default booleans: json, fix, dry-run, verbose, help, check, force, quiet, all, debug
    const result = parseArgs([
      '--json', '--fix', '--dry-run', '--verbose', '--help',
      '--check', '--force', '--quiet', '--all', '--debug',
    ]);
    assert.strictEqual(result.flags.json, true);
    assert.strictEqual(result.flags.fix, true);
    assert.strictEqual(result.flags['dry-run'], true);
    assert.strictEqual(result.flags.verbose, true);
    assert.strictEqual(result.flags.help, true);
    assert.strictEqual(result.flags.check, true);
    assert.strictEqual(result.flags.force, true);
    assert.strictEqual(result.flags.quiet, true);
    assert.strictEqual(result.flags.all, true);
    assert.strictEqual(result.flags.debug, true);
  });

  it('handles --key=value with equals sign in value', () => {
    const result = parseArgs(['--query=status=active']);
    assert.strictEqual(result.flags.query, 'status=active');
  });

  it('handles --key= with empty value', () => {
    const result = parseArgs(['--prefix=']);
    assert.strictEqual(result.flags.prefix, '');
  });

  it('default boolean flags do not consume next arg even when followed by non-flag', () => {
    // --json is a known boolean, so 'report' should be positional
    const result = parseArgs(['--json', 'report']);
    assert.strictEqual(result.flags.json, true);
    assert.deepStrictEqual(result.positional, ['report']);
  });

  it('-- stops flag parsing and treats remaining as positional', () => {
    const result = parseArgs(['--verbose', '--', '--not-a-flag', 'value']);
    assert.strictEqual(result.flags.verbose, true);
    assert.deepStrictEqual(result.positional, ['--not-a-flag', 'value']);
  });

  it('-- with no following args produces no extra positionals', () => {
    const result = parseArgs(['cmd', '--']);
    assert.deepStrictEqual(result.positional, ['cmd']);
  });
});
