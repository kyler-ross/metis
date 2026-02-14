"""
Routing Accuracy Tests
======================
Tests that the PM Router correctly routes tasks to the appropriate agent.
"""

import pytest
import json
from pathlib import Path
from conftest import load_agent


@pytest.fixture
def routing_cases():
    """Load routing test cases from JSON."""
    cases_path = Path(".ai/evals/datasets/routing_cases.json")
    with open(cases_path) as f:
        return json.load(f)["routing_tests"]


@pytest.fixture
def router_prompt():
    """Load the PM Router agent prompt."""
    return load_agent(".claude/agents/pm-router.md")


@pytest.mark.llm_eval
class TestRouting:
    """Test suite for PM Router agent routing accuracy."""

    @pytest.mark.smoke
    def test_routing_accuracy_smoke(self, gemini_client, router_prompt, routing_cases):
        """
        Quick smoke test: 5 core routing cases.

        Tests the most common routing scenarios to catch major regressions.
        Target: >= 80% accuracy
        """
        smoke_cases = [c for c in routing_cases if "smoke" in c.get("tags", [])]
        assert len(smoke_cases) >= 5, "Expected at least 5 smoke test cases"

        passed = 0
        failures = []

        for case in smoke_cases:
            response = gemini_client.complete(
                system=router_prompt,
                user=f"Route this PM task to the appropriate agent: {case['input']}"
            )

            if case["expected"].lower() in response.lower():
                passed += 1
            else:
                failures.append({
                    "input": case["input"],
                    "expected": case["expected"],
                    "got": response[:150]
                })

        accuracy = passed / len(smoke_cases)

        # Print failures for debugging
        if failures:
            print("\n=== Routing Failures ===")
            for f in failures:
                print(f"  Input: {f['input']}")
                print(f"  Expected: {f['expected']}")
                print(f"  Got: {f['got'][:100]}...")
                print()

        # Require 100% accuracy on smoke tests - these are core routing cases
        assert accuracy >= 1.0, f"Routing accuracy {accuracy:.0%} < 100%. Failures: {len(failures)}/{len(smoke_cases)}"

    @pytest.mark.full
    def test_routing_accuracy_full(self, gemini_client, router_prompt, routing_cases):
        """
        Full test: all routing cases.

        Comprehensive test of all routing scenarios.
        Target: >= 80% accuracy
        """
        passed = 0
        failures = []

        for case in routing_cases:
            response = gemini_client.complete(
                system=router_prompt,
                user=f"Route this PM task to the appropriate agent: {case['input']}"
            )

            if case["expected"].lower() in response.lower():
                passed += 1
            else:
                failures.append({
                    "input": case["input"],
                    "expected": case["expected"],
                    "description": case.get("description", ""),
                    "got": response[:150]
                })

        accuracy = passed / len(routing_cases)

        # Print failures for debugging
        if failures:
            print("\n=== Routing Failures ===")
            for f in failures:
                print(f"  Input: {f['input']}")
                print(f"  Expected: {f['expected']}")
                print(f"  Description: {f['description']}")
                print(f"  Got: {f['got'][:100]}...")
                print()

        # Require 90% accuracy on full suite
        assert accuracy >= 0.9, (
            f"Routing accuracy {accuracy:.0%} < 90%. "
            f"Failures: {len(failures)}/{len(routing_cases)}"
        )

    @pytest.mark.smoke
    def test_router_handles_ambiguous_input(self, gemini_client, router_prompt):
        """
        Test that router provides reasonable response for ambiguous inputs.

        Even when input is unclear, router should either:
        1. Route to a reasonable default agent
        2. Ask for clarification
        """
        ambiguous_inputs = [
            "Help me with this thing",
            "I need to do something about the app",
            "Can you assist me?"
        ]

        for user_input in ambiguous_inputs:
            response = gemini_client.complete(
                system=router_prompt,
                user=f"Route this PM task: {user_input}"
            )

            # Should produce a meaningful response, not crash
            assert len(response) > 20, f"Response too short for: {user_input}"

            # Should mention at least one agent OR ask for clarification
            response_lower = response.lower()
            mentions_agent = any(agent in response_lower for agent in [
                "product-coach", "sql-query", "jira", "transcript", "weekly", "daily"
            ])
            asks_clarification = any(word in response_lower for word in [
                "clarify", "more information", "what", "which", "could you"
            ])

            assert mentions_agent or asks_clarification, (
                f"Router didn't route or ask for clarification on: {user_input}"
            )
