"""
Routing accuracy evaluator.

Tests whether the routing logic correctly maps queries to agents.
Uses Gemini to simulate routing decisions based on the router prompt.
"""

import json
import os
import re
from pathlib import Path
from typing import Optional

from ..base import (
    BaseEvaluator,
    BranchSnapshot,
    EvalResult,
    EvalStatus,
    register_evaluator,
)


@register_evaluator
class RoutingEvaluator(BaseEvaluator):
    """
    Evaluates agent routing accuracy.

    Loads the router prompt and agent manifest from each branch,
    then uses Gemini to simulate routing decisions on test cases.
    Compares against expected agent assignments.
    """

    name = "routing"
    description = "Tests agent routing accuracy"
    lower_is_better = False  # Higher accuracy = better

    def __init__(self, test_cases: Optional[list[dict]] = None):
        """
        Initialize with optional custom test cases.

        Args:
            test_cases: List of {"input": str, "expected": str} dicts
                       If None, loads from datasets/routing_cases.json
        """
        self.test_cases = test_cases
        self._gemini_client = None

    @property
    def gemini_client(self):
        """Lazy-load Gemini client."""
        if self._gemini_client is None:
            api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
            if not api_key:
                raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY required for routing eval")

            from google import genai
            self._gemini_client = genai.Client(api_key=api_key)
        return self._gemini_client

    def load_test_cases(self) -> list[dict]:
        """Load routing test cases from the dataset file."""
        if self.test_cases:
            return self.test_cases

        # Try to find the dataset file
        dataset_path = Path(__file__).parent.parent.parent / "datasets" / "routing_cases.json"
        if dataset_path.exists():
            with open(dataset_path) as f:
                data = json.load(f)
                return data.get("routing_tests", [])

        return []

    def evaluate_branch(self, branch: BranchSnapshot) -> list[EvalResult]:
        """
        Evaluate routing accuracy for a branch.

        This simulates what the router would do by:
        1. Loading the router prompt from the branch
        2. Loading the agent manifest
        3. Using Gemini to make routing decisions
        4. Comparing against expected results
        """
        results = []
        test_cases = self.load_test_cases()

        if not test_cases:
            return [EvalResult(
                evaluator=self.name,
                name="routing:accuracy",
                status=EvalStatus.SKIPPED,
                error="No test cases found",
            )]

        # Load router context from branch
        router_prompt = self._build_router_prompt(branch)
        if router_prompt is None:
            return [EvalResult(
                evaluator=self.name,
                name="routing:accuracy",
                status=EvalStatus.ERROR,
                error="Could not build router prompt from branch",
            )]

        # Run routing tests
        correct = 0
        total = 0
        individual_results = []

        for case in test_cases:
            input_text = case.get("input", "")
            expected = case.get("expected", "")

            if not input_text or not expected:
                continue

            total += 1
            actual = self._simulate_routing(router_prompt, input_text)
            is_correct = self._matches(actual, expected)

            if is_correct:
                correct += 1

            individual_results.append({
                "input": input_text[:50] + "..." if len(input_text) > 50 else input_text,
                "expected": expected,
                "actual": actual,
                "correct": is_correct,
            })

        accuracy = (correct / total * 100) if total > 0 else 0

        results.append(EvalResult(
            evaluator=self.name,
            name="routing:accuracy",
            status=EvalStatus.PASSED if accuracy >= 80 else EvalStatus.FAILED,
            value=accuracy,
            score=accuracy,
            details={
                "correct": correct,
                "total": total,
                "results": individual_results[:10],  # First 10 for details
            },
        ))

        results.append(EvalResult(
            evaluator=self.name,
            name="routing:correct_count",
            status=EvalStatus.PASSED,
            value=correct,
            details={"total": total},
        ))

        return results

    def _build_router_prompt(self, branch: BranchSnapshot) -> Optional[str]:
        """Build a router prompt from branch files."""
        # Try to load the pm-ai slash command
        router_content = branch.read_file(".claude/commands/pm-ai.md")

        # Load agent manifest for agent list
        manifest_content = branch.read_file(".ai/config/agent-manifest.json")

        if not manifest_content:
            return None

        try:
            manifest = json.loads(manifest_content)
            agents_data = manifest.get("agents", {})
            # Handle both dict format (name -> config) and list format
            if isinstance(agents_data, dict):
                agents = [(name, config) for name, config in agents_data.items()]
            else:
                agents = [(a.get("name", "unknown"), a) for a in agents_data if isinstance(a, dict)]
        except json.JSONDecodeError:
            return None

        # Build a simplified routing prompt
        agent_list = "\n".join([
            f"- {name}: {config.get('description', 'No description')}"
            for name, config in agents
        ])

        prompt = f"""You are a routing agent. Given a user query, determine which agent should handle it.

Available agents:
{agent_list}

Respond with ONLY the agent name, nothing else."""

        return prompt

    def _simulate_routing(self, router_prompt: str, user_input: str) -> str:
        """Use Gemini to simulate routing decision."""
        try:
            from google.genai import types

            full_prompt = f"{router_prompt}\n\nUser query: {user_input}\n\nAgent:"

            response = self.gemini_client.models.generate_content(
                model="gemini-2.0-flash",
                contents=full_prompt,
                config=types.GenerateContentConfig(
                    temperature=0,
                    max_output_tokens=50,
                ),
            )

            result = response.text.strip().lower()
            # Clean up response - extract just the agent name
            result = re.sub(r'[^a-z0-9_-]', '', result.split()[0] if result.split() else "")
            return result

        except Exception as e:
            return f"error: {str(e)}"

    def _matches(self, actual: str, expected: str) -> bool:
        """Check if actual routing matches expected."""
        actual = actual.lower().strip()
        expected = expected.lower().strip()

        # Direct match
        if actual == expected:
            return True

        # Partial match (handle variations like "product_coach" vs "product-coach")
        actual_normalized = actual.replace("-", "_").replace(" ", "_")
        expected_normalized = expected.replace("-", "_").replace(" ", "_")

        return actual_normalized == expected_normalized
