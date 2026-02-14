#!/usr/bin/env python3
"""
CI Reporter - Generate PR comments from validation results.

Combines watchdog and system-eval results into a formatted PR comment
with score badges, check summaries, and actionable recommendations.

Usage:
    python ci-reporter.py --watchdog watchdog.json --eval eval.json
    python ci-reporter.py --watchdog watchdog.json  # eval optional
"""

import argparse
import json
import sys
import os
from datetime import datetime
from typing import Dict, List, Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
from script_runner import run


def get_score_badge(score: int) -> str:
    """Return emoji badge based on score."""
    if score >= 85:
        return "PASS"
    elif score >= 70:
        return "WARN"
    else:
        return "FAIL"


def get_status_emoji(status: str) -> str:
    """Return status emoji."""
    return {
        "healthy": "OK",
        "issues_found": "XX",
        "pass": "OK",
        "fail": "XX",
        "warn": "!!"
    }.get(status.lower(), "??")


def format_check_table(checks: List[dict]) -> str:
    """Format checks as a markdown table."""
    lines = [
        "| Check | Status | Issues |",
        "|-------|--------|--------|"
    ]

    for check in checks:
        name = check.get("name", "unknown").replace("_", " ").title()
        passed = check.get("passed", False)
        status = "OK" if passed else "XX"
        issue_count = len(check.get("issues", []))
        issues_str = str(issue_count) if issue_count > 0 else "-"
        lines.append(f"| {name} | {status} | {issues_str} |")

    return "\n".join(lines)


def format_issues_list(checks: List[dict], max_issues: int = 10) -> str:
    """Format top issues as a list."""
    all_issues = []
    for check in checks:
        for issue in check.get("issues", []):
            all_issues.append({
                "check": check.get("name", "unknown"),
                **issue
            })

    if not all_issues:
        return "_No issues found._"

    # Sort by severity (errors first)
    severity_order = {"error": 0, "warning": 1, "info": 2}
    all_issues.sort(key=lambda x: severity_order.get(x.get("severity", "info"), 3))

    lines = []
    for issue in all_issues[:max_issues]:
        severity = issue.get("severity", "info")
        icon = {"error": "XX", "warning": "!!", "info": "i"}.get(severity, "?")
        message = issue.get("message", "Unknown issue")
        file_path = issue.get("file_path", "")

        if file_path:
            lines.append(f"- [{icon}] {message} (`{file_path}`)")
        else:
            lines.append(f"- [{icon}] {message}")

    if len(all_issues) > max_issues:
        lines.append(f"\n_...and {len(all_issues) - max_issues} more issues_")

    return "\n".join(lines)


def format_recommendations(checks: List[dict]) -> str:
    """Extract and format fix recommendations."""
    fixes = []
    for check in checks:
        for issue in check.get("issues", []):
            if issue.get("fix_command") and issue["fix_command"] not in fixes:
                fixes.append(issue["fix_command"])

    if not fixes:
        return ""

    lines = ["### Suggested Fixes", "```bash"]
    lines.extend(fixes[:5])  # Limit to 5 fixes
    lines.append("```")

    return "\n".join(lines)


def format_eval_metrics(eval_data: dict) -> str:
    """Format evaluation metrics."""
    metrics = eval_data.get("metrics", {})
    if not metrics:
        return ""

    lines = [
        "### System Evaluation Metrics",
        "| Metric | Score | Target |",
        "|--------|-------|--------|"
    ]

    for name, data in metrics.items():
        if isinstance(data, dict):
            score = data.get("score", "N/A")
            target = data.get("target", "N/A")
            lines.append(f"| {name.title()} | {score} | {target} |")

    return "\n".join(lines)


def generate_pr_comment(watchdog_data: Optional[dict], eval_data: Optional[dict]) -> str:
    """Generate the full PR comment."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    lines = [
        "## PM AI System Validation Report",
        f"_Generated: {timestamp}_",
        ""
    ]

    # Summary section
    summary_parts = []

    if watchdog_data:
        error_count = watchdog_data.get("error_count", 0)
        warning_count = watchdog_data.get("warning_count", 0)
        status = watchdog_data.get("status", "unknown")
        emoji = get_status_emoji(status)
        summary_parts.append(f"**Watchdog:** {emoji} ({error_count} errors, {warning_count} warnings)")

    if eval_data:
        overall_score = eval_data.get("overall_score", 0)
        badge = get_score_badge(overall_score)
        summary_parts.append(f"**Evaluation:** {badge} (Score: {overall_score}/100)")

    if summary_parts:
        lines.append("### Summary")
        lines.extend(summary_parts)
        lines.append("")

    # Determine overall status
    has_errors = (watchdog_data and watchdog_data.get("error_count", 0) > 0)
    low_score = (eval_data and eval_data.get("overall_score", 100) < 70)

    if has_errors or low_score:
        lines.append("### Status: BLOCKED")
        if has_errors:
            lines.append("- Watchdog found critical errors that must be fixed")
        if low_score:
            lines.append("- System evaluation score below 70 threshold")
        lines.append("")
    else:
        lines.append("### Status: APPROVED")
        lines.append("")

    # Watchdog details
    if watchdog_data:
        checks = watchdog_data.get("checks", [])

        lines.append("### Health Checks")
        lines.append(format_check_table(checks))
        lines.append("")

        # Issues list
        issues_section = format_issues_list(checks)
        if issues_section != "_No issues found._":
            lines.append("### Issues Found")
            lines.append(issues_section)
            lines.append("")

        # Recommendations
        recommendations = format_recommendations(checks)
        if recommendations:
            lines.append(recommendations)
            lines.append("")

    # Eval metrics
    if eval_data:
        metrics_section = format_eval_metrics(eval_data)
        if metrics_section:
            lines.append(metrics_section)
            lines.append("")

    # Footer
    lines.append("---")
    lines.append("_This report was generated automatically by the PM AI System CI pipeline._")

    return "\n".join(lines)


def main(ctx):
    parser = argparse.ArgumentParser(description="Generate PR comment from validation results")
    parser.add_argument("--watchdog", type=str, help="Path to watchdog JSON output")
    parser.add_argument("--eval", type=str, help="Path to system-eval JSON output")
    args = parser.parse_args()

    watchdog_data = None
    eval_data = None

    if args.watchdog:
        try:
            with open(args.watchdog) as f:
                watchdog_data = json.load(f)
        except (IOError, json.JSONDecodeError) as e:
            print(f"Warning: Could not load watchdog data: {e}", file=sys.stderr)

    if args.eval:
        try:
            with open(args.eval) as f:
                eval_data = json.load(f)
        except (IOError, json.JSONDecodeError) as e:
            print(f"Warning: Could not load eval data: {e}", file=sys.stderr)

    if not watchdog_data and not eval_data:
        raise Exception("At least one of --watchdog or --eval must be provided")

    comment = generate_pr_comment(watchdog_data, eval_data)
    print(comment)

run(name='ci-reporter', mode='operational', main=main, services=['local'])
