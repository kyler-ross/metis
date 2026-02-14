/**
 * Output Formatter - Standardized JSON-first output for CLI scripts
 *
 * Usage:
 *   import { formatOutput } from './lib/output-formatter.js';
 *   console.log(formatOutput(result));
 *
 * Formats:
 *   - json (default): Structured JSON output
 *   - pretty: Human-readable formatted output
 */

export function formatOutput(data, format = process.env.FORMAT || 'json') {
  if (format === 'json') {
    return JSON.stringify(data, null, 2);
  }

  if (format === 'pretty') {
    return renderPretty(data);
  }

  // Default to JSON
  return JSON.stringify(data, null, 2);
}

/**
 * Render data in human-readable format
 */
function renderPretty(data) {
  if (Array.isArray(data)) {
    return renderTable(data);
  }

  if (typeof data === 'object' && data !== null) {
    return renderObject(data);
  }

  return String(data);
}

/**
 * Render array as table
 */
function renderTable(rows) {
  if (rows.length === 0) return '(no results)';

  // Get headers from first row
  const headers = Object.keys(rows[0]);

  // Calculate column widths
  const widths = headers.map(h => {
    const maxContentWidth = Math.max(
      ...rows.map(row => String(row[h] || '').length)
    );
    return Math.max(h.length, maxContentWidth);
  });

  // Header row
  let output = '';
  output += headers.map((h, i) => h.padEnd(widths[i])).join('  ') + '\n';
  output += headers.map((h, i) => '-'.repeat(widths[i])).join('  ') + '\n';

  // Data rows
  rows.forEach(row => {
    output += headers.map((h, i) =>
      String(row[h] || '').padEnd(widths[i])
    ).join('  ') + '\n';
  });

  return output;
}

/**
 * Render object as key-value pairs
 */
function renderObject(obj) {
  const maxKeyLength = Math.max(...Object.keys(obj).map(k => k.length));

  return Object.entries(obj).map(([key, value]) => {
    const paddedKey = key.padEnd(maxKeyLength);
    const formattedValue = typeof value === 'object'
      ? JSON.stringify(value, null, 2).split('\n').join('\n' + ' '.repeat(maxKeyLength + 2))
      : String(value);

    return `${paddedKey}: ${formattedValue}`;
  }).join('\n');
}

/**
 * Format error output
 */
export function formatError(error, format = process.env.FORMAT || 'json') {
  const errorData = {
    error: true,
    message: error.message,
    code: error.code || 'UNKNOWN_ERROR',
    stack: process.env.DEBUG ? error.stack : undefined
  };

  return formatOutput(errorData, format);
}

/**
 * Format success output
 */
export function formatSuccess(data, message = null) {
  const output = {
    success: true,
    data: data
  };

  if (message) {
    output.message = message;
  }

  return formatOutput(output);
}
