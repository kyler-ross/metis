---
name: pr-review
description: Run a multi-dimensional PR review with parallel analysis agents
argument-hint: <PR number or URL>
---

Load and follow the skill at `skills/workflows/pr-review/SKILL.md`.

If the skill file is not found, perform a manual PR review:
1. Get PR details: `gh pr view <number> --json title,body,files` and `gh pr diff <number>`
2. Review for: security issues (secrets, injection), code quality, test coverage, documentation, edge cases
3. Present findings in a prioritized table (CRITICAL/HIGH/MEDIUM/LOW)

Review target: $ARGUMENTS
