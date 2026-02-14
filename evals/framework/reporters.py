"""
Report generation for evaluation results.
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from .base import EvalReport, EvalResult, EvalStatus


class MarkdownReporter:
    """Generate markdown reports from evaluation results."""

    def __init__(self, output_dir: Optional[str] = None):
        self.output_dir = Path(output_dir) if output_dir else Path(".ai/evals/results")
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def generate(self, report: EvalReport, filename: Optional[str] = None) -> str:
        """Generate a markdown report and save to file."""
        content = self._build_report(report)

        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"eval_{timestamp}.md"

        output_path = self.output_dir / filename
        output_path.write_text(content)

        return str(output_path)

    def _build_report(self, report: EvalReport) -> str:
        """Build the markdown report content."""
        lines = [
            "# Evaluation Report",
            "",
            f"**Generated:** {report.timestamp}",
            f"**Duration:** {report.duration_ms:.1f}ms",
            "",
            "## Branches Compared",
            "",
            f"| Branch | Path | Commit |",
            f"|--------|------|--------|",
            f"| **A: {report.branch_a.name}** | `{report.branch_a.path}` | `{report.branch_a.commit_hash[:7]}` |",
            f"| **B: {report.branch_b.name}** | `{report.branch_b.path}` | `{report.branch_b.commit_hash[:7]}` |",
            "",
            "## Summary",
            "",
            f"- **Total evaluations:** {len(report.results)}",
            f"- **Passed:** {report.passed}",
            f"- **Failed:** {report.failed}",
            f"- **Improvements:** {report.improvements}",
            f"- **Regressions:** {report.regressions}",
            "",
        ]

        # Group results by evaluator
        by_evaluator = {}
        for result in report.results:
            by_evaluator.setdefault(result.evaluator, []).append(result)

        # Results by evaluator
        for evaluator_name, results in by_evaluator.items():
            lines.extend([
                f"## {evaluator_name.replace('_', ' ').title()}",
                "",
                "| Metric | Branch A | Branch B | Delta | Status |",
                "|--------|----------|----------|-------|--------|",
            ])

            for result in results:
                val_a = result.details.get("branch_a", result.expected)
                val_b = result.value

                # Format values
                if isinstance(val_a, float):
                    val_a_str = f"{val_a:.1f}"
                else:
                    val_a_str = str(val_a) if val_a is not None else "-"

                if isinstance(val_b, float):
                    val_b_str = f"{val_b:.1f}"
                else:
                    val_b_str = str(val_b) if val_b is not None else "-"

                # Format delta
                if result.delta is not None:
                    delta_str = f"{result.delta:+.1f}"
                    if result.delta_pct is not None:
                        delta_str += f" ({result.delta_pct:+.1f}%)"
                else:
                    delta_str = "-"

                # Status indicator
                if result.improved is True:
                    status = "✅ Improved"
                elif result.improved is False and result.delta != 0:
                    status = "⚠️ Regressed"
                elif result.status == EvalStatus.PASSED:
                    status = "✓"
                elif result.status == EvalStatus.FAILED:
                    status = "✗"
                else:
                    status = "-"

                # Clean up metric name
                metric_name = result.name.replace(f"{evaluator_name}:", "")

                lines.append(
                    f"| {metric_name} | {val_a_str} | {val_b_str} | {delta_str} | {status} |"
                )

            lines.append("")

        # Conclusion
        lines.extend([
            "## Conclusion",
            "",
        ])

        if report.improvements > report.regressions:
            lines.append(
                f"**{report.branch_b.name}** shows net improvement "
                f"({report.improvements} improvements vs {report.regressions} regressions)"
            )
        elif report.regressions > report.improvements:
            lines.append(
                f"**{report.branch_a.name}** performs better "
                f"({report.regressions} regressions vs {report.improvements} improvements)"
            )
        else:
            lines.append("No significant difference between branches")

        return "\n".join(lines)


class JSONReporter:
    """Generate JSON reports from evaluation results."""

    def __init__(self, output_dir: Optional[str] = None):
        self.output_dir = Path(output_dir) if output_dir else Path(".ai/evals/results")
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def generate(self, report: EvalReport, filename: Optional[str] = None) -> str:
        """Generate a JSON report and save to file."""
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"eval_{timestamp}.json"

        output_path = self.output_dir / filename
        output_path.write_text(report.to_json())

        return str(output_path)


def print_summary(report: EvalReport):
    """Print a quick summary to console."""
    print("\n" + "=" * 60)
    print("EVALUATION SUMMARY")
    print("=" * 60)
    print(f"\nBranch A: {report.branch_a.name} ({report.branch_a.commit_hash[:7]})")
    print(f"Branch B: {report.branch_b.name} ({report.branch_b.commit_hash[:7]})")
    print(f"\nDuration: {report.duration_ms:.1f}ms")
    print(f"Total: {len(report.results)} | Passed: {report.passed} | Failed: {report.failed}")
    print(f"Improvements: {report.improvements} | Regressions: {report.regressions}")
    print()

    # Show key metrics
    key_metrics = [
        "tokens:total",
        "tokens:CLAUDE.md",
        "routing:accuracy",
        "context:efficiency",
        "priming:coverage",
    ]

    print(f"{'Metric':<30} {'A':>10} {'B':>10} {'Delta':>15}")
    print("-" * 65)

    for result in report.results:
        if result.name in key_metrics or any(result.name.endswith(m) for m in key_metrics):
            val_a = result.details.get("branch_a", result.expected)
            val_b = result.value

            if isinstance(val_a, (int, float)) and isinstance(val_b, (int, float)):
                delta_str = f"{result.delta:+.1f}" if result.delta else "0"
                indicator = " ✅" if result.improved else " ⚠️" if result.improved is False else ""
                print(f"{result.name:<30} {val_a:>10.1f} {val_b:>10.1f} {delta_str:>12}{indicator}")

    print("=" * 60 + "\n")
