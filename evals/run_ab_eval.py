#!/usr/bin/env python3
"""
A/B Evaluation CLI - Compare PM AI agent performance across branches.

Usage:
    python run_ab_eval.py                    # Run default comparison
    python run_ab_eval.py --routing          # Run routing tests only
    python run_ab_eval.py --quality          # Run quality tests only
    python run_ab_eval.py --smoke            # Run smoke tests only (tagged)
    python run_ab_eval.py --comparison NAME  # Use named comparison from config
    python run_ab_eval.py --dry-run          # Show what would run without executing
"""

import argparse
import json
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from framework import ABRunner, QualityJudge, MarkdownReporter, JSONReporter
from framework.ab_runner import load_test_cases
from framework.reporters import print_summary


def load_config(config_path: str = None) -> dict:
    """Load branch configuration."""
    if config_path is None:
        config_path = Path(__file__).parent / "configs" / "branches.json"
    with open(config_path) as f:
        return json.load(f)


def load_routing_cases(filter_tags: list = None) -> list[dict]:
    """Load and transform routing test cases."""
    path = Path(__file__).parent / "datasets" / "routing_cases.json"
    with open(path) as f:
        data = json.load(f)

    cases = data.get("routing_tests", [])

    # Transform to standard format
    test_cases = []
    for i, case in enumerate(cases):
        if filter_tags and not any(tag in case.get("tags", []) for tag in filter_tags):
            continue
        test_cases.append({
            "id": f"routing-{i+1:03d}",
            "prompt": case["input"],
            "expected": case["expected"],
            "criteria": [],  # Routing uses special judge
            "tags": case.get("tags", []),
        })

    return test_cases


def load_quality_cases(filter_tags: list = None) -> list[dict]:
    """Load quality test cases."""
    path = Path(__file__).parent / "datasets" / "quality_cases.json"
    with open(path) as f:
        data = json.load(f)

    cases = data.get("test_cases", [])

    if filter_tags:
        cases = [c for c in cases if any(tag in c.get("tags", []) for tag in filter_tags)]

    return cases


def main():
    parser = argparse.ArgumentParser(description="Run A/B evaluation between branches")
    parser.add_argument("--routing", action="store_true", help="Run routing tests only")
    parser.add_argument("--quality", action="store_true", help="Run quality tests only")
    parser.add_argument("--smoke", action="store_true", help="Run smoke tests only")
    parser.add_argument("--comparison", type=str, help="Named comparison from config")
    parser.add_argument("--config", type=str, help="Path to branch config file")
    parser.add_argument("--dry-run", action="store_true", help="Show what would run")
    parser.add_argument("--output-dir", type=str, help="Output directory for reports")
    parser.add_argument("--json-only", action="store_true", help="Generate JSON report only")
    parser.add_argument("--timeout", type=int, default=120, help="Timeout per test (seconds)")
    args = parser.parse_args()

    # Load configuration
    config = load_config(args.config)
    settings = config.get("settings", {})

    # Get branch paths
    if args.comparison:
        comparison = config.get("comparisons", {}).get(args.comparison)
        if not comparison:
            print(f"Error: Unknown comparison '{args.comparison}'")
            print(f"Available: {list(config.get('comparisons', {}).keys())}")
            sys.exit(1)
    else:
        comparison = config.get("default_comparison", {})

    branch_a = comparison.get("branch_a", {})
    branch_b = comparison.get("branch_b", {})

    print(f"\n{'='*60}")
    print("A/B EVALUATION")
    print(f"{'='*60}")
    print(f"Branch A: {branch_a.get('name')} @ {branch_a.get('path')}")
    print(f"Branch B: {branch_b.get('name')} @ {branch_b.get('path')}")

    # Determine which tests to run
    filter_tags = ["smoke"] if args.smoke else None
    test_cases = []
    test_type = "quality"  # default

    if args.routing or (not args.quality and not args.routing):
        routing_cases = load_routing_cases(filter_tags)
        if routing_cases:
            test_cases.extend(routing_cases)
            test_type = "routing"
            print(f"\nRouting tests: {len(routing_cases)}")

    if args.quality or (not args.quality and not args.routing):
        quality_cases = load_quality_cases(filter_tags)
        if quality_cases:
            test_cases.extend(quality_cases)
            test_type = "quality" if not args.routing else "mixed"
            print(f"Quality tests: {len(quality_cases)}")

    print(f"Total tests: {len(test_cases)}")

    if args.dry_run:
        print("\n[DRY RUN] Would run the following tests:")
        for case in test_cases[:10]:
            print(f"  - {case['id']}: {case['prompt'][:50]}...")
        if len(test_cases) > 10:
            print(f"  ... and {len(test_cases) - 10} more")
        sys.exit(0)

    if not test_cases:
        print("No test cases to run!")
        sys.exit(1)

    # Initialize judge
    print("\nInitializing Gemini judge...")
    try:
        judge = QualityJudge(model=settings.get("judge_model", "gemini-2.5-flash"))
    except Exception as e:
        print(f"Warning: Could not initialize judge: {e}")
        print("Running without quality evaluation.")
        judge = None

    # Initialize runner
    runner = ABRunner(
        branch_a_path=branch_a["path"],
        branch_b_path=branch_b["path"],
        branch_a_name=branch_a["name"],
        branch_b_name=branch_b["name"],
        judge=judge,
        timeout=args.timeout or settings.get("timeout_seconds", 120),
    )

    # Run comparison
    def progress(msg, current, total):
        pct = current / total * 100 if total > 0 else 0
        print(f"\r[{pct:5.1f}%] {msg}                    ", end="", flush=True)

    print("\nRunning tests...")
    result = runner.run_comparison(test_cases, test_type=test_type, progress_callback=progress)
    print("\n")

    # Print summary
    print_summary(result)

    # Generate reports
    output_dir = args.output_dir or str(Path(__file__).parent / "results")

    json_reporter = JSONReporter(output_dir)
    json_path = json_reporter.generate(result)
    print(f"JSON report: {json_path}")

    if not args.json_only:
        md_reporter = MarkdownReporter(output_dir)
        md_path = md_reporter.generate(result)
        print(f"Markdown report: {md_path}")

    # Return exit code based on results
    summary = result.summary()
    deltas = summary["deltas"]

    # Count improvements
    improvements = sum(1 for d in deltas.values() if d["improved"])
    regressions = sum(1 for d in deltas.values() if not d["improved"] and d["delta"] != 0)

    if regressions > improvements:
        print(f"\n⚠️  Branch B shows {regressions} regressions vs {improvements} improvements")
        sys.exit(1)
    elif improvements > 0:
        print(f"\n✅ Branch B shows {improvements} improvements!")
        sys.exit(0)
    else:
        print("\n➡️  No significant difference between branches")
        sys.exit(0)


if __name__ == "__main__":
    main()
