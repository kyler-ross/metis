#!/usr/bin/env node
/**
 * Tests for with-retry.cjs - withRetry() function
 *
 * Uses Node.js built-in test runner (node:test) and assertions (node:assert).
 * Run with: node --test .ai/evals/js/test-with-retry.cjs
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// Load the module under test
const { withRetry } = require(path.join(__dirname, '..', '..', 'scripts', 'lib', 'with-retry.cjs'));

// Small delays for fast tests
const FAST_OPTS = { baseDelayMs: 10, maxDelayMs: 50 };

describe('withRetry', () => {
  it('returns value on first try success', async () => {
    const result = await withRetry(() => 'hello', FAST_OPTS);
    assert.strictEqual(result, 'hello');
  });

  it('returns async value on first try success', async () => {
    const result = await withRetry(async () => 42, FAST_OPTS);
    assert.strictEqual(result, 42);
  });

  it('succeeds on second try after initial failure', async () => {
    let calls = 0;
    const result = await withRetry(() => {
      calls++;
      if (calls === 1) {
        const err = new Error('connect ECONNREFUSED');
        err.code = 'ECONNREFUSED';
        throw err;
      }
      return 'success';
    }, { ...FAST_OPTS, maxRetries: 3 });

    assert.strictEqual(result, 'success');
    assert.strictEqual(calls, 2);
  });

  it('stops immediately on non-retryable error', async () => {
    let calls = 0;

    await assert.rejects(
      () => withRetry(() => {
        calls++;
        const err = new Error('401 Unauthorized');
        err.status = 401;
        throw err;
      }, { ...FAST_OPTS, maxRetries: 3 }),
      (err) => {
        assert.ok(err.message.includes('401'), 'Should propagate original error');
        return true;
      },
    );

    // Auth errors are not retryable, so should only be called once
    assert.strictEqual(calls, 1, 'Should not retry non-retryable errors');
  });

  it('exhausts max retries for retryable errors', async () => {
    let calls = 0;
    const maxRetries = 2;

    await assert.rejects(
      () => withRetry(() => {
        calls++;
        const err = new Error('connect ECONNREFUSED');
        err.code = 'ECONNREFUSED';
        throw err;
      }, { ...FAST_OPTS, maxRetries }),
      (err) => {
        // Should try maxRetries + 1 times (initial + retries)
        assert.strictEqual(calls, maxRetries + 1, `Expected ${maxRetries + 1} calls, got ${calls}`);
        return true;
      },
    );
  });

  it('enriches final error with retryHistory array', async () => {
    const maxRetries = 2;

    await assert.rejects(
      () => withRetry(() => {
        const err = new Error('Service unavailable');
        err.status = 503;
        throw err;
      }, { ...FAST_OPTS, maxRetries }),
      (err) => {
        assert.ok(Array.isArray(err.retryHistory), 'Should have retryHistory array');
        assert.strictEqual(err.retryHistory.length, maxRetries + 1, 'retryHistory should have entry per attempt');

        // Each entry should have attempt, error, timestamp, retryable
        const entry = err.retryHistory[0];
        assert.strictEqual(entry.attempt, 1);
        assert.ok(entry.error.includes('Service unavailable'));
        assert.ok('timestamp' in entry);
        assert.strictEqual(entry.retryable, true);

        return true;
      },
    );
  });

  it('enriches final error with retryAttempts count', async () => {
    const maxRetries = 3;

    await assert.rejects(
      () => withRetry(() => {
        const err = new Error('timeout');
        err.code = 'ETIMEDOUT';
        throw err;
      }, { ...FAST_OPTS, maxRetries }),
      (err) => {
        assert.strictEqual(err.retryAttempts, maxRetries, 'retryAttempts should equal maxRetries');
        return true;
      },
    );
  });

  it('enriches final error with recovery and suggestion when service is set', async () => {
    await assert.rejects(
      () => withRetry(() => {
        const err = new Error('Request failed with status 401');
        err.status = 401;
        throw err;
      }, { ...FAST_OPTS, maxRetries: 0, service: 'jira' }),
      (err) => {
        assert.ok(Array.isArray(err.recovery), 'Should have recovery array');
        assert.ok(err.recovery.length > 0, 'recovery should not be empty for jira auth');
        assert.strictEqual(typeof err.suggestion, 'string', 'suggestion should be a string');
        assert.ok(err.suggestion.length > 0, 'suggestion should not be empty');
        return true;
      },
    );
  });

  it('does not add recovery/suggestion when no service is set', async () => {
    await assert.rejects(
      () => withRetry(() => {
        const err = new Error('Request failed with status 401');
        err.status = 401;
        throw err;
      }, { ...FAST_OPTS, maxRetries: 0 }),
      (err) => {
        // Without service, recovery and suggestion should not be set
        assert.strictEqual(err.recovery, undefined, 'Should not have recovery without service');
        assert.strictEqual(err.suggestion, undefined, 'Should not have suggestion without service');
        return true;
      },
    );
  });

  it('calls onRetry callback with (attempt, error, delayMs)', async () => {
    const retryCalls = [];

    await assert.rejects(
      () => withRetry(() => {
        const err = new Error('ECONNRESET');
        err.code = 'ECONNRESET';
        throw err;
      }, {
        ...FAST_OPTS,
        maxRetries: 2,
        onRetry: (attempt, error, delayMs) => {
          retryCalls.push({ attempt, message: error.message, delayMs });
        },
      }),
    );

    // onRetry is called for each retry (not the final failure)
    assert.strictEqual(retryCalls.length, 2, 'onRetry should be called for each retry');
    assert.strictEqual(retryCalls[0].attempt, 1);
    assert.strictEqual(retryCalls[1].attempt, 2);
    assert.ok(retryCalls[0].message.includes('ECONNRESET'));
    assert.strictEqual(typeof retryCalls[0].delayMs, 'number');
    assert.ok(retryCalls[0].delayMs > 0, 'delay should be positive');
  });

  it('respects Retry-After header (numeric seconds)', async () => {
    let calls = 0;
    const startTime = Date.now();

    await assert.rejects(
      () => withRetry(() => {
        calls++;
        const err = new Error('Too Many Requests');
        err.status = 429;
        err.retryAfter = '0.05'; // 50ms
        throw err;
      }, { ...FAST_OPTS, maxRetries: 1 }),
    );

    const elapsed = Date.now() - startTime;
    // Should have waited at least ~50ms for the Retry-After
    // Use generous tolerance (20ms) to avoid flaky failures on loaded CI machines
    assert.ok(elapsed >= 20, `Expected at least 20ms elapsed, got ${elapsed}ms`);
    assert.strictEqual(calls, 2);
  });

  it('falls through to exponential backoff for non-numeric Retry-After', async () => {
    let calls = 0;

    // This should not crash even with a date string
    await assert.rejects(
      () => withRetry(() => {
        calls++;
        const err = new Error('Too Many Requests');
        err.status = 429;
        err.retryAfter = 'Thu, 01 Dec 2025 16:00:00 GMT'; // Date string, not numeric
        throw err;
      }, { ...FAST_OPTS, maxRetries: 1 }),
    );

    // Should still have retried (the non-numeric Retry-After just falls through to backoff)
    assert.strictEqual(calls, 2, 'Should retry even with date-string Retry-After');
  });

  it('respects Retry-After from headers object', async () => {
    let calls = 0;

    await assert.rejects(
      () => withRetry(() => {
        calls++;
        const err = new Error('Too Many Requests');
        err.status = 429;
        err.headers = { 'retry-after': '0.05' }; // 50ms via headers
        throw err;
      }, { ...FAST_OPTS, maxRetries: 1 }),
    );

    assert.strictEqual(calls, 2);
  });

  it('respects Retry-After from err.response.headers (axios pattern)', async () => {
    let calls = 0;

    await assert.rejects(
      () => withRetry(() => {
        calls++;
        const err = new Error('Too Many Requests');
        err.status = 429;
        err.response = { headers: { 'retry-after': '0.05' } }; // 50ms via axios-style response
        throw err;
      }, { ...FAST_OPTS, maxRetries: 1 }),
    );

    assert.strictEqual(calls, 2);
  });

  it('retryHistory records non-retryable status correctly', async () => {
    await assert.rejects(
      () => withRetry(() => {
        const err = new Error('Not found');
        err.status = 404;
        throw err;
      }, { ...FAST_OPTS, maxRetries: 3 }),
      (err) => {
        assert.strictEqual(err.retryHistory.length, 1, 'Should only have 1 attempt for non-retryable');
        assert.strictEqual(err.retryHistory[0].retryable, false);
        return true;
      },
    );
  });

  it('handles maxRetries: 0 (no retries)', async () => {
    let calls = 0;

    await assert.rejects(
      () => withRetry(() => {
        calls++;
        const err = new Error('Server error');
        err.status = 503;
        throw err;
      }, { ...FAST_OPTS, maxRetries: 0 }),
    );

    assert.strictEqual(calls, 1, 'With maxRetries: 0, should call fn exactly once');
  });

  it('delay increases with exponential backoff', async () => {
    const delays = [];

    await assert.rejects(
      () => withRetry(() => {
        const err = new Error('ECONNRESET');
        err.code = 'ECONNRESET';
        throw err;
      }, {
        baseDelayMs: 10,
        maxDelayMs: 5000,
        maxRetries: 3,
        onRetry: (attempt, error, delayMs) => {
          delays.push(delayMs);
        },
      }),
    );

    assert.strictEqual(delays.length, 3);
    // Due to jitter, we can only check the general trend
    // Base formula: baseDelayMs * 2^attempt + random jitter
    // attempt 0: ~10ms, attempt 1: ~20ms, attempt 2: ~40ms
    // With jitter (up to baseDelayMs/2 = 5ms), ranges overlap,
    // but the max delay at each step should generally increase
    assert.ok(delays[0] > 0, 'First delay should be positive');
    assert.ok(delays[2] > delays[0], `Third delay (${delays[2]}) should be larger than first (${delays[0]})`);
  });
});
