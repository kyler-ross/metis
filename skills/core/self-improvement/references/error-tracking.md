---
name: error-tracking
description: Resource file for self-improvement agent
type: resource
---

# Error Tracking Integration

This agent is integrated with the **PM AI Usage Analytics System** which includes automatic error detection during enrichment.

## 1. Check for Auto-Detected Errors

The enrichment daemon automatically detects errors in sessions with quality < 70 or outcome != completed.

Check for new error patterns:
```bash
node .ai/scripts/pm-analytics.js errors list --status=new
node .ai/scripts/pm-analytics.js errors stats
```

## 2. Review Error Details

Get full details of an error pattern:
```bash
node .ai/scripts/pm-analytics.js errors list --status=new --json
```

Each pattern includes:
- Title and description
- Error type (api_failure, tool_error, hallucination, stuck_loop, timeout, etc.)
- Root cause analysis (from Gemini)
- Suggested fix
- Prevention tips
- Severity level
- Occurrence count
- Session IDs affected

## 3. Create GitHub Issue for Human Review

For errors that need tracking, create a GitHub issue:
```bash
node .ai/scripts/pm-analytics.js errors create-issue --id=123
```

This creates an issue with:
- Auto-generated title: `[Auto] category: title`
- Full error analysis in body
- Labels: `auto-generated`, category, severity
- Session evidence links

**Human-in-the-Loop**: Issues are created as drafts. User reviews and approves before posting.

## 4. Implement Fix

After reviewing the error pattern:
1. Read the suggested fix from the error pattern
2. Implement the architectural solution (not just a patch)
3. Test the fix
4. Commit with reference to the error pattern

## 5. Mark as Fixed

When the fix is deployed and verified:
```bash
# Update error status in database
# (This happens automatically when GitHub issue is closed)
```

## CLI Reference

```bash
# View error statistics
node .ai/scripts/pm-analytics.js errors stats

# List error patterns by status
node .ai/scripts/pm-analytics.js errors list --status=new
node .ai/scripts/pm-analytics.js errors list --status=investigating
node .ai/scripts/pm-analytics.js errors list --status=fixed

# Get JSON output for programmatic access
node .ai/scripts/pm-analytics.js errors list --json

# Create GitHub issue for tracking
node .ai/scripts/pm-analytics.js errors create-issue --id=123
```

## Workflow Example

```
User: "/pm-improve Review and fix auto-detected errors"

Agent Actions:
1. node .ai/scripts/pm-analytics.js errors list --status=new
2. Review top severity errors first (critical > high > medium > low)
3. For each pattern:
   - Read root cause and suggested fix
   - Implement architectural solution
   - Test the fix
   - Create GitHub issue for tracking if needed
   - Commit with pattern reference
4. Monitor: node .ai/scripts/pm-analytics.js errors stats
```

## Error Types Detected

- **api_failure**: API calls failing (rate limits, auth, timeouts)
- **tool_error**: Tool execution errors (Bash, Read, Edit failures)
- **hallucination**: Agent providing incorrect information
- **stuck_loop**: Repetitive actions without progress
- **timeout**: Operations exceeding time limits
- **permission_error**: File system or API permission issues
- **null_reference**: Missing data or broken references
- **other**: Uncategorized errors
