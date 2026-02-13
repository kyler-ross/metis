#!/usr/bin/env bash
#
# Git pre-commit hook: blocks commits containing secrets or sensitive files.
# Install: ln -sf ../../.claude/hooks/git-pre-commit.sh .git/hooks/pre-commit
#

RED='\033[0;31m'
NC='\033[0m'
BLOCKED=0

# 1. Check for sensitive file patterns in staged files
# Catch all .env and .env.* files, then exclude .env.example
SENSITIVE_FILES=$(git diff --cached --name-only --diff-filter=ACM | \
    grep -E '(^|/)\.env($|\.)|\.google.*\.json$' | \
    grep -v '\.env\.example$' || true)

if [ -n "$SENSITIVE_FILES" ]; then
    printf '%b\n' "${RED}COMMIT BLOCKED: Sensitive files staged${NC}" >&2
    echo "The following files should not be committed:" >&2
    echo "$SENSITIVE_FILES" | while IFS= read -r f; do echo "  - $f" >&2; done
    echo "" >&2
    echo "Remove with: git reset HEAD <file>" >&2
    echo "If .env is tracked, run: git rm --cached .env" >&2
    BLOCKED=1
fi

# 2. Check staged file contents for secret patterns
# Patterns harmonized with cli-validator.py CREDENTIAL_PATTERNS
SECRET_PATTERNS='(sk-[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{20,}|xoxb-[A-Za-z0-9-]{10,}|xoxp-[A-Za-z0-9-]{10,}|ATATT[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{36,}|ghu_[A-Za-z0-9]{36,}|ghs_[A-Za-z0-9]{36,}|AKIA[0-9A-Z]{16}|phc_[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{30,}|figd_[A-Za-z0-9_-]{20,})'

STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -v '\.env\.example$' || true)

if [ -n "$STAGED_FILES" ]; then
    while IFS= read -r file; do
        # Skip binary files
        if git diff --cached --numstat -- "$file" | grep -q '^-'; then
            continue
        fi

        MATCHES=$(git show ":$file" 2>/dev/null | grep -nE "$SECRET_PATTERNS" || true)
        if [ -n "$MATCHES" ]; then
            printf '%b\n' "${RED}COMMIT BLOCKED: Secret pattern found in $file${NC}" >&2
            echo "$MATCHES" | head -5 | while IFS= read -r line; do
                # Replace matched secrets with [REDACTED]
                MASKED=$(echo "$line" | sed -E "s/$SECRET_PATTERNS/[REDACTED]/g" 2>/dev/null || echo "$line")
                echo "  $MASKED" >&2
            done
            BLOCKED=1
        fi
    done <<< "$STAGED_FILES"
fi

if [ "$BLOCKED" -eq 1 ]; then
    echo "" >&2
    echo "Use environment variables instead of hardcoded secrets." >&2
    echo "See CLAUDE.md 'API Keys & Credentials' section." >&2
    exit 1
fi

exit 0
