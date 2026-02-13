#!/usr/bin/env python3
"""
PreToolUse hook that enforces single-purpose PRs.

When an agent tries to run `gh pr create`, this hook analyzes the staged changes
and blocks if the PR touches multiple unrelated scopes. The agent is instructed
to split into separate focused PRs.

Exit codes:
  0 = allow (single scope or not a gh pr command)
  2 = block (multi-scope PR detected)
"""
import json
import subprocess
import sys
from collections import defaultdict

# Scope patterns - files matching these patterns belong to specific scopes.
# Ordered most-specific first: a file matches the FIRST pattern it hits.
# Customize these patterns to match your project structure.
SCOPE_PATTERNS = {
    'scripts': [
        'scripts/lib/',
        'scripts/',
    ],
    'ci': [
        '.github/workflows/',
        '.pre-commit-config',
    ],
    'skills': [
        'skills/',
    ],
    'knowledge': [
        'knowledge/',
    ],
    'hooks': [
        '.claude/hooks/',
        '.claude/settings',
    ],
    'config': [
        '.claude/commands/',
        'config/',
    ],
    'docs': [
        'docs/',
    ],
}

# Companion scopes - allowed to accompany any other scope without triggering
# a multi-scope block. These are supporting infrastructure that commonly
# changes alongside the code it supports:
#   - config: CLI commands, agent manifests
#   - hooks: enforcement rules that change with the code they enforce
#   - ci: GHA workflows that deploy/run the code being changed
COMPANION_SCOPES = {'config', 'hooks', 'ci'}

# Branch name suggestions for each scope
BRANCH_PREFIXES = {
    'scripts': 'refactor/scripts-',
    'ci': 'feat/ci-',
    'skills': 'feat/skills-',
    'knowledge': 'docs/knowledge-',
    'hooks': 'feat/hooks-',
    'config': 'chore/config-',
    'docs': 'docs/',
}


def get_changed_files():
    """Get list of files that would be included in the PR (staged + committed on branch)."""
    try:
        # Get files different from the base branch (usually main)
        result = subprocess.run(
            ['git', 'diff', '--name-only', 'origin/main...HEAD'],
            capture_output=True,
            text=True,
            check=True
        )
        committed_files = set(result.stdout.strip().split('\n')) if result.stdout.strip() else set()

        # Also get staged files not yet committed
        result = subprocess.run(
            ['git', 'diff', '--name-only', '--cached'],
            capture_output=True,
            text=True,
            check=True
        )
        staged_files = set(result.stdout.strip().split('\n')) if result.stdout.strip() else set()

        return list(committed_files | staged_files)
    except subprocess.CalledProcessError as e:
        print(f"Warning: git command failed: {e}", file=sys.stderr)
        if e.stderr:
            print(f"  stderr: {e.stderr.strip()}", file=sys.stderr)
        if e.stdout:
            print(f"  stdout: {e.stdout.strip()}", file=sys.stderr)
        return []


def classify_file(filepath):
    """Classify a file into a scope category."""
    for scope, patterns in SCOPE_PATTERNS.items():
        for pattern in patterns:
            if pattern in filepath:
                return scope
    return 'other'


def analyze_pr_scope(files):
    """Analyze files and return scope information."""
    scope_files = defaultdict(list)

    for f in files:
        if not f:
            continue
        scope = classify_file(f)
        scope_files[scope].append(f)

    # Remove 'other' if there are specific scopes
    scopes = [s for s in scope_files.keys() if s != 'other']
    if not scopes and 'other' in scope_files:
        scopes = ['other']

    # Primary scopes are the ones that actually determine if a PR is multi-scope.
    # Companion scopes (config, hooks) are allowed to accompany code changes
    # without forcing a split - docs/config should travel with related code.
    primary_scopes = [s for s in scopes if s not in COMPANION_SCOPES]
    # Only count companions as primary if the PR is *only* companion scopes
    if not primary_scopes:
        primary_scopes = scopes

    return {
        'scope_count': len(primary_scopes),
        'scopes': scopes,
        'scope_files': dict(scope_files),
        'suggested_splits': [
            {
                'scope': scope,
                'branch': f"{BRANCH_PREFIXES.get(scope, 'feat/')}{scope}",
                'files': scope_files[scope]
            }
            for scope in scopes
            if scope != 'other'
        ]
    }


def main():
    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(f"Hook error: Invalid JSON input: {e}", file=sys.stderr)
        sys.exit(1)

    tool_name = input_data.get("tool_name", "")
    tool_input = input_data.get("tool_input", {})
    command = tool_input.get("command", "")

    # Only intercept Bash commands
    if tool_name != "Bash" or not command:
        sys.exit(0)

    # Only intercept gh pr create commands
    if "gh pr create" not in command:
        sys.exit(0)

    # Analyze the PR scope
    files = get_changed_files()

    if not files:
        # No files to check
        sys.exit(0)

    analysis = analyze_pr_scope(files)

    # Allow single-scope PRs
    if analysis['scope_count'] <= 1:
        sys.exit(0)

    # Block multi-scope PRs with helpful message
    print("=" * 60, file=sys.stderr)
    print("PR SCOPE ENFORCEMENT: MULTI-SCOPE PR DETECTED", file=sys.stderr)
    print("=" * 60, file=sys.stderr)
    print(file=sys.stderr)
    print(f"This PR touches {analysis['scope_count']} distinct areas:", file=sys.stderr)

    for scope in analysis['scopes']:
        files_in_scope = analysis['scope_files'].get(scope, [])
        print(f"\n  [{scope}] ({len(files_in_scope)} files)", file=sys.stderr)
        for f in files_in_scope[:5]:  # Show first 5 files
            print(f"    - {f}", file=sys.stderr)
        if len(files_in_scope) > 5:
            print(f"    ... and {len(files_in_scope) - 5} more", file=sys.stderr)

    print(file=sys.stderr)
    print("REQUIRED ACTION: Split into separate PRs:", file=sys.stderr)
    print(file=sys.stderr)

    for i, split in enumerate(analysis['suggested_splits'], 1):
        print(f"  {i}. Create branch: {split['branch']}", file=sys.stderr)
        print(f"     Files: {', '.join(split['files'][:3])}", file=sys.stderr)
        if len(split['files']) > 3:
            print(f"     ... and {len(split['files']) - 3} more", file=sys.stderr)
        print(file=sys.stderr)

    print("To proceed:", file=sys.stderr)
    print("  1. Stash or commit current work", file=sys.stderr)
    print("  2. Create a new branch for each scope", file=sys.stderr)
    print("  3. Cherry-pick or recreate the relevant changes", file=sys.stderr)
    print("  4. Create separate PRs for each scope", file=sys.stderr)
    print(file=sys.stderr)
    print("=" * 60, file=sys.stderr)

    sys.exit(2)


if __name__ == "__main__":
    main()
