#!/usr/bin/env python3
"""
PM AI Evaluation CLI

Compare PM AI system performance between branches.

Usage:
    python run_eval.py                     # Run all evaluators
    python run_eval.py --quick             # Run only token counting (fast)
    python run_eval.py --routing           # Include routing tests (requires Gemini)
    python run_eval.py --list              # List available evaluators
    python run_eval.py --evaluator NAME    # Run specific evaluator

Examples:
    # Quick token comparison
    python .ai/evals/run_eval.py --quick

    # Full evaluation with routing
    python .ai/evals/run_eval.py --routing

    # Run specific evaluators
    python .ai/evals/run_eval.py --evaluator token_count --evaluator file_structure
"""

import argparse
import json
import sys
from pathlib import Path

# Add framework to path
sys.path.insert(0, str(Path(__file__).parent))

from framework import (
    EvalRunner,
    MarkdownReporter,
    JSONReporter,
    print_summary,
    list_evaluators,
    get_evaluator,
)
from framework.evaluators import (
    TokenCountEvaluator,
    FileStructureEvaluator,
    RoutingEvaluator,
    ContextLoadingEvaluator,
)
from framework.evaluators.token_count import ClaudeMdDepthEvaluator
from framework.evaluators.context_loading import LatentSpacePrimingEvaluator


def load_config() -> dict:
    """Load branch configuration."""
    config_path = Path(__file__).parent / "configs" / "branches.json"
    if config_path.exists():
        with open(config_path) as f:
            return json.load(f)
    return {}


def main():
    parser = argparse.ArgumentParser(
        description="Compare PM AI system performance between branches",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )

    parser.add_argument(
        "--quick",
        action="store_true",
        help="Run quick evaluation (token counts only)",
    )
    parser.add_argument(
        "--routing",
        action="store_true",
        help="Include routing accuracy tests (requires GEMINI_API_KEY)",
    )
    parser.add_argument(
        "--evaluator", "-e",
        action="append",
        help="Run specific evaluator(s) by name",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List available evaluators",
    )
    parser.add_argument(
        "--branch-a",
        type=str,
        help="Path to branch A (baseline)",
    )
    parser.add_argument(
        "--branch-b",
        type=str,
        help="Path to branch B (comparison)",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        help="Output directory for reports",
    )
    parser.add_argument(
        "--json-only",
        action="store_true",
        help="Only output JSON (no markdown)",
    )
    parser.add_argument(
        "--quiet", "-q",
        action="store_true",
        help="Minimal output",
    )

    args = parser.parse_args()

    # List evaluators
    if args.list:
        print("\nAvailable evaluators:")
        for name in list_evaluators():
            cls = get_evaluator(name)
            desc = cls.description if cls else ""
            print(f"  {name:<25} {desc}")
        return 0

    # Load config
    config = load_config()
    default_comparison = config.get("default_comparison", {})

    # Determine branch paths
    branch_a_path = args.branch_a or default_comparison.get("branch_a", {}).get("path")
    branch_b_path = args.branch_b or default_comparison.get("branch_b", {}).get("path")
    branch_a_name = default_comparison.get("branch_a", {}).get("name", "branch_a")
    branch_b_name = default_comparison.get("branch_b", {}).get("name", "branch_b")

    if not branch_a_path or not branch_b_path:
        print("Error: Branch paths not configured. Use --branch-a and --branch-b or configure branches.json")
        return 1

    if not args.quiet:
        print("\n" + "=" * 60)
        print("PM AI EVALUATION")
        print("=" * 60)
        print(f"Branch A: {branch_a_name} @ {branch_a_path}")
        print(f"Branch B: {branch_b_name} @ {branch_b_path}")

    # Select evaluators
    evaluators = []

    if args.evaluator:
        # Run specific evaluators
        for name in args.evaluator:
            cls = get_evaluator(name)
            if cls:
                evaluators.append(cls())
            else:
                print(f"Warning: Unknown evaluator '{name}'")
    elif args.quick:
        # Quick mode: just token counts
        evaluators = [TokenCountEvaluator()]
    else:
        # Default: all static evaluators
        evaluators = [
            TokenCountEvaluator(),
            ClaudeMdDepthEvaluator(),
            FileStructureEvaluator(),
            ContextLoadingEvaluator(),
            LatentSpacePrimingEvaluator(),
        ]

        # Add routing if requested (requires API key)
        if args.routing:
            evaluators.append(RoutingEvaluator())

    if not args.quiet:
        print(f"\nEvaluators: {', '.join(e.name for e in evaluators)}")
        print()

    # Create runner
    runner = EvalRunner(
        branch_a_path=branch_a_path,
        branch_b_path=branch_b_path,
        branch_a_name=branch_a_name,
        branch_b_name=branch_b_name,
    )

    # Run evaluation
    def progress(msg, current, total):
        if not args.quiet:
            pct = current / total * 100 if total > 0 else 0
            print(f"\r[{pct:5.1f}%] {msg:<40}", end="", flush=True)

    report = runner.run(evaluators, progress_callback=progress if not args.quiet else None)

    if not args.quiet:
        print("\n")

    # Print summary
    if not args.quiet:
        print_summary(report)

    # Generate reports
    output_dir = args.output_dir or str(Path(__file__).parent / "results")

    json_reporter = JSONReporter(output_dir)
    json_path = json_reporter.generate(report)
    if not args.quiet:
        print(f"JSON report: {json_path}")

    if not args.json_only:
        md_reporter = MarkdownReporter(output_dir)
        md_path = md_reporter.generate(report)
        if not args.quiet:
            print(f"Markdown report: {md_path}")

    # Exit code based on results
    if report.regressions > report.improvements:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
