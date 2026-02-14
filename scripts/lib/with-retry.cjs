#!/usr/bin/env node
/**
 * Retry Logic - Shared retry with exponential backoff for PM AI scripts
 *
 * Extracted and generalized from slack-client.cjs retry logic.
 * Uses error-categories.cjs for retryability classification.
 *
 * Usage:
 *   const { withRetry } = require('./with-retry.cjs');
 *
 *   const result = await withRetry(() => jiraClient.getIssue('ALL-123'), {
 *     maxRetries: 3,
 *     baseDelayMs: 1000,
 *     maxDelayMs: 15000,
 *     service: 'jira',
 *     onRetry: (attempt, err, delayMs) => { console.warn(`Retry ${attempt}...`); },
 *   });
 */

const { isRetryable, categorizeError, getErrorGuidance } = require('./error-categories.cjs');

/**
 * Default options for retry behavior
 */
const DEFAULTS = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 15000,
  service: null,
  onRetry: null,
};

/**
 * Execute a function with retry and exponential backoff.
 *
 * - Uses isRetryable() from error-categories to decide whether to retry
 * - Exponential backoff with jitter to avoid thundering herd
 * - Respects Retry-After headers (from HTTP responses)
 * - Enriches final failure with retry history and recovery guidance
 *
 * @param {Function} fn - Async function to execute
 * @param {Object} [options] - Retry configuration
 * @param {number} [options.maxRetries=3] - Maximum retry attempts
 * @param {number} [options.baseDelayMs=1000] - Base delay between retries
 * @param {number} [options.maxDelayMs=15000] - Maximum delay cap
 * @param {string} [options.service] - Service name for error guidance
 * @param {Function} [options.onRetry] - Callback(attempt, error, delayMs) on each retry
 * @returns {Promise<*>} Result of the function
 * @throws {Error} Final error enriched with retryHistory and recovery guidance
 */
async function withRetry(fn, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  if (opts.maxRetries == null || opts.maxRetries < 0) {
    opts.maxRetries = DEFAULTS.maxRetries;
  }
  const retryHistory = [];

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const shouldRetry = isRetryable(err) && attempt < opts.maxRetries;

      retryHistory.push({
        attempt: attempt + 1,
        error: err.message,
        timestamp: new Date().toISOString(),
        retryable: isRetryable(err),
      });

      if (!shouldRetry) {
        // Enrich the final error with retry context and recovery guidance
        err.retryHistory = retryHistory;
        err.retryAttempts = attempt;

        if (opts.service) {
          const cat = categorizeError(err);
          const guidance = getErrorGuidance(cat.type, opts.service);
          err.recovery = guidance.recoverySteps;
          err.suggestion = guidance.suggestion;
        }

        throw err;
      }

      // Calculate delay: exponential backoff with jitter
      let delayMs;
      const retryAfter = err.retryAfter ?? err.headers?.['retry-after'] ?? err.response?.headers?.['retry-after'];
      if (retryAfter != null) {
        const parsed = parseFloat(retryAfter);
        if (!isNaN(parsed) && parsed >= 0) {
          // Respect Retry-After header (seconds), capped by maxDelayMs
          delayMs = Math.min(Math.ceil(parsed * 1000), opts.maxDelayMs);
        }
        // else: retryAfter is a date string or invalid - fall through to exponential backoff
      }
      if (delayMs == null) {
        delayMs = Math.min(
          opts.baseDelayMs * Math.pow(2, attempt) + Math.random() * (opts.baseDelayMs / 2),
          opts.maxDelayMs,
        );
      }

      if (opts.onRetry) {
        opts.onRetry(attempt + 1, err, delayMs);
      }

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

module.exports = {
  withRetry,
};
