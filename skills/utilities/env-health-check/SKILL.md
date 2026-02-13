---
name: env-health-check
description: Validate credential files, service connectivity, and system health
---

# Environment Health Check

## When to Use This Skill

- User asks to check credentials, system health, or "env health"
- After 2+ auth failures in a session (proactive trigger)
- Before starting a complex workflow that depends on multiple services
- When diagnosing "why isn't X working?"

## Process

### 1. Credential Files Check

Verify existence and permissions:

| Check | Command | Pass Criteria |
|-------|---------|---------------|
| `scripts/.env` exists | `test -f scripts/.env` | File exists |
| `~/.pm-ai-env.sh` exists | `test -f ~/.pm-ai-env.sh` | File exists |
| `.env` not in git | `git ls-files --error-unmatch scripts/.env 2>&1` | Returns error (not tracked) |
| `.env` in `.gitignore` | `grep -q '\.env' .gitignore` | Pattern found |
| OAuth token exists | `test -f scripts/.google-token.json` | File exists |

### 2. Required Keys Check

Verify required keys are present (NOT their values):

```bash
# Check .env has required keys
for key in JIRA_API_KEY ATLASSIAN_EMAIL GEMINI_API_KEY SLACK_BOT_TOKEN; do
  grep -q "^${key}=" scripts/.env
done

# Check shell env has required keys
for key in POSTHOG_API_KEY GITHUB_PERSONAL_ACCESS_TOKEN; do
  grep -q "^export ${key}=" ~/.pm-ai-env.sh
done
```

### 3. Service Connectivity

Run the setup doctor for comprehensive checks:

```bash
node scripts/setup-doctor.cjs
```

### 4. MCP Server Status

Check each MCP server is responsive (use a lightweight read-only call):

| Service | Test |
|---------|------|
| GitHub | `gh auth status` |
| PostHog | PostHog MCP `organizations-get` |
| Figma | Figma MCP connection check |

### 5. System Dependencies

```bash
which node python3 tesseract ffmpeg
node --version
python3 --version
```

### 6. OAuth Token Freshness

```bash
# Check if Google token is older than 6 hours (may need refresh)
find scripts/.google-token.json -mmin +360 2>/dev/null
```

### 7. Git Hook Installation

```bash
# Check pre-commit hook is installed
test -x .git/hooks/pre-commit && echo "PASS" || echo "FAIL: run ln -sf ../../.claude/hooks/git-pre-commit.sh .git/hooks/pre-commit"
```

## Output Format

```
## Environment Health Report

| Check | Status | Details |
|-------|--------|---------|
| Credential files | PASS/FAIL | ... |
| Required keys | PASS/FAIL | Missing: ... |
| Jira | PASS/FAIL | ... |
| Google (OAuth) | PASS/FAIL | ... |
| Slack | PASS/FAIL | ... |
| PostHog | PASS/FAIL | ... |
| GitHub | PASS/FAIL | ... |
| Figma | PASS/FAIL | ... |
| Gemini | PASS/FAIL | ... |
| System deps | PASS/FAIL | Missing: ... |
| Git hooks | PASS/FAIL | ... |

**Overall: X/11 checks passing**
```

## Auto-Fix Mode

When user passes `--fix` or asks to fix issues:

1. `.env` missing: Copy from `.env.example` if available
2. `.env` tracked in git: `git rm --cached scripts/.env`
3. OAuth expired: Run `node scripts/google-auth-setup.js`
4. Missing system deps: `brew install <missing>`
5. Git hook not installed: `ln -sf ../../.claude/hooks/git-pre-commit.sh .git/hooks/pre-commit`
6. For credential issues: Run `node scripts/setup-doctor.cjs --fix`

Always ask for confirmation before auto-fixing credential files.

## Rules

1. NEVER display actual credential values - only check presence
2. Always run the full check suite, even if user only asks about one service
3. When reporting failures, include the exact fix command
4. If 3+ services fail, suggest running `setup-doctor.cjs --fix` as a batch fix
