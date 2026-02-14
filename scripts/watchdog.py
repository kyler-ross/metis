#!/usr/bin/env python3
"""
PM AI System Watchdog - Comprehensive health monitoring.

Checks for manifest drift, knowledge freshness, cross-references,
structural integrity, and orphaned files.

Usage:
    python watchdog.py           # Full report (human readable)
    python watchdog.py --quick   # Essential checks only
    python watchdog.py --json    # JSON output for CI
    python watchdog.py --fix     # Auto-fix simple issues (with confirmation)
"""

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Set

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
from script_runner import run

# Configuration
MANIFEST_PATH = ".ai/config/agent-manifest.json"
KNOWLEDGE_DIR = ".ai/knowledge"
AGENT_DIRS = [".ai/agents", ".claude/agents"]
FRESHNESS_THRESHOLD_DAYS = 30
REPORTS_DIR = ".ai/reports"


@dataclass
class Issue:
    """Represents a detected issue."""
    severity: str  # "error", "warning", "info"
    category: str
    message: str
    file_path: Optional[str] = None
    fix_command: Optional[str] = None


@dataclass
class CheckResult:
    """Result of a single check."""
    name: str
    passed: bool
    issues: List[Issue] = field(default_factory=list)
    info: Dict = field(default_factory=dict)


@dataclass
class WatchdogReport:
    """Full watchdog report."""
    timestamp: str
    checks: List[CheckResult] = field(default_factory=list)
    error_count: int = 0
    warning_count: int = 0
    info_count: int = 0

    def add_check(self, result: CheckResult):
        self.checks.append(result)
        for issue in result.issues:
            if issue.severity == "error":
                self.error_count += 1
            elif issue.severity == "warning":
                self.warning_count += 1
            else:
                self.info_count += 1


def get_project_root() -> Path:
    """Get the project root directory."""
    current = Path.cwd()
    while current != current.parent:
        if (current / "CLAUDE.md").exists() or (current / ".ai").exists():
            return current
        current = current.parent
    return Path.cwd()


def check_manifest_drift(root: Path) -> CheckResult:
    """Compare filesystem agents vs manifest entries."""
    result = CheckResult(name="manifest_drift", passed=True)

    manifest_path = root / MANIFEST_PATH
    if not manifest_path.exists():
        result.passed = False
        result.issues.append(Issue(
            severity="error",
            category="manifest",
            message="Manifest file not found",
            file_path=MANIFEST_PATH,
            fix_command="python .ai/scripts/manifest-sync.py --apply"
        ))
        return result

    try:
        with open(manifest_path) as f:
            manifest = json.load(f)
    except json.JSONDecodeError as e:
        result.passed = False
        result.issues.append(Issue(
            severity="error",
            category="manifest",
            message=f"Invalid JSON in manifest: {e}",
            file_path=MANIFEST_PATH
        ))
        return result

    # Get manifest paths (handle both dict and array formats)
    # Skip local_only agents - they are gitignored and won't exist on filesystem
    agents_data = manifest.get("agents", {})
    if isinstance(agents_data, dict):
        # Dict format: {"agent-name": {path: ..., description: ...}}
        manifest_paths = {
            data.get("path") for data in agents_data.values()
            if isinstance(data, dict) and data.get("path") and not data.get("local_only", False)
        }
    else:
        # Array format: [{path: ..., name: ...}, ...]
        manifest_paths = {a.get("path") for a in agents_data if isinstance(a, dict) and not a.get("local_only", False)}

    # Get filesystem paths
    fs_paths = set()
    for agent_dir in AGENT_DIRS:
        dir_path = root / agent_dir
        if dir_path.exists():
            for md_file in dir_path.rglob("*.md"):
                if not md_file.name.startswith("_"):
                    fs_paths.add(str(md_file.relative_to(root)))

    # Check for drift
    missing_from_manifest = fs_paths - manifest_paths
    missing_from_fs = manifest_paths - fs_paths

    if missing_from_manifest:
        result.passed = False
        for path in sorted(missing_from_manifest):
            result.issues.append(Issue(
                severity="warning",
                category="manifest_drift",
                message=f"Agent file not in manifest: {path}",
                file_path=path,
                fix_command="python .ai/scripts/manifest-sync.py --apply"
            ))

    if missing_from_fs:
        result.passed = False
        for path in sorted(missing_from_fs):
            result.issues.append(Issue(
                severity="error",
                category="manifest_drift",
                message=f"Manifest entry missing from filesystem: {path}",
                file_path=path,
                fix_command="python .ai/scripts/manifest-sync.py --apply"
            ))

    result.info = {
        "manifest_count": len(manifest_paths),
        "filesystem_count": len(fs_paths),
        "drift_count": len(missing_from_manifest) + len(missing_from_fs)
    }

    return result


