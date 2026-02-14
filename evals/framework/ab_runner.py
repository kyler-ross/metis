"""
A/B comparison engine for running tests across branches.
"""

import json
import subprocess
import os
import re
from pathlib import Path
from typing import Optional, Callable
from concurrent.futures import ThreadPoolExecutor, as_completed

# C2: Security - allowed environment variables for subprocess (prevent injection)
ALLOWED_ENV_VARS = frozenset({
    "PATH", "HOME", "USER", "SHELL", "TERM", "LANG", "LC_ALL",
    "CLAUDE_CODE_ENTRYPOINT", "NODE_OPTIONS", "PYTHONPATH",
})

# C2: Security - max prompt length to prevent abuse
MAX_PROMPT_LENGTH = 100_000

from .metrics import (
    TestResult,
    BranchResult,
    ComparisonResult,
    Timer,
    get_git_commit,
    parse_claude_output,
)
from .judge import QualityJudge, JudgeResult


class ABRunner:
    """
    Runs the same test cases against two different branches/directories
    and compares the results.
    """

    def __init__(
        self,
        branch_a_path: str,
        branch_b_path: str,
        branch_a_name: str = "branch_a",
        branch_b_name: str = "branch_b",
        judge: Optional[QualityJudge] = None,
        parallel: bool = False,
        timeout: int = 120,
    ):
        self.branch_a_path = Path(branch_a_path).resolve()
        self.branch_b_path = Path(branch_b_path).resolve()
        self.branch_a_name = branch_a_name
        self.branch_b_name = branch_b_name
        self.judge = judge
        self.parallel = parallel
        self.timeout = timeout

        # Validate paths exist
        if not self.branch_a_path.exists():
            raise ValueError(f"Branch A path does not exist: {self.branch_a_path}")
        if not self.branch_b_path.exists():
            raise ValueError(f"Branch B path does not exist: {self.branch_b_path}")

    def run_comparison(
        self,
        test_cases: list[dict],
        test_type: str = "quality",
        progress_callback: Optional[Callable[[str, int, int], None]] = None,
    ) -> ComparisonResult:
        """
        Run test cases against both branches and compare results.

        Args:
            test_cases: List of test case dicts with 'id', 'prompt', and optionally 'expected', 'criteria'
            test_type: "routing" or "quality" - determines evaluation method
            progress_callback: Optional callback(message, current, total) for progress updates

        Returns:
            ComparisonResult with results from both branches
        """
        total = len(test_cases) * 2  # Each test runs on both branches

        # Run tests on branch A
        if progress_callback:
            progress_callback(f"Running tests on {self.branch_a_name}...", 0, total)

        results_a = self._run_tests(
            self.branch_a_path,
            test_cases,
            test_type,
            lambda msg, cur, tot: progress_callback(msg, cur, total) if progress_callback else None,
        )
        branch_a_result = BranchResult(
            branch_name=self.branch_a_name,
            branch_path=str(self.branch_a_path),
            commit_hash=get_git_commit(str(self.branch_a_path)),
            test_results=results_a,
        )

        # Run tests on branch B
        if progress_callback:
            progress_callback(f"Running tests on {self.branch_b_name}...", len(test_cases), total)

        results_b = self._run_tests(
            self.branch_b_path,
            test_cases,
            test_type,
            lambda msg, cur, tot: progress_callback(
                msg, len(test_cases) + cur, total
            ) if progress_callback else None,
        )
        branch_b_result = BranchResult(
            branch_name=self.branch_b_name,
            branch_path=str(self.branch_b_path),
            commit_hash=get_git_commit(str(self.branch_b_path)),
            test_results=results_b,
        )

        return ComparisonResult(branch_a=branch_a_result, branch_b=branch_b_result)

    def _run_tests(
        self,
        directory: Path,
        test_cases: list[dict],
        test_type: str,
        progress_callback: Optional[Callable],
    ) -> list[TestResult]:
        """Run all test cases in a directory."""
        results = []

        for i, test_case in enumerate(test_cases):
            if progress_callback:
                progress_callback(f"Test {test_case.get('id', i+1)}", i, len(test_cases))

            result = self._run_single_test(directory, test_case, test_type)
            results.append(result)

        return results

    def _sanitize_prompt(self, prompt: str) -> str:
        """
        C2: Sanitize prompt to prevent command injection.
        Validates prompt length and removes dangerous control characters.
        """
        if not isinstance(prompt, str):
            raise ValueError("Prompt must be a string")
        if len(prompt) > MAX_PROMPT_LENGTH:
            raise ValueError(f"Prompt exceeds maximum length of {MAX_PROMPT_LENGTH}")
        # Remove null bytes and other control characters that could cause issues
        # Keep newlines/tabs which are valid in prompts
        sanitized = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', prompt)
        return sanitized

    def _get_safe_env(self) -> dict:
        """
        C2: Return a restricted environment for subprocess execution.
        Only includes allowed environment variables to prevent injection.
        """
        safe_env = {k: v for k, v in os.environ.items() if k in ALLOWED_ENV_VARS}
        safe_env["CLAUDE_CODE_ENTRYPOINT"] = "cli"
        return safe_env

    def _run_single_test(
        self,
        directory: Path,
        test_case: dict,
        test_type: str,
    ) -> TestResult:
        """Run a single test case using Claude CLI."""
        test_id = test_case.get("id", "unknown")
        prompt = test_case.get("prompt", "")
        expected = test_case.get("expected")
        criteria = test_case.get("criteria", [])

        with Timer() as timer:
            try:
                # C2: Sanitize prompt before passing to subprocess
                sanitized_prompt = self._sanitize_prompt(prompt)

                # Run Claude CLI in the target directory
                result = subprocess.run(
                    [
                        "claude",
                        "--print",
                        "--dangerously-skip-permissions",
                        "-p", sanitized_prompt,
                    ],
                    cwd=str(directory),
                    capture_output=True,
                    text=True,
                    timeout=self.timeout,
                    env=self._get_safe_env(),  # C2: Use restricted environment
                )

                response = result.stdout
                error = result.stderr if result.returncode != 0 else None

            except subprocess.TimeoutExpired:
                response = ""
                error = f"Timeout after {self.timeout}s"
            except Exception as e:
                response = ""
                error = str(e)

        # Parse output for metrics
        parsed = parse_claude_output(response)

        # Evaluate based on test type
        judge_result = None
        if self.judge and not error:
            if test_type == "routing" and expected:
                judge_result = self.judge.judge_routing(response, expected)
            elif test_type == "quality" and criteria:
                judge_result = self.judge.judge(response, criteria, expected=expected)

        return TestResult(
            test_id=test_id,
            prompt=prompt,
            response=parsed["response"],
            elapsed_ms=timer.elapsed_ms,
            input_tokens=parsed["input_tokens"],
            output_tokens=parsed["output_tokens"],
            total_tokens=parsed["input_tokens"] + parsed["output_tokens"],
            tool_calls=parsed["tool_calls"],
            expected=expected,
            actual=self._extract_actual(response, test_type),
            quality_score=judge_result.score if judge_result else None,
            passed=judge_result.passed if judge_result else None,
            error=error,
            metadata={
                "directory": str(directory),
                "test_type": test_type,
                "criteria": criteria,
                "judge_reasoning": judge_result.reasoning if judge_result else None,
            },
        )

    def _extract_actual(self, response: str, test_type: str) -> Optional[str]:
        """Extract the actual result from response based on test type."""
        if test_type == "routing":
            # Try to extract agent name from routing response
            # Look for patterns like "routing to product-coach" or "agent: product-coach"
            import re
            patterns = [
                r"routing to[:\s]+([a-z-_]+)",
                r"agent[:\s]+([a-z-_]+)",
                r"using[:\s]+([a-z-_]+)",
            ]
            for pattern in patterns:
                match = re.search(pattern, response.lower())
                if match:
                    return match.group(1)
        return None


def load_test_cases(path: str) -> list[dict]:
    """Load test cases from a JSON file."""
    with open(path) as f:
        data = json.load(f)

    # Support both flat list and wrapped format
    if isinstance(data, list):
        return data
    elif isinstance(data, dict) and "cases" in data:
        return data["cases"]
    elif isinstance(data, dict) and "test_cases" in data:
        return data["test_cases"]
    else:
        raise ValueError(f"Unexpected test case format in {path}")
