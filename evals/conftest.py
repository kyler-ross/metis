"""
PM AI System Evaluation Framework
==================================
pytest fixtures and utilities for AI-powered agent testing using Gemini 2.5 Pro.

Cost tracking enforces a $5 budget per run.
"""

import os
import json
import pytest
from google import genai
from google.genai import types
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional

# Pricing per 1M tokens (Gemini 2.5 Pro, prompts <= 200k)
PRICING = {
    "gemini-2.5-pro": {"input": 1.25, "output": 10.00},
    "gemini-2.5-flash": {"input": 0.30, "output": 2.50},
}


@dataclass
class CostTracker:
    """Track API costs and enforce budget limits."""
    budget: float = 5.00
    spent: float = 0.0
    calls: list = field(default_factory=list)

    def record(self, input_tokens: int, output_tokens: int, model: str) -> float:
        """Record token usage and calculate cost."""
        model_key = "gemini-2.5-pro" if "pro" in model else "gemini-2.5-flash"
        rates = PRICING.get(model_key, PRICING["gemini-2.5-pro"])
        cost = (input_tokens * rates["input"] + output_tokens * rates["output"]) / 1_000_000
        self.spent += cost
        self.calls.append({
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost": cost,
            "model": model
        })
        if self.spent > self.budget:
            raise Exception(f"Budget exceeded: ${self.spent:.4f} > ${self.budget}")
        return cost

    def summary(self) -> dict:
        """Return summary of costs."""
        return {
            "total_cost": round(self.spent, 6),
            "calls": len(self.calls),
            "budget": self.budget,
            "remaining": round(self.budget - self.spent, 6)
        }


class GeminiEvalClient:
    """Client for calling Gemini API with cost tracking."""

    def __init__(self, model: str = "gemini-2.5-flash", tracker: Optional[CostTracker] = None):
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY environment variable not set")

        self.client = genai.Client(api_key=api_key)
        self.model_name = model
        self.tracker = tracker or CostTracker()

    def complete(self, system: str, user: str, temperature: float = 0) -> str:
        """Send a prompt to Gemini and return the response."""
        # Combine system and user prompts (Gemini uses single prompt)
        full_prompt = f"{system}\n\n---\n\nUser request: {user}"

        response = self.client.models.generate_content(
            model=self.model_name,
            contents=full_prompt,
            config=types.GenerateContentConfig(
                temperature=temperature,
                max_output_tokens=4096,  # Increased from 1024 to allow complete responses
            )
        )

        # Track token usage
        usage = response.usage_metadata
        self.tracker.record(
            usage.prompt_token_count,
            usage.candidates_token_count if usage.candidates_token_count else 0,
            self.model_name
        )

        # Handle blocked responses (finish_reason != STOP)
        if not response.candidates or not response.candidates[0].content.parts:
            # Response was blocked by safety filters
            finish_reason = response.candidates[0].finish_reason if response.candidates else "UNKNOWN"
            return f"[Response blocked by safety filter: {finish_reason}]"

        return response.text


# ====================
# pytest Fixtures
# ====================

@pytest.fixture(scope="session")
def cost_tracker():
    """Session-scoped cost tracker - shared across all tests."""
    tracker = CostTracker(budget=5.00)
    yield tracker

    # Print summary at end of test run
    summary = tracker.summary()
    print(f"\n{'='*50}")
    print(f"Cost Summary: ${summary['total_cost']:.4f} / ${summary['budget']:.2f}")
    print(f"API calls: {summary['calls']}")
    print(f"Remaining budget: ${summary['remaining']:.4f}")
    print(f"{'='*50}")

    # Write to results file
    results_dir = Path(".ai/evals/results")
    results_dir.mkdir(parents=True, exist_ok=True)
    with open(results_dir / "cost.json", "w") as f:
        json.dump(summary, f, indent=2)


@pytest.fixture
def gemini_client(cost_tracker):
    """Create a Gemini client with shared cost tracker."""
    return GeminiEvalClient(tracker=cost_tracker)


# ====================
# Helper Functions
# ====================

def load_agent(path: str) -> str:
    """Load agent prompt from file."""
    agent_path = Path(path)
    if not agent_path.exists():
        raise FileNotFoundError(f"Agent file not found: {path}")
    return agent_path.read_text()


def judge_response(client: GeminiEvalClient, response: str, criteria: list[str]) -> dict:
    """
    Use Gemini to evaluate if a response meets criteria (LLM-as-judge pattern).

    Returns:
        dict with keys: pass (bool), score (0-100), reasoning (str)
    """
    # Handle blocked responses
    if "[Response blocked" in response:
        return {
            "pass": False,
            "score": 0,
            "reasoning": "The response was blocked by a safety filter and contains no content to evaluate."
        }

    criteria_text = "\n".join(f"- {c}" for c in criteria)
    prompt = f"""Evaluate this response against the criteria. Return valid JSON only, no markdown.

Response to evaluate:
{response[:2000]}

Criteria:
{criteria_text}

Return exactly this JSON structure (no markdown code blocks):
{{"pass": true, "score": 85, "reasoning": "brief explanation"}}"""

    result = client.complete(
        system="You are an evaluation judge. Return only valid JSON, no markdown formatting or code blocks. Keep reasoning under 100 chars.",
        user=prompt
    )

    # Clean up potential markdown formatting
    result = result.strip()
    if result.startswith("```"):
        # Remove markdown code blocks
        lines = result.split("\n")
        result = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])
        result = result.strip()

    # Try to extract JSON from response
    try:
        return json.loads(result)
    except json.JSONDecodeError:
        # Try to find JSON object in the response
        import re
        json_match = re.search(r'\{[^{}]*\}', result)
        if json_match:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError:
                pass
        # Fallback: return a failure with the raw response
        return {
            "pass": False,
            "score": 0,
            "reasoning": f"Failed to parse judge response: {result[:100]}"
        }


# ====================
# pytest Configuration
# ====================

def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line("markers", "llm_eval: mark test as requiring LLM API calls")
    config.addinivalue_line("markers", "smoke: mark test as part of smoke test suite")
    config.addinivalue_line("markers", "full: mark test as part of full test suite")