def check_knowledge_freshness(root: Path, threshold_days: int = FRESHNESS_THRESHOLD_DAYS) -> CheckResult:
    """Flag knowledge files not modified in threshold days."""
    result = CheckResult(name="knowledge_freshness", passed=True)

    knowledge_dir = root / KNOWLEDGE_DIR
    if not knowledge_dir.exists():
        result.issues.append(Issue(
            severity="info",
            category="freshness",
            message="Knowledge directory not found"
        ))
        return result

    threshold = datetime.now() - timedelta(days=threshold_days)
    stale_files = []

    for md_file in knowledge_dir.glob("*.md"):
        mtime = datetime.fromtimestamp(md_file.stat().st_mtime)
        if mtime < threshold:
            days_old = (datetime.now() - mtime).days
            stale_files.append((str(md_file.relative_to(root)), days_old))

    if stale_files:
        result.passed = False
        for path, days in sorted(stale_files, key=lambda x: -x[1]):
            result.issues.append(Issue(
                severity="warning",
                category="freshness",
                message=f"Knowledge file {days} days old: {path}",
                file_path=path
            ))

    result.info = {
        "total_files": len(list(knowledge_dir.glob("*.md"))),
        "stale_count": len(stale_files),
        "threshold_days": threshold_days
    }

    return result


def check_cross_references(root: Path) -> CheckResult:
    """Validate all manifest references exist (required_context, compatible_subagents)."""
    result = CheckResult(name="cross_references", passed=True)

    manifest_path = root / MANIFEST_PATH
    if not manifest_path.exists():
        return result

    try:
        with open(manifest_path) as f:
            manifest = json.load(f)
    except json.JSONDecodeError:
        return result

    # Handle both dict and array formats
    agents_data = manifest.get("agents", {})
    if isinstance(agents_data, dict):
        # Dict format: iterate over values
        agents_list = [
            {"name": name, **data}
            for name, data in agents_data.items()
            if isinstance(data, dict)
        ]
    else:
        agents_list = agents_data

    # Build lookup sets
    agent_paths = {a.get("path") for a in agents_list if a.get("path")}
    agent_names = {a.get("name") for a in agents_list if a.get("name")}

    for agent in agents_list:
        agent_path = agent.get("path", "unknown")

        # Check required_context references
        for ctx in agent.get("required_context", []):
            # Skip special values
            if ctx in ("all", "none", "*"):
                continue
            # Skip local-only files (personal data, not committed to git)
            if ctx in ("about-me.md", "about-cloaked.md"):
                continue
            # Context can be a full path or just a filename in .ai/knowledge/
            ctx_path = root / ctx
            if not ctx_path.exists():
                # Try in knowledge directory
                ctx_path = root / ".ai/knowledge" / ctx
            if not ctx_path.exists():
                # Try in config directory
                ctx_path = root / ".ai/config" / ctx
            if not ctx_path.exists():
                result.passed = False
                result.issues.append(Issue(
                    severity="error",
                    category="cross_reference",
                    message=f"Missing required_context: {ctx}",
                    file_path=agent_path
                ))

        # Check compatible_subagents references
        for subagent in agent.get("compatible_subagents", []):
            # Subagent could be a path or a name
            if subagent not in agent_paths and subagent not in agent_names:
                result.issues.append(Issue(
                    severity="warning",
                    category="cross_reference",
                    message=f"Unknown compatible_subagent: {subagent}",
                    file_path=agent_path
                ))

    return result


def check_structural_integrity(root: Path) -> CheckResult:
    """Verify frontmatter and no duplicates."""
    result = CheckResult(name="structural_integrity", passed=True)

    for agent_dir in AGENT_DIRS:
        dir_path = root / agent_dir
        if not dir_path.exists():
            continue

        for md_file in dir_path.rglob("*.md"):
            if md_file.name.startswith("_"):
                continue

            rel_path = str(md_file.relative_to(root))

            try:
                content = md_file.read_text()

                # Check for YAML frontmatter
                if not content.startswith("---"):
                    result.passed = False
                    result.issues.append(Issue(
                        severity="error",
                        category="structure",
                        message="Missing YAML frontmatter",
                        file_path=rel_path
                    ))
                    continue

                # Find closing delimiter
                lines = content.split("\n")
                has_closing = any(line.strip() == "---" for line in lines[1:20])
                if not has_closing:
                    result.passed = False
                    result.issues.append(Issue(
                        severity="error",
                        category="structure",
                        message="Unclosed YAML frontmatter",
                        file_path=rel_path
                    ))
                    continue

                # Check for name field
                frontmatter_section = content.split("---")[1] if "---" in content else ""
                if "name:" not in frontmatter_section:
                    result.issues.append(Issue(
                        severity="warning",
                        category="structure",
                        message="Missing 'name' field in frontmatter",
                        file_path=rel_path
                    ))

            except Exception as e:
                result.issues.append(Issue(
                    severity="error",
                    category="structure",
                    message=f"Could not read file: {e}",
                    file_path=rel_path
                ))

    return result


