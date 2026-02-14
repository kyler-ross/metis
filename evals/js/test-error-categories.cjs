#!/usr/bin/env node
/**
 * Tests for error-categories.cjs
 *
 * Covers: categorizeError, isRetryable, getErrorGuidance, categorizeErrorString
 *
 * Run with: node --test .ai/evals/js/test-error-categories.cjs
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  categorizeError,
  categorizeErrorString,
  isRetryable,
  getErrorGuidance,
} = require(path.join(__dirname, '..', '..', 'scripts', 'lib', 'error-categories.cjs'));

// ---------------------------------------------------------------------------
// categorizeError()
// ---------------------------------------------------------------------------
describe('categorizeError', () => {
  it('null input returns unknown (does not crash)', () => {
    const result = categorizeError(null);
    assert.strictEqual(result.type, 'unknown_error');
    assert.strictEqual(result.category, 'unknown');
    assert.strictEqual(result.retryable, false);
  });

  it('undefined input returns unknown (does not crash)', () => {
    const result = categorizeError(undefined);
    assert.strictEqual(result.type, 'unknown_error');
    assert.strictEqual(result.category, 'unknown');
    assert.strictEqual(result.retryable, false);
  });

  it('Error with code 401 -> auth_failure', () => {
    const err = new Error('Unauthorized');
    err.status = 401;
    const result = categorizeError(err);
    assert.strictEqual(result.type, 'auth_failure');
    assert.strictEqual(result.category, 'auth');
    assert.strictEqual(result.retryable, false);
  });

  it('Error with code 403 -> auth_failure', () => {
    const err = new Error('Forbidden');
    err.status = 403;
    const result = categorizeError(err);
    assert.strictEqual(result.type, 'auth_failure');
    assert.strictEqual(result.category, 'auth');
    assert.strictEqual(result.retryable, false);
  });

  it('Error with code 404 -> not_found', () => {
    const err = new Error('Not Found');
    err.status = 404;
    const result = categorizeError(err);
    assert.strictEqual(result.type, 'not_found');
    assert.strictEqual(result.category, 'client');
    assert.strictEqual(result.retryable, false);
  });

  it('Error with code 429 -> rate_limit', () => {
    const err = new Error('Too Many Requests');
    err.status = 429;
    const result = categorizeError(err);
    assert.strictEqual(result.type, 'rate_limit');
    assert.strictEqual(result.category, 'throttle');
    assert.strictEqual(result.retryable, true);
  });

  it('Error with code 500 -> server_error', () => {
    const err = new Error('Internal Server Error');
    err.status = 500;
    const result = categorizeError(err);
    assert.strictEqual(result.type, 'server_error');
    assert.strictEqual(result.category, 'server');
    assert.strictEqual(result.retryable, true);
  });

  it('Error with code 503 -> server_error', () => {
    const err = new Error('Service Unavailable');
    err.status = 503;
    const result = categorizeError(err);
    assert.strictEqual(result.type, 'server_error');
    assert.strictEqual(result.category, 'server');
    assert.strictEqual(result.retryable, true);
  });

  it('Error with code ENOTFOUND -> network', () => {
    const err = new Error('getaddrinfo ENOTFOUND api.example.com');
    err.code = 'ENOTFOUND';
    const result = categorizeError(err);
    assert.strictEqual(result.type, 'network_error');
    assert.strictEqual(result.category, 'network');
    assert.strictEqual(result.retryable, true);
  });

  it('Error with code ECONNREFUSED -> network', () => {
    const err = new Error('connect ECONNREFUSED 127.0.0.1:3000');
    err.code = 'ECONNREFUSED';
    const result = categorizeError(err);
    assert.strictEqual(result.type, 'network_error');
    assert.strictEqual(result.category, 'network');
    assert.strictEqual(result.retryable, true);
  });

  it('Error with code ETIMEDOUT -> timeout', () => {
    const err = new Error('connect ETIMEDOUT');
    err.code = 'ETIMEDOUT';
    const result = categorizeError(err);
    assert.strictEqual(result.type, 'timeout');
    assert.strictEqual(result.category, 'network');
    assert.strictEqual(result.retryable, true);
  });

  it('Error with message "token expired" -> auth_failure', () => {
    const err = new Error('token expired');
    const result = categorizeError(err);
    assert.strictEqual(result.type, 'auth_failure');
    assert.strictEqual(result.category, 'auth');
    assert.strictEqual(result.retryable, false);
  });

  it('Error with message "token_revoked" -> auth_failure', () => {
    const err = new Error('token_revoked');
    const result = categorizeError(err);
    assert.strictEqual(result.type, 'auth_failure');
    assert.strictEqual(result.category, 'auth');
    assert.strictEqual(result.retryable, false);
  });

  it('Error with message "Invalid JSON token at position 5" should NOT be auth (regression)', () => {
    // "Invalid JSON token" must not match the "invalid token" auth pattern
    // because "json" sits between "invalid" and "token"
    const err = new Error('Invalid JSON token at position 5');
    const result = categorizeError(err);
    assert.notStrictEqual(result.type, 'auth_failure',
      'Should not classify JSON parse error as auth_failure');
    // Should be parse_error because message contains "json"
    assert.strictEqual(result.type, 'parse_error', `Expected parse_error, got ${result.type}`);
    assert.strictEqual(result.category, 'data');
  });

  it('Error with message "rate limit exceeded" -> rate_limit', () => {
    const err = new Error('rate limit exceeded');
    const result = categorizeError(err);
    assert.strictEqual(result.type, 'rate_limit');
    assert.strictEqual(result.category, 'throttle');
    assert.strictEqual(result.retryable, true);
  });

  it('Error with message "ratelimited" -> rate_limit', () => {
    const err = new Error('ratelimited');
    const result = categorizeError(err);
    assert.strictEqual(result.type, 'rate_limit');
    assert.strictEqual(result.category, 'throttle');
    assert.strictEqual(result.retryable, true);
  });

  it('plain Error with generic message -> unknown', () => {
    const err = new Error('something went wrong');
    const result = categorizeError(err);
    assert.strictEqual(result.type, 'unknown_error');
    assert.strictEqual(result.category, 'unknown');
    assert.strictEqual(result.retryable, false);
  });

  it('handles string status code "429"', () => {
    const err = new Error('rate limited');
    err.status = "429";
    const result = categorizeError(err);
    assert.strictEqual(result.type, 'rate_limit');
  });

  it('handles string status code "401"', () => {
    const err = new Error('unauthorized');
    err.status = "401";
    const result = categorizeError(err);
    assert.strictEqual(result.type, 'auth_failure');
  });

  it('handles string status code "500"', () => {
    const err = new Error('internal server error');
    err.status = "500";
    const result = categorizeError(err);
    assert.strictEqual(result.type, 'server_error');
  });

  it('handles ENOENT code without "not found" in message -> filesystem_error', () => {
    const err = new Error('no such file or directory');
    err.code = 'ENOENT';
    const result = categorizeError(err);
    assert.strictEqual(result.type, 'filesystem_error');
    assert.strictEqual(result.category, 'system');
    assert.strictEqual(result.retryable, false);
  });

  it('ENOENT with "not found" message matches not_found first (by design)', () => {
    // "not found" in message matches HTTP 404 pattern before ENOENT code check
    const err = new Error('file not found');
    err.code = 'ENOENT';
    const result = categorizeError(err);
    assert.strictEqual(result.type, 'not_found');
    assert.strictEqual(result.category, 'client');
  });
});

// ---------------------------------------------------------------------------
// isRetryable()
// ---------------------------------------------------------------------------
describe('isRetryable', () => {
  it('rate_limit errors are retryable', () => {
    const err = new Error('Too Many Requests');
    err.status = 429;
    assert.strictEqual(isRetryable(err), true);
  });

  it('network errors are retryable', () => {
    const err = new Error('ECONNREFUSED');
    err.code = 'ECONNREFUSED';
    assert.strictEqual(isRetryable(err), true);
  });

  it('server errors are retryable', () => {
    const err = new Error('Internal Server Error');
    err.status = 500;
    assert.strictEqual(isRetryable(err), true);
  });

  it('auth errors are NOT retryable', () => {
    const err = new Error('Unauthorized');
    err.status = 401;
    assert.strictEqual(isRetryable(err), false);
  });

  it('unknown errors are NOT retryable', () => {
    const err = new Error('something went wrong');
    assert.strictEqual(isRetryable(err), false);
  });
});

// ---------------------------------------------------------------------------
// getErrorGuidance()
// ---------------------------------------------------------------------------
describe('getErrorGuidance', () => {
  it('known service with auth error returns service-specific guidance', () => {
    const guidance = getErrorGuidance('auth_failure', 'jira');
    assert.ok(guidance.suggestion, 'Should have suggestion');
    assert.ok(guidance.suggestion.toLowerCase().includes('jira'),
      `Jira-specific suggestion expected, got: "${guidance.suggestion}"`);
    assert.ok(Array.isArray(guidance.recoverySteps), 'Should have recoverySteps');
    assert.ok(guidance.recoverySteps.length > 0, 'Should have at least one recovery step');
  });

  it('unknown service with auth error returns default guidance', () => {
    const guidance = getErrorGuidance('auth_failure', 'unknown-service');
    assert.ok(guidance.suggestion, 'Should have suggestion');
    assert.ok(Array.isArray(guidance.recoverySteps), 'Should have recoverySteps');
  });

  it('null service does not crash', () => {
    const guidance = getErrorGuidance('auth_failure', null);
    assert.ok(guidance.suggestion, 'Should have suggestion');
    assert.ok(Array.isArray(guidance.recoverySteps), 'Should have recoverySteps');
  });

  it('undefined service does not crash', () => {
    const guidance = getErrorGuidance('auth_failure');
    assert.ok(guidance.suggestion, 'Should have suggestion');
    assert.ok(Array.isArray(guidance.recoverySteps), 'Should have recoverySteps');
  });

  it('unknown error type returns fallback guidance', () => {
    const guidance = getErrorGuidance('totally_fake_type');
    assert.ok(guidance.suggestion, 'Should have suggestion even for unknown type');
    assert.ok(Array.isArray(guidance.recoverySteps), 'Should have recoverySteps');
  });
});

// ---------------------------------------------------------------------------
// categorizeErrorString()
// ---------------------------------------------------------------------------
describe('categorizeErrorString', () => {
  it('string containing "401" -> auth', () => {
    const result = categorizeErrorString('Request failed with status 401');
    assert.strictEqual(result.type, 'auth_failure');
    assert.strictEqual(result.category, 'auth');
  });

  it('string containing "429" -> throttle', () => {
    const result = categorizeErrorString('Error: 429 Too Many Requests');
    assert.strictEqual(result.type, 'rate_limit');
    assert.strictEqual(result.category, 'throttle');
  });

  it('string containing "ENOTFOUND" -> network', () => {
    const result = categorizeErrorString('getaddrinfo ENOTFOUND api.example.com');
    assert.strictEqual(result.type, 'network_error');
    assert.strictEqual(result.category, 'network');
  });

  it('generic string -> unknown', () => {
    const result = categorizeErrorString('something unexpected happened');
    assert.strictEqual(result.type, 'unknown_error');
    assert.strictEqual(result.category, 'unknown');
  });
});
