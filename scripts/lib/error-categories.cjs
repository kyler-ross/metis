#!/usr/bin/env node
/**
 * Error Categories - Shared error classification and guidance
 *
 * Extracted from telemetry.cjs to provide reusable error classification
 * across PM AI scripts.
 *
 * Usage:
 *   const { categorizeError, getErrorGuidance } = require('./error-categories.cjs');
 *
 *   try {
 *     // ... your code ...
 *   } catch (err) {
 *     const { type, category, retryable } = categorizeError(err);
 *     const guidance = getErrorGuidance(type, 'google');
 *     console.error(guidance.suggestion);
 *   }
 */

/**
 * Error categories and their properties
 */
const ERROR_CATEGORIES = {
  auth: {
    description: 'Authentication/authorization failures',
    types: ['auth_failure', 'token_expired', 'invalid_credentials'],
    retryable: false,
  },
  throttle: {
    description: 'Rate limiting and quota errors',
    types: ['rate_limit', 'quota_exceeded'],
    retryable: true,
  },
  network: {
    description: 'Network connectivity issues',
    types: ['network_error', 'timeout', 'dns_failure'],
    retryable: true,
  },
  client: {
    description: 'Client-side errors (bad request, not found)',
    types: ['not_found', 'validation_error', 'bad_request'],
    retryable: false,
  },
  server: {
    description: 'Server-side errors',
    types: ['server_error', 'service_unavailable'],
    retryable: true,
  },
  system: {
    description: 'Local system errors (filesystem, permissions)',
    types: ['filesystem_error', 'permission_denied'],
    retryable: false,
  },
  data: {
    description: 'Data parsing/format errors',
    types: ['parse_error', 'invalid_json', 'schema_error'],
    retryable: false,
  },
  unknown: {
    description: 'Unclassified errors',
    types: ['unknown_error'],
    retryable: false,
  },
};

/**
 * Service-specific error guidance
 */
const ERROR_GUIDANCE = {
  auth_failure: {
    default: {
      suggestion: 'Check your credentials and try again',
      recoverySteps: ['Verify API key is valid', 'Check token expiration', 'Run /pm-setup to reconfigure'],
    },
    google: {
      suggestion: 'Google OAuth token may be expired',
      recoverySteps: ['Run: node .ai/scripts/google-auth-setup.cjs', 'Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env'],
    },
    jira: {
      suggestion: 'Jira API token may be invalid',
      recoverySteps: ['Verify ATLASSIAN_EMAIL and JIRA_API_KEY in .env', 'Generate new token at id.atlassian.com'],
    },
    slack: {
      suggestion: 'Slack bot token may be invalid',
      recoverySteps: ['Check SLACK_BOT_TOKEN in .env', 'Verify bot is installed in workspace'],
    },
    posthog: {
      suggestion: 'PostHog API key may be invalid',
      recoverySteps: ['Check POSTHOG_API_KEY in .env', 'Verify key at us.posthog.com'],
    },
    dovetail: {
      recoverySteps: ['Check DOVETAIL_API_TOKEN in .ai/scripts/.env', 'Verify token has not expired', 'Regenerate token at dovetail.com/settings/api'],
      suggestion: 'Dovetail API token may be invalid or expired',
    },
    granola: {
      recoverySteps: ['Run: node .ai/scripts/granola-auth.cjs refresh', 'Check token in .ai/scripts/.granola-token.json', 'Re-login: node .ai/scripts/granola-auth.cjs login'],
      suggestion: 'Granola auth token may be expired - try refreshing',
    },
  },
  rate_limit: {
    default: {
      suggestion: 'Rate limit exceeded - wait and retry',
      recoverySteps: ['Wait 60 seconds before retrying', 'Reduce request frequency', 'Check API quota limits'],
    },
    google: {
      suggestion: 'Google API quota exceeded',
      recoverySteps: ['Wait before retrying', 'Check quota at console.cloud.google.com', 'Request quota increase if needed'],
    },
    jira: {
      suggestion: 'Atlassian rate limit hit',
      recoverySteps: ['Wait before retrying', 'Reduce concurrent requests'],
    },
  },
  network_error: {
    default: {
      suggestion: 'Network connectivity issue',
      recoverySteps: ['Check internet connection', 'Verify DNS resolution', 'Check if service is accessible'],
    },
  },
  timeout: {
    default: {
      suggestion: 'Request timed out',
      recoverySteps: ['Retry the request', 'Check service status', 'Reduce payload size if applicable'],
    },
  },
  not_found: {
    default: {
      suggestion: 'Resource not found',
      recoverySteps: ['Verify the ID/path is correct', 'Check if resource was deleted', 'Confirm you have access'],
    },
    jira: {
      suggestion: 'Jira ticket or resource not found',
      recoverySteps: ['Verify ticket key format (e.g., ALL-123)', 'Check project permissions'],
    },
    google: {
      suggestion: 'Google Drive/Sheets resource not found',
      recoverySteps: ['Verify the spreadsheet/file ID', 'Check sharing permissions'],
    },
  },
  validation_error: {
    default: {
      suggestion: 'Invalid request data',
      recoverySteps: ['Check input format', 'Review API documentation', 'Validate required fields'],
    },
  },
  server_error: {
    default: {
      suggestion: 'Server error - the service may be experiencing issues',
      recoverySteps: ['Wait and retry', 'Check service status page', 'Report if persistent'],
    },
  },
  filesystem_error: {
    default: {
      suggestion: 'File system error',
      recoverySteps: ['Check file/directory exists', 'Verify permissions', 'Check disk space'],
    },
  },
  parse_error: {
    default: {
      suggestion: 'Failed to parse response data',
      recoverySteps: ['Check response format', 'Verify API endpoint', 'Report malformed response'],
    },
  },
  unknown_error: {
    default: {
      suggestion: 'An unexpected error occurred',
      recoverySteps: ['Check error details', 'Review logs', 'Report if persistent'],
    },
  },
};