def check_duplicate_files(root: Path) -> CheckResult:
    """Find files with identical or near-identical content."""
    import hashlib

    result = CheckResult(name="duplicate_files", passed=True)

    # Directories to check for duplicates
    check_dirs = [".ai", ".claude"]

    # Directories to skip (dependencies, build artifacts, etc.)
    skip_dirs = {"node_modules", "__pycache__", ".git", "dist", "build", "venv"}

    # Build a map of content hash -> list of files
    hash_to_files: Dict[str, List[str]] = {}

    for check_dir in check_dirs:
        dir_path = root / check_dir
        if not dir_path.exists():
            continue

        for md_file in dir_path.rglob("*.md"):
            # Skip files in excluded directories
            if any(skip_dir in md_file.parts for skip_dir in skip_dirs):
                continue
            if md_file.name.startswith("_"):
                continue

            try:
                content = md_file.read_text()
                # Normalize content: strip whitespace, lowercase for comparison
                normalized = content.strip().lower()

                # Skip very small files (less than 100 chars) - not worth checking
                if len(normalized) < 100:
                    continue

                content_hash = hashlib.md5(normalized.encode()).hexdigest()
                rel_path = str(md_file.relative_to(root))

                if content_hash not in hash_to_files:
                    hash_to_files[content_hash] = []
                hash_to_files[content_hash].append(rel_path)

            except Exception:
                # Skip files we can't read
                continue

    # Report groups of identical files
    duplicate_groups = {h: files for h, files in hash_to_files.items() if len(files) > 1}

    for content_hash, files in duplicate_groups.items():
        result.passed = False
        # Sort so the "original" (shortest path or first alphabetically) comes first
        files_sorted = sorted(files, key=lambda f: (len(f), f))
        original = files_sorted[0]
        duplicates = files_sorted[1:]

        for dup in duplicates:
            result.issues.append(Issue(
                severity="warning",
                category="duplicate",
                message=f"Duplicate of {original}",
                file_path=dup,
                fix_command=f"rm '{dup}'"
            ))

    result.info = {
        "files_checked": sum(len(files) for files in hash_to_files.values()),
        "duplicate_groups": len(duplicate_groups),
        "duplicate_files": sum(len(files) - 1 for files in duplicate_groups.values())
    }

    return result


def check_json_validity(root: Path) -> CheckResult:
    """Check all JSON config files are valid."""
    result = CheckResult(name="json_validity", passed=True)

    json_files = [
        ".ai/config/agent-manifest.json",
        ".ai/config/knowledge-index.json",
        ".ai/config/team-members.json",
    ]

    for json_file in json_files:
        file_path = root / json_file
        if not file_path.exists():
            continue

        try:
            with open(file_path) as f:
                json.load(f)
        except json.JSONDecodeError as e:
            result.passed = False
            result.issues.append(Issue(
                severity="error",
                category="json",
                message=f"Invalid JSON: {e}",
                file_path=json_file
            ))

    return result


def check_eval_coverage(root: Path) -> CheckResult:
    """Check that core agents have corresponding eval tests."""
    result = CheckResult(name="eval_coverage", passed=True)

    # Core agents that should have tests
    core_agents = [
        "skills/core/product-coach/SKILL.md",
        "skills/core/sql-query-builder/SKILL.md",
        "skills/core/jira-ticket-writer/SKILL.md",
        "skills/core/weekly-update-writer/SKILL.md",
        "skills/specialized/transcript-organizer/SKILL.md",
    ]

    # Check eval test files exist
    eval_dir = root / ".ai/evals"
    if not eval_dir.exists():
        result.passed = False
        result.issues.append(Issue(
            severity="error",
            category="eval_coverage",
            message="Eval directory missing: .ai/evals/",
            fix_command="mkdir -p .ai/evals"
        ))
        return result

    # Check for test files
    test_files = list(eval_dir.glob("test_*.py"))
    if not test_files:
        result.passed = False
        result.issues.append(Issue(
            severity="error",
            category="eval_coverage",
            message="No eval test files found in .ai/evals/",
        ))
        return result

    # Read test file content to check for agent coverage
    test_content = ""
    for test_file in test_files:
        try:
            test_content += test_file.read_text()
        except Exception:
            pass

    # Check each core agent has a test reference
    untested_agents = []
    for agent_path in core_agents:
        agent_name = Path(agent_path).stem
        # Look for agent name or path in tests
        if agent_name not in test_content and agent_path not in test_content:
            untested_agents.append(agent_path)

    if untested_agents:
        for agent_path in untested_agents:
            result.issues.append(Issue(
                severity="warning",
                category="eval_coverage",
                message=f"Core agent missing eval test: {agent_path}",
                file_path=agent_path
            ))

    result.info = {
        "core_agents": len(core_agents),
        "tested_agents": len(core_agents) - len(untested_agents),
        "coverage_percent": round((len(core_agents) - len(untested_agents)) / len(core_agents) * 100)
    }

    return result


