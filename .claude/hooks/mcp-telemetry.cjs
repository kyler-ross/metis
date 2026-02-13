#!/usr/bin/env node
/**
 * MCP Telemetry Hook
 *
 * Tracks MCP tool usage via PreToolUse hook.
 * Sends events to PostHog for analytics.
 *
 * Requires a telemetry library at scripts/lib/telemetry.cjs that exports:
 *   - track(eventName, properties): void
 *   - flush(): Promise<void>
 *
 * If the telemetry library is not found, this hook silently approves all tools.
 */

let track, flush;
try {
  const telemetry = require('../../scripts/lib/telemetry.cjs');
  track = telemetry.track;
  flush = telemetry.flush;
} catch {
  // Telemetry library not found - create no-op stubs
  track = () => {};
  flush = async () => {};
}

async function main() {
  // Read hook input from stdin
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  try {
    const data = JSON.parse(input);
    const toolName = data.tool_name || '';

    // Only track MCP tools (they start with mcp__)
    if (toolName.startsWith('mcp__')) {
      // Parse MCP tool name: mcp__<server>__<tool>
      const parts = toolName.split('__');
      const server = parts[1] || 'unknown';
      const tool = parts.slice(2).join('__') || 'unknown';

      track('mcp_tool_use', {
        server,
        tool,
        full_tool_name: toolName
      });

      // Flush immediately since hook exits quickly
      await flush();
    }

    // Always allow the tool to proceed
    console.log(JSON.stringify({ decision: 'approve' }));
  } catch (err) {
    // On error, still approve but log
    console.error('[mcp-telemetry] Error:', err.message);
    console.log(JSON.stringify({ decision: 'approve' }));
  }
}

main();
