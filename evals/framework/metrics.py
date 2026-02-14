"""
Metrics and data structures for A/B evaluation.
"""

import time
import json
import subprocess
import re
from dataclasses import dataclass, field
from typing import Optional, Any
from datetime import datetime


@dataclass
class Timer:
    """Simple context manager for timing operations."""
    start_time: float = 0
    end_time: float = 0
    elapsed_ms: float = 0

    def __enter__(self):
        self.start_time = time.perf_counter()
        return self

    def __exit__(self, *args):
        self.end_time = time.perf_counter()
        self.elapsed_ms = (self.end_time - self.start_time) * 1000


@dataclass
class TestResult:
    """Result of a single test case execution."""
    test_id: str
    prompt: str
    response: str
    elapsed_ms: float
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    tool_calls: int = 0
    expected: Optional[str] = None
    actual: Optional[str] = None
    quality_score: Optional[float] = None
    passed: Optional[bool] = None
    error: Optional[str] = None
    metadata: dict = field(default_factory=dict)

    @property
    def cost_estimate(self) -> float:
        """Estimate cost using Claude pricing (rough estimate)."""
        # Using Sonnet pricing as baseline: $3/M input, $15/M output
        return (self.input_tokens * 3 + self.output_tokens * 15) / 1_000_000

    def to_dict(self) -> dict:
        return {
            "test_id": self.test_id,
            "prompt": self.prompt[:200] + "..." if len(self.prompt) > 200 else self.prompt,
            "response_preview": self.response[:500] + "..." if len(self.response) > 500 else self.response,
            "elapsed_ms": round(self.elapsed_ms, 2),
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "total_tokens": self.total_tokens,
            "tool_calls": self.tool_calls,
            "expected": self.expected,
            "actual": self.actual,
            "quality_score": self.quality_score,
            "passed": self.passed,
            "error": self.error,
            "cost_estimate": round(self.cost_estimate, 6),
        }


@dataclass
class BranchResult:
    """Aggregated results for a single branch."""
    branch_name: str
    branch_path: str
    commit_hash: str
    test_results: list[TestResult] = field(default_factory=list)
    run_timestamp: str = field(default_factory=lambda: datetime.now().isoformat())

    @property
    def total_tests(self) -> int:
        return len(self.test_results)

    @property
    def passed_tests(self) -> int:
        return sum(1 for r in self.test_results if r.passed)

    @property
    def accuracy(self) -> float:
        if not self.test_results:
            return 0.0
        return self.passed_tests / self.total_tests * 100

    @property
    def avg_quality_score(self) -> float:
        scores = [r.quality_score for r in self.test_results if r.quality_score is not None]
        return sum(scores) / len(scores) if scores else 0.0

    @property
    def avg_elapsed_ms(self) -> float:
        if not self.test_results:
            return 0.0
        return sum(r.elapsed_ms for r in self.test_results) / len(self.test_results)

    @property
    def total_tokens(self) -> int:
        return sum(r.total_tokens for r in self.test_results)

    @property
    def avg_tokens(self) -> float:
        if not self.test_results:
            return 0.0
        return self.total_tokens / len(self.test_results)

    @property
    def total_cost_estimate(self) -> float:
        return sum(r.cost_estimate for r in self.test_results)

    def summary(self) -> dict:
        return {
            "branch_name": self.branch_name,
            "commit_hash": self.commit_hash[:7] if self.commit_hash else "unknown",
            "total_tests": self.total_tests,
            "passed_tests": self.passed_tests,
            "accuracy": round(self.accuracy, 2),
            "avg_quality_score": round(self.avg_quality_score, 2),
            "avg_elapsed_ms": round(self.avg_elapsed_ms, 2),
            "avg_tokens": round(self.avg_tokens, 0),
            "total_tokens": self.total_tokens,
            "total_cost_estimate": round(self.total_cost_estimate, 4),
        }


@dataclass
class ComparisonResult:
    """Comparison between two branch results."""
    branch_a: BranchResult
    branch_b: BranchResult
    comparison_timestamp: str = field(default_factory=lambda: datetime.now().isoformat())

    def delta(self, metric: str) -> dict:
        """Calculate delta between branches for a metric."""
        val_a = getattr(self.branch_a, metric, 0) or 0
        val_b = getattr(self.branch_b, metric, 0) or 0

        # Handle properties
        if callable(getattr(type(self.branch_a), metric, None)):
            val_a = getattr(self.branch_a, metric)
            val_b = getattr(self.branch_b, metric)

        diff = val_b - val_a
        pct_change = (diff / val_a * 100) if val_a != 0 else 0

        # Determine if improvement (depends on metric)
        better_lower = metric in ["avg_elapsed_ms", "avg_tokens", "total_tokens", "total_cost_estimate"]
        improved = diff < 0 if better_lower else diff > 0

        return {
            "branch_a": round(val_a, 2) if isinstance(val_a, float) else val_a,
            "branch_b": round(val_b, 2) if isinstance(val_b, float) else val_b,
            "delta": round(diff, 2) if isinstance(diff, float) else diff,
            "pct_change": round(pct_change, 1),
            "improved": improved,
        }

    def summary(self) -> dict:
        """Generate comparison summary."""
        return {
            "timestamp": self.comparison_timestamp,
            "branch_a": self.branch_a.summary(),
            "branch_b": self.branch_b.summary(),
            "deltas": {
                "accuracy": self.delta("accuracy"),
                "avg_quality_score": self.delta("avg_quality_score"),
                "avg_elapsed_ms": self.delta("avg_elapsed_ms"),
                "avg_tokens": self.delta("avg_tokens"),
                "total_cost_estimate": self.delta("total_cost_estimate"),
            }
        }


def get_git_commit(directory: str) -> str:
    """Get current git commit hash for a directory."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=directory,
            capture_output=True,
            text=True,
            timeout=5
        )
        return result.stdout.strip() if result.returncode == 0 else "unknown"
    except Exception:
        return "unknown"


def parse_claude_output(output: str) -> dict:
    """Parse Claude CLI output to extract metrics."""
    metrics = {
        "response": output,
        "input_tokens": 0,
        "output_tokens": 0,
        "tool_calls": 0,
    }

    # Try to parse JSON output if --output-format json was used
    try:
        data = json.loads(output)
        if isinstance(data, dict):
            metrics["response"] = data.get("result", data.get("response", output))
            if "usage" in data:
                metrics["input_tokens"] = data["usage"].get("input_tokens", 0)
                metrics["output_tokens"] = data["usage"].get("output_tokens", 0)
            metrics["tool_calls"] = len(data.get("tool_calls", []))
    except json.JSONDecodeError:
        # Plain text output - try to extract token info from stderr or trailing text
        # Claude CLI sometimes outputs usage stats
        token_match = re.search(r'(\d+)\s*input.*?(\d+)\s*output', output, re.IGNORECASE)
        if token_match:
            metrics["input_tokens"] = int(token_match.group(1))
            metrics["output_tokens"] = int(token_match.group(2))

    return metrics