def run_all_checks(root: Path, quick: bool = False) -> WatchdogReport:
    """Run all checks and return report."""
    report = WatchdogReport(timestamp=datetime.now().isoformat())

    # Essential checks (always run)
    report.add_check(check_manifest_drift(root))
    report.add_check(check_structural_integrity(root))
    report.add_check(check_json_validity(root))

    if not quick:
        # Full checks
        report.add_check(check_knowledge_freshness(root))
        report.add_check(check_cross_references(root))
        report.add_check(check_duplicate_files(root))
        report.add_check(check_eval_coverage(root))

    return report


def format_human_report(report: WatchdogReport) -> str:
    """Format report for human reading."""
    lines = [
        "# PM AI System Health Check",
        f"Generated: {report.timestamp}",
        "",
        "## Summary",
        f"- Errors: {report.error_count}",
        f"- Warnings: {report.warning_count}",
        f"- Info: {report.info_count}",
        ""
    ]

    # Overall status
    if report.error_count == 0 and report.warning_count == 0:
        lines.append("**Status: HEALTHY**")
    elif report.error_count == 0:
        lines.append("**Status: HEALTHY with warnings**")
    else:
        lines.append("**Status: ISSUES FOUND**")
    lines.append("")

    # Check results
    for check in report.checks:
        status = "PASS" if check.passed else "FAIL"
        lines.append(f"## {check.name.replace('_', ' ').title()}: {status}")

        if check.info:
            for key, value in check.info.items():
                lines.append(f"- {key}: {value}")

        if check.issues:
            lines.append("")
            for issue in check.issues:
                severity_icon = {"error": "!!!", "warning": "!!", "info": "i"}.get(issue.severity, "?")
                lines.append(f"  [{severity_icon}] {issue.message}")
                if issue.file_path:
                    lines.append(f"      File: {issue.file_path}")
                if issue.fix_command:
                    lines.append(f"      Fix: {issue.fix_command}")

        lines.append("")

    return "\n".join(lines)


def format_json_report(report: WatchdogReport) -> dict:
    """Format report as JSON."""
    return {
        "timestamp": report.timestamp,
        "error_count": report.error_count,
        "warning_count": report.warning_count,
        "info_count": report.info_count,
        "status": "healthy" if report.error_count == 0 else "issues_found",
        "checks": [
            {
                "name": c.name,
                "passed": c.passed,
                "info": c.info,
                "issues": [
                    {
                        "severity": i.severity,
                        "category": i.category,
                        "message": i.message,
                        "file_path": i.file_path,
                        "fix_command": i.fix_command
                    }
                    for i in c.issues
                ]
            }
            for c in report.checks
        ]
    }


def main(ctx):
    parser = argparse.ArgumentParser(description="PM AI System health monitoring")
    parser.add_argument("--quick", action="store_true", help="Run essential checks only")
    parser.add_argument("--json", action="store_true", help="Output JSON for CI")
    parser.add_argument("--fix", action="store_true", help="Show fix commands for issues")
    args = parser.parse_args()

    root = get_project_root()
    report = run_all_checks(root, quick=args.quick)

    if args.json:
        print(json.dumps(format_json_report(report), indent=2))
    else:
        print(format_human_report(report))

        if args.fix and (report.error_count > 0 or report.warning_count > 0):
            print("\n## Suggested Fixes")
            for check in report.checks:
                for issue in check.issues:
                    if issue.fix_command:
                        print(f"  {issue.fix_command}")

    # Use ctx.report() for structured diagnostic output
    errors = []
    warnings = []
    ok = []

    for check in report.checks:
        if check.passed:
            ok.append(f"{check.name}: passed")
        else:
            for issue in check.issues:
                entry = {'message': issue.message, 'service': issue.category}
                if issue.severity == 'error':
                    errors.append(entry)
                elif issue.severity == 'warning':
                    warnings.append(entry)

    if report.error_count > 0:
        raise Exception(f"Watchdog found {report.error_count} error(s) and {report.warning_count} warning(s)")
    elif report.warning_count > 0:
        raise Exception(f"Watchdog found {report.warning_count} warning(s)")
    # All clear - just return


run(name='watchdog', mode='diagnostic', main=main, services=['jira'])
