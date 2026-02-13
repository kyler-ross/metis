---
name: pr-review
description: Multi-dimensional PR review with parallel analysis agents
---

# PR Review

## When to Use This Skill

- User asks to review a PR, code review, or "check my PR"
- Before merging significant changes
- When a team member asks for feedback on their PR

## Process

### 1. Load the PR

Get the PR details:
```bash
gh pr view <PR_NUMBER> --json title,body,additions,deletions,changedFiles,files
gh pr diff <PR_NUMBER>
```

### 2. Parallel Review (Claude Code)

Launch 5 review subagents simultaneously using the Task tool:

**Security Reviewer** (subagent_type: "general-purpose"):
- Check for hardcoded secrets, credential patterns (sk-, xoxb-, ghp_, etc.)
- Look for command injection, XSS, SQL injection risks
- Verify .env files aren't being tracked
- Check for overly permissive file permissions

**Code Quality Reviewer** (subagent_type: "general-purpose"):
- Identify code duplication, dead code, unnecessary complexity
- Check naming conventions and consistency
- Look for missing error handling at system boundaries
- Flag over-engineering or premature abstractions

**Test Coverage Reviewer** (subagent_type: "general-purpose"):
- Check if new code has corresponding tests
- Identify untested edge cases
- Verify test assertions are meaningful (not just checking existence)
- Look for flaky test patterns (timing, ordering dependencies)

**Documentation Reviewer** (subagent_type: "general-purpose"):
- Check if README/docs need updating for new features
- Verify API changes have updated documentation
- Look for misleading or outdated comments
- Check commit messages are descriptive

**Edge Case Reviewer** (subagent_type: "general-purpose"):
- SSH vs HTTPS auth differences
- Private repo access patterns
- Environment-specific behavior (dev vs prod)
- Race conditions, concurrency issues
- Null/empty/boundary value handling

### 3. Sequential Review (Cursor)

When parallel execution isn't available, run each reviewer sequentially in the order above.

### 4. Synthesize Findings

Merge all reviewer outputs into a prioritized table:

| Priority | Category | File:Line | Finding | Suggestion |
|----------|----------|-----------|---------|------------|
| CRITICAL | Security | ... | ... | ... |
| HIGH | Edge Case | ... | ... | ... |
| MEDIUM | Quality | ... | ... | ... |
| LOW | Docs | ... | ... | ... |

**Priority definitions:**
- **CRITICAL**: Security vulnerabilities, data loss risk, broken functionality
- **HIGH**: Bugs, missing edge cases, incorrect behavior
- **MEDIUM**: Code quality, maintainability, performance
- **LOW**: Style, documentation, minor improvements

### 5. Optional: Auto-Fix

If user requests fixes:
1. For each finding (highest priority first), create a fix
2. Run tests after each fix
3. If tests fail, revert and report
4. Commit fixes in a single commit referencing the review

## Output Format

```
## PR Review: #<number> - <title>

**Summary**: <1-2 sentence overview>
**Risk Level**: LOW / MEDIUM / HIGH / CRITICAL

### Findings (<count>)

| Priority | Category | Location | Finding | Fix |
|----------|----------|----------|---------|-----|
| ... | ... | ... | ... | ... |

### Verdict

<APPROVE / REQUEST CHANGES / COMMENT>

<Brief rationale>
```

## Rules

1. Never approve a PR with CRITICAL findings
2. Always check for secrets before anything else
3. Be specific - reference exact file:line, not vague concerns
4. Suggest fixes, don't just point out problems
5. Acknowledge what's done well - reviews should be balanced
