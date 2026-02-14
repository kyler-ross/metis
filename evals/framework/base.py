"""
Base classes for the evaluation framework.

This module defines the core abstractions that all evaluators must implement.
Designed for extensibility - add new evaluators by subclassing BaseEvaluator.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Optional
import json


class EvalStatus(Enum):
    """Status of an evaluation result."""
    PASSED = "passed"
    FAILED = "failed"
    SKIPPED = "skipped"
    ERROR = "error"


@dataclass
class EvalResult:
    """
    Result of a single evaluation.

    All evaluators return this structure, making results comparable
    and aggregatable across different eval types.
    """
    evaluator: str  # Name of the evaluator that produced this
    name: str  # Human-readable name of what was evaluated
    status: EvalStatus
    score: Optional[float] = None  # 0-100 normalized score (if applicable)
    value: Any = None  # The measured value (tokens, ms, accuracy %, etc.)
    expected: Any = None  # Expected value (if applicable)
    delta: Optional[float] = None  # Change from baseline (if comparing)
    delta_pct: Optional[float] = None  # Percentage change
    improved: Optional[bool] = None  # True if change is an improvement
    details: dict = field(default_factory=dict)  # Evaluator-specific details
    error: Optional[str] = None  # Error message if status is ERROR

    def to_dict(self) -> dict:
        status_val = self.status.value if isinstance(self.status, EvalStatus) else self.status
        return {
            "evaluator": self.evaluator,
            "name": self.name,
            "status": status_val,
            "score": self.score,
            "value": self.value,
            "expected": self.expected,
            "delta": self.delta,
            "delta_pct": self.delta_pct,
            "improved": self.improved,
            "details": self.details,
            "error": self.error,
        }


@dataclass
class BranchSnapshot:
    """
    Snapshot of a branch's state for evaluation.

    Captures everything needed to evaluate a branch without
    needing to switch directories during the eval.
    """
    name: str
    path: Path
    commit_hash: str
    commit_message: str = ""
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())

    # Cached file contents (loaded lazily)
    _file_cache: dict = field(default_factory=dict, repr=False)

    def read_file(self, relative_path: str) -> Optional[str]:
        """Read a file from this branch, with caching."""
        if relative_path not in self._file_cache:
            full_path = self.path / relative_path
            if full_path.exists():
                self._file_cache[relative_path] = full_path.read_text()
            else:
                self._file_cache[relative_path] = None
        return self._file_cache[relative_path]

    def file_exists(self, relative_path: str) -> bool:
        """Check if a file exists in this branch."""
        return (self.path / relative_path).exists()

    def glob_files(self, pattern: str) -> list[Path]:
        """Glob for files in this branch."""
        return list(self.path.glob(pattern))

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "path": str(self.path),
            "commit_hash": self.commit_hash,
            "commit_message": self.commit_message,
            "timestamp": self.timestamp,
        }


@dataclass
class EvalReport:
    """
    Complete evaluation report comparing two branches.
    """
    branch_a: BranchSnapshot
    branch_b: BranchSnapshot
    results: list[EvalResult] = field(default_factory=list)
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    duration_ms: float = 0
    metadata: dict = field(default_factory=dict)

    @property
    def passed(self) -> int:
        return sum(1 for r in self.results if r.status == EvalStatus.PASSED)

    @property
    def failed(self) -> int:
        return sum(1 for r in self.results if r.status == EvalStatus.FAILED)

    @property
    def improvements(self) -> int:
        return sum(1 for r in self.results if r.improved is True)

    @property
    def regressions(self) -> int:
        return sum(1 for r in self.results if r.improved is False and r.delta != 0)

    def add_result(self, result: EvalResult):
        self.results.append(result)

    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp,
            "duration_ms": self.duration_ms,
            "branch_a": self.branch_a.to_dict(),
            "branch_b": self.branch_b.to_dict(),
            "summary": {
                "total": len(self.results),
                "passed": self.passed,
                "failed": self.failed,
                "improvements": self.improvements,
                "regressions": self.regressions,
            },
            "results": [r.to_dict() for r in self.results],
            "metadata": self.metadata,
        }

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent)


class BaseEvaluator(ABC):
    """
    Abstract base class for all evaluators.

    To create a new evaluator:
    1. Subclass BaseEvaluator
    2. Implement evaluate_branch() to measure a single branch
    3. Optionally override compare() to customize comparison logic
    4. Register in the evaluator registry

    Example:
        class TokenCountEvaluator(BaseEvaluator):
            name = "token_count"
            description = "Counts tokens in CLAUDE.md"

            def evaluate_branch(self, branch: BranchSnapshot) -> EvalResult:
                content = branch.read_file("CLAUDE.md")
                tokens = count_tokens(content)
                return EvalResult(
                    evaluator=self.name,
                    name="CLAUDE.md tokens",
                    status=EvalStatus.PASSED,
                    value=tokens,
                )
    """

    name: str = "base"
    description: str = "Base evaluator"

    # Whether lower values are better (e.g., token count, latency)
    lower_is_better: bool = False

    @abstractmethod
    def evaluate_branch(self, branch: BranchSnapshot) -> list[EvalResult]:
        """
        Evaluate a single branch and return results.

        Args:
            branch: Snapshot of the branch to evaluate

        Returns:
            List of EvalResult objects (can be multiple for compound evals)
        """
        pass

    def compare(
        self,
        result_a: EvalResult,
        result_b: EvalResult
    ) -> EvalResult:
        """
        Compare results from two branches.

        Default implementation computes delta and improvement.
        Override for custom comparison logic.
        """
        # Start with branch B's result as the base
        compared = EvalResult(
            evaluator=result_b.evaluator,
            name=result_b.name,
            status=result_b.status,
            score=result_b.score,
            value=result_b.value,
            expected=result_a.value,  # Branch A is the baseline
            details={
                "branch_a": result_a.value,
                "branch_b": result_b.value,
                **result_b.details,
            },
        )

        # Calculate delta if both values are numeric
        if isinstance(result_a.value, (int, float)) and isinstance(result_b.value, (int, float)):
            compared.delta = result_b.value - result_a.value
            if result_a.value != 0:
                compared.delta_pct = (compared.delta / result_a.value) * 100

            # Determine if this is an improvement
            if self.lower_is_better:
                compared.improved = compared.delta < 0
            else:
                compared.improved = compared.delta > 0

        return compared

    def run(
        self,
        branch_a: BranchSnapshot,
        branch_b: BranchSnapshot
    ) -> list[EvalResult]:
        """
        Run evaluation on both branches and compare.

        Returns compared results with deltas.
        """
        results_a = self.evaluate_branch(branch_a)
        results_b = self.evaluate_branch(branch_b)

        # Match results by name and compare
        compared = []
        results_a_by_name = {r.name: r for r in results_a}

        for result_b in results_b:
            result_a = results_a_by_name.get(result_b.name)
            if result_a:
                compared.append(self.compare(result_a, result_b))
            else:
                # New in branch B
                result_b.details["new_in_branch_b"] = True
                compared.append(result_b)

        return compared


# Evaluator registry for plugin system
_evaluator_registry: dict[str, type[BaseEvaluator]] = {}


def register_evaluator(cls: type[BaseEvaluator]) -> type[BaseEvaluator]:
    """Decorator to register an evaluator class."""
    _evaluator_registry[cls.name] = cls
    return cls


def get_evaluator(name: str) -> Optional[type[BaseEvaluator]]:
    """Get an evaluator class by name."""
    return _evaluator_registry.get(name)


def list_evaluators() -> list[str]:
    """List all registered evaluator names."""
    return list(_evaluator_registry.keys())


def get_all_evaluators() -> dict[str, type[BaseEvaluator]]:
    """Get all registered evaluators."""
    return _evaluator_registry.copy()
