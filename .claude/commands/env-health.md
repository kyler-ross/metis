---
name: env-health
description: Check credential files, service connectivity, and system health
argument-hint: [--fix]
---

Load and follow the skill at `skills/utilities/env-health-check/SKILL.md`.

If the skill file is not found, run a manual health check:
1. Verify credential files exist: `.ai/scripts/.env`, `~/.cloaked-env.sh`
2. Check .env is not tracked: `git ls-files --error-unmatch .ai/scripts/.env` (should error)
3. Run diagnostics: `node .ai/scripts/setup-doctor.cjs`
4. Present results as a PASS/FAIL status table per service

Options: $ARGUMENTS