/**
 * Categorize an error into type, category, and retryability
 *
 * @param {Error|Object|string} error - Error object, error-like object, or error string
 * @returns {{ type: string, category: string, retryable: boolean }}
 */
function categorizeError(error) {
  // Null/undefined guard (e.g., unhandledRejection with reason = undefined)
  if (error == null) {
    return { type: 'unknown_error', category: 'unknown', retryable: false };
  }

  // Handle string errors
  if (typeof error === 'string') {
    return categorizeErrorString(error);
  }

  const code = error.code || error.statusCode || error.status;
  const numericCode = typeof code === 'number' ? code : parseInt(code, 10);
  const message = (error.message || String(error) || '').toLowerCase();

  // Auth errors
  if (numericCode === 401 || numericCode === 403 || message.includes('unauthorized') ||
      message.includes('forbidden') || message.includes('invalid_auth') ||
      message.includes('not_authed') || message.includes('token expired') ||
      message.includes('invalid token') || message.includes('token_expired') ||
      message.includes('token_revoked') || message.includes('invalid access_token')) {
    return { type: 'auth_failure', category: 'auth', retryable: false };
  }

  // Rate limiting
  if (numericCode === 429 || message.includes('rate limit') || message.includes('too many requests') ||
      message.includes('ratelimited')) {
    return { type: 'rate_limit', category: 'throttle', retryable: true };
  }

  // Network errors
  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ECONNRESET' ||
      message.includes('network') || message.includes('dns')) {
    return { type: 'network_error', category: 'network', retryable: true };
  }

  // Timeout
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT' || message.includes('timeout')) {
    return { type: 'timeout', category: 'network', retryable: true };
  }

  // Not found
  if (numericCode === 404 || message.includes('not found')) {
    return { type: 'not_found', category: 'client', retryable: false };
  }

  // Validation errors
  if (numericCode === 400 || numericCode === 422 || message.includes('validation') ||
      /invalid (input|parameter|field|value|format|data|request)/.test(message)) {
    return { type: 'validation_error', category: 'client', retryable: false };
  }

  // Server errors
  if (numericCode >= 500 && numericCode < 600) {
    return { type: 'server_error', category: 'server', retryable: true };
  }

  // File system errors
  if (code === 'ENOENT' || code === 'EACCES' || code === 'EPERM') {
    return { type: 'filesystem_error', category: 'system', retryable: false };
  }

  // Parse errors
  if (message.includes('parse') || message.includes('json') || message.includes('syntax')) {
    return { type: 'parse_error', category: 'data', retryable: false };
  }

  return { type: 'unknown_error', category: 'unknown', retryable: false };
}

/**
 * Categorize error from a string (simpler version)
 *
 * @param {string} errorString - Error message string
 * @returns {{ type: string, category: string, retryable: boolean }}
 */
function categorizeErrorString(errorString) {
  const message = errorString.toLowerCase();

  if (message.includes('401') || message.includes('403') || message.includes('auth') ||
      message.includes('unauthorized') || message.includes('forbidden')) {
    return { type: 'auth_failure', category: 'auth', retryable: false };
  }

  if (message.includes('429') || message.includes('rate') || message.includes('throttle')) {
    return { type: 'rate_limit', category: 'throttle', retryable: true };
  }

  if (message.includes('network') || message.includes('enotfound') || message.includes('econnrefused')) {
    return { type: 'network_error', category: 'network', retryable: true };
  }

  if (message.includes('timeout') || message.includes('etimedout')) {
    return { type: 'timeout', category: 'network', retryable: true };
  }

  if (message.includes('404') || message.includes('not found')) {
    return { type: 'not_found', category: 'client', retryable: false };
  }

  if (message.includes('500') || message.includes('server error')) {
    return { type: 'server_error', category: 'server', retryable: true };
  }

  return { type: 'unknown_error', category: 'unknown', retryable: false };
}

/**
 * Get guidance for recovering from an error
 *
 * @param {string} errorType - Error type (e.g., 'auth_failure', 'rate_limit')
 * @param {string} [service] - Optional service name for service-specific guidance
 * @returns {{ suggestion: string, recoverySteps: string[] }}
 */
function getErrorGuidance(errorType, service = null) {
  const typeGuidance = ERROR_GUIDANCE[errorType] || ERROR_GUIDANCE.unknown_error;

  // Try service-specific guidance first, fall back to default
  if (service && typeGuidance[service]) {
    return typeGuidance[service];
  }

  return typeGuidance.default || {
    suggestion: 'An error occurred',
    recoverySteps: ['Check error details and retry'],
  };
}

/**
 * Check if an error is retryable
 *
 * @param {Error|Object|string} error - Error to check
 * @returns {boolean}
 */
function isRetryable(error) {
  return categorizeError(error).retryable;
}

/**
 * Get the error category
 *
 * @param {Error|Object|string} error - Error to categorize
 * @returns {string} Category name
 */
function getErrorCategory(error) {
  return categorizeError(error).category;
}

/**
 * Get category metadata
 *
 * @param {string} categoryName - Category name
 * @returns {Object|null} Category metadata
 */
function getCategoryInfo(categoryName) {
  return ERROR_CATEGORIES[categoryName] || null;
}

module.exports = {
  ERROR_CATEGORIES,
  ERROR_GUIDANCE,
  categorizeError,
  categorizeErrorString,
  getErrorGuidance,
  isRetryable,
  getErrorCategory,
  getCategoryInfo,
};
