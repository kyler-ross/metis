"""
Evaluation runner - orchestrates running evaluators across branches.
"""

import subprocess
import time
from pathlib import Path
from typing import Callable, Optional

from .base import (
    BaseEvaluator,
    BranchSnapshot,
    EvalReport,
    EvalResult,
    EvalStatus,
    get_all_evaluators,
)


def get_git_info(directory: Path) -> tuple[str, str]:
    """Get git commit hash and message for a directory."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=str(directory),
            capture_output=True,
            text=True,
            timeout=5,
        )
        commit_hash = result.stdout.strip() if result.returncode == 0 else "unknown"

        result = subprocess.run(
            ["git", "log", "-1", "--format=%s"],
            cwd=str(directory),
            capture_output=True,
            text=True,
            timeout=5,
        )
        commit_message = result.stdout.strip() if result.returncode == 0 else ""

        return commit_hash, commit_message
    except Exception:
        return "unknown", ""


class EvalRunner:
    """
    Runs evaluations across two branches and generates a comparison report.

    Usage:
        runner = EvalRunner(
            branch_a_path="/path/to/main",
            branch_b_path="/path/to/feature",
        )
        report = runner.run()  # Runs all registered evaluators
        # or
        report = runner.run([TokenCountEvaluator(), RoutingEvaluator()])
    """

    def __init__(
        self,
        branch_a_path: str,
        branch_b_path: str,
        branch_a_name: str = "branch_a",
        branch_b_name: str = "branch_b",
    ):
        self.branch_a_path = Path(branch_a_path).resolve()
        self.branch_b_path = Path(branch_b_path).resolve()
        self.branch_a_name = branch_a_name
        self.branch_b_name = branch_b_name

        # Validate paths
        if not self.branch_a_path.exists():
            raise ValueError(f"Branch A path does not exist: {self.branch_a_path}")
        if not self.branch_b_path.exists():
            raise ValueError(f"Branch B path does not exist: {self.branch_b_path}")

    def create_snapshots(self) -> tuple[BranchSnapshot, BranchSnapshot]:
        """Create snapshots of both branches."""
        hash_a, msg_a = get_git_info(self.branch_a_path)
        hash_b, msg_b = get_git_info(self.branch_b_path)

        snapshot_a = BranchSnapshot(
            name=self.branch_a_name,
            path=self.branch_a_path,
            commit_hash=hash_a,
            commit_message=msg_a,
        )

        snapshot_b = BranchSnapshot(
            name=self.branch_b_name,
            path=self.branch_b_path,
            commit_hash=hash_b,
            commit_message=msg_b,
        )

        return snapshot_a, snapshot_b

    def run(
        self,
        evaluators: Optional[list[BaseEvaluator]] = None,
        progress_callback: Optional[Callable[[str, int, int], None]] = None,
    ) -> EvalReport:
        """
        Run evaluations and generate a comparison report.

        Args:
            evaluators: List of evaluator instances to run.
                       If None, runs all registered evaluators.
            progress_callback: Optional callback(message, current, total)

        Returns:
            EvalReport with all results
        """
        start_time = time.perf_counter()

        # Create branch snapshots
        snapshot_a, snapshot_b = self.create_snapshots()

        # Get evaluators
        if evaluators is None:
            evaluator_classes = get_all_evaluators()
            evaluators = [cls() for cls in evaluator_classes.values()]

        # Create report
        report = EvalReport(
            branch_a=snapshot_a,
            branch_b=snapshot_b,
            metadata={
                "evaluators": [e.name for e in evaluators],
            },
        )

        # Run each evaluator
        total = len(evaluators)
        for i, evaluator in enumerate(evaluators):
            if progress_callback:
                progress_callback(f"Running {evaluator.name}...", i, total)

            try:
                results = evaluator.run(snapshot_a, snapshot_b)
                for result in results:
                    report.add_result(result)
            except Exception as e:
                # Python fix: Use EvalStatus enum instead of string
                report.add_result(EvalResult(
                    evaluator=evaluator.name,
                    name=f"{evaluator.name}:error",
                    status=EvalStatus.ERROR,
                    error=str(e),
                ))

        # Record duration
        report.duration_ms = (time.perf_counter() - start_time) * 1000

        if progress_callback:
            progress_callback("Complete!", total, total)

        return report

    def run_evaluator(
        self,
        evaluator_name: str,
    ) -> EvalReport:
        """Run a single evaluator by name."""
        evaluator_classes = get_all_evaluators()
        if evaluator_name not in evaluator_classes:
            raise ValueError(f"Unknown evaluator: {evaluator_name}")

        evaluator = evaluator_classes[evaluator_name]()
        return self.run([evaluator])
