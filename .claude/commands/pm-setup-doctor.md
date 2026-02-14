---
description: Diagnose setup issues and provide fixes
---

# PM AI Setup Doctor

Run comprehensive diagnostics on your PM AI setup to identify and fix issues.

```bash
node pm/.ai/scripts/setup-doctor.cjs
```

## What It Checks

**Runtime Requirements:**
- Node.js version (>= 18.0.0)
- Python version (>= 3.9.0)
- Git installation

**Directory Structure:**
- Required directories exist
- Proper file organization

**Configuration Files:**
- .env file exists and contains required variables
- MCP config is valid JSON
- All required credentials present

**API Credentials:**
- Atlassian (Jira + Confluence) - tests actual API
- GitHub PAT - validates scopes
- Gemini API - tests connectivity
- PostHog - verifies access

**Optional Components:**
- Analytics database
- Background daemon (LaunchAgent/systemd)
- Shell alias (pm-claude)
- Setup state and completion

## Output

The doctor provides:
- ✓ Checks that passed
- ❌ Critical issues with specific fixes
- ⚠ Warnings for optional components
- Remediation steps for each issue

## Common Issues

**Missing credentials:**
```
Fix: Re-run wizard or add manually to .env
Command: node .ai/scripts/setup-wizard.js
```

**Invalid MCP config:**
```
Fix: Regenerate configuration
Command: node .ai/scripts/installers/mcp-generator.js generate
```

**Credential validation failed:**
```
Fix: Check API token and permissions
Follow the suggestion provided in the error
```

## After Fixing Issues

Re-run the doctor to verify:
```bash
node pm/.ai/scripts/setup-doctor.cjs
```

Then test with:
```
/pm-status
```
