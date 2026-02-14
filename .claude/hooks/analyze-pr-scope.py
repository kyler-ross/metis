#!/usr/bin/env python3
"""
Analyze PR scope - standalone script for checking if changes span multiple scopes.

Usage:
  python3 analyze-pr-scope.py           # Analyze current branch vs origin/main
  python3 analyze-pr-scope.py --json    # Output as JSON
  python3 analyze-pr-scope.py --help    # Show help

This script categorizes changed files into scopes and suggests how to split
multi-scope changes into separate PRs.
"""
import argparse
import json
import subprocess
import sys
from collections import defaultdict

# Scope patterns - files matching these patterns belong to specific scopes
SCOPE_PATTERNS = {
    'telemetry': [
        '.ai/scripts/lib/telemetry',
        '.ai/scripts/lib/auth-',
        '.ai/scripts/lib/service-definitions',
        '.ai/scripts/lib/error-categories',
        '.ai/scripts/lib/script-init',
    ],
    'sheets-api': [
        '.ai/scripts/google-sheets',
        '.ai/tools/lib/sheets-',
    ],
    'ci': [
        '.github/workflows/',
        '.pre-commit-config',
    ],
    'skills': [
        'skills/',
    ],
    'electron': [
        'electron-app/',
    ],
    'knowledge': [
        '.ai/knowledge/',
    ],
    'evals': [
        '.ai/evals/',
    ],
    'hooks': [
        '.claude/hooks/',
        '.claude/settings',
    ],
    'scripts': [
        '.ai/scripts/',
    ],
    'config': [
        '.ai/config/',
        '.claude/commands/',
    ],
}

# Branch name suggestions for each scope
BRANCH_PREFIXES = {
    'telemetry': 'refactor/telemetry-',
    'sheets-api': 'refactor/sheets-api-',
    'ci': 'feat/ci-',
    'skills': 'feat/skills-',
    'electron': 'feat/electron-',
    'knowledge': 'docs/knowledge-',
    'evals': 'test/evals-',
    'hooks': 'feat/hooks-',
    'scripts': 'feat/scripts-',
    'config': 'chore/config-',
}


def get_changed_files(base_branch='origin/main'):
    """Get list of files that would be included in the PR."""
    try:
        # Get files different from the base branch
        result = subprocess.run(
            ['git', 'diff', '--name-only', f'{base_branch}...HEAD'],
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

        # Also get unstaged changes
        result = subprocess.run(
            ['git', 'diff', '--name-only'],
            capture_output=True,
            text=True,
            check=True
        )
        unstaged_files = set(result.stdout.strip().split('\n')) if result.stdout.strip() else set()

        return list(committed_files | staged_files | unstaged_files)
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

    # Get scopes excluding 'other'
    scopes = [s for s in scope_files.keys() if s != 'other']
    if not scopes and 'other' in scope_files:
        scopes = ['other']

    return {
        'scope_count': len(scopes),
        'scopes': scopes,
        'scope_files': dict(scope_files),
        'is_single_scope': len(scopes) <= 1,
        'suggested_splits': [
            {
                'scope': scope,
                'branch': f"{BRANCH_PREFIXES.get(scope, 'feat/')}{scope}",
                'files': scope_files[scope],
                'file_count': len(scope_files[scope])
            }
            for scope in scopes
            if scope != 'other'
        ]
    }


def print_human_readable(analysis):
    """Print analysis in human-readable format."""
    files_changed = sum(len(f) for f in analysis['scope_files'].values())

    print(f"PR Scope Analysis")
    print(f"=" * 50)
    print(f"Total files changed: {files_changed}")
    print(f"Scopes detected: {analysis['scope_count']}")
    print(f"Status: {'✅ Single-scope' if analysis['is_single_scope'] else '⚠️  Multi-scope'}")
    print()

    for scope in analysis['scopes']:
        files_in_scope = analysis['scope_files'].get(scope, [])
        print(f"[{scope}] ({len(files_in_scope)} files)")
        for f in files_in_scope:
            print(f"  - {f}")
        print()

    if not analysis['is_single_scope']:
        print("Suggested splits:")
        print("-" * 50)
        for i, split in enumerate(analysis['suggested_splits'], 1):
            print(f"{i}. Branch: {split['branch']}")
            print(f"   Files: {split['file_count']}")
            for f in split['files'][:3]:
                print(f"     - {f}")
            if len(split['files']) > 3:
                print(f"     ... and {len(split['files']) - 3} more")
            print()


def main():
    parser = argparse.ArgumentParser(
        description='Analyze PR scope to check for single-purpose',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s                    # Analyze current changes
  %(prog)s --json             # Output as JSON
  %(prog)s --base develop     # Compare against develop branch
        """
    )
    parser.add_argument('--json', action='store_true', help='Output as JSON')
    parser.add_argument('--base', default='origin/main', help='Base branch to compare against')
    args = parser.parse_args()

    files = get_changed_files(args.base)

    if not files:
        if args.json:
            print(json.dumps({'scope_count': 0, 'scopes': [], 'is_single_scope': True}))
        else:
            print("No changed files detected.")
        sys.exit(0)

    analysis = analyze_pr_scope(files)

    if args.json:
        print(json.dumps(analysis, indent=2))
    else:
        print_human_readable(analysis)

    # Exit with 1 if multi-scope (for scripting)
    sys.exit(0 if analysis['is_single_scope'] else 1)


if __name__ == "__main__":
    main()
