"""
LLM-as-Judge for quality evaluation using Gemini.
"""

import os
import json
import re
from typing import Optional
from dataclasses import dataclass


@dataclass
class JudgeResult:
    """Result from quality judgment."""
    score: float  # 1-5 scale
    passed: bool
    reasoning: str
    criteria_scores: dict  # Individual scores per criterion
    raw_response: str = ""


class QualityJudge:
    """
    Uses Gemini to evaluate response quality.
    Wraps the evaluation logic in a reusable class.
    """

    def __init__(self, model: str = "gemini-2.5-flash"):
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY environment variable required")

        # Lazy import to keep framework lightweight
        from google import genai
        from google.genai import types
        self.genai = genai
        self.types = types

        self.client = genai.Client(api_key=api_key)
        self.model = model

    def judge(
        self,
        response: str,
        criteria: list[str],
        context: Optional[str] = None,
        expected: Optional[str] = None,
    ) -> JudgeResult:
        """
        Evaluate a response against criteria.

        Args:
            response: The response to evaluate
            criteria: List of criteria to judge against
            context: Optional context about the task
            expected: Optional expected response for comparison

        Returns:
            JudgeResult with score, pass/fail, and reasoning
        """
        if not response or "[Response blocked" in response:
            return JudgeResult(
                score=0,
                passed=False,
                reasoning="Response was empty or blocked",
                criteria_scores={c: 0 for c in criteria},
            )

        # Build the evaluation prompt
        criteria_text = "\n".join(f"{i+1}. {c}" for i, c in enumerate(criteria))

        prompt = f"""You are an expert evaluator. Score this response on a 1-5 scale.

## Response to Evaluate
{response[:3000]}

## Criteria (score each 1-5)
{criteria_text}

{"## Context" + chr(10) + context if context else ""}
{"## Expected Response" + chr(10) + expected[:1000] if expected else ""}

## Instructions
1. Score each criterion from 1 (poor) to 5 (excellent)
2. Calculate overall score as average
3. Pass if overall >= 3.5

Return ONLY valid JSON (no markdown):
{{"overall_score": 4.2, "passed": true, "criteria_scores": {{"criterion_name": 4}}, "reasoning": "brief explanation"}}"""

        try:
            result = self.client.models.generate_content(
                model=self.model,
                contents=prompt,
                config=self.types.GenerateContentConfig(
                    temperature=0,
                    max_output_tokens=1024,
                )
            )
            raw = result.text.strip()
            return self._parse_result(raw, criteria)

        except Exception as e:
            return JudgeResult(
                score=0,
                passed=False,
                reasoning=f"Judge error: {str(e)}",
                criteria_scores={c: 0 for c in criteria},
            )

    def _parse_result(self, raw: str, criteria: list[str]) -> JudgeResult:
        """Parse the judge's JSON response."""
        # Clean markdown if present
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])
            raw = raw.strip()

        try:
            data = json.loads(raw)
            return JudgeResult(
                score=float(data.get("overall_score", 0)),
                passed=bool(data.get("passed", False)),
                reasoning=data.get("reasoning", ""),
                criteria_scores=data.get("criteria_scores", {}),
                raw_response=raw,
            )
        except json.JSONDecodeError:
            # Try to extract JSON object
            match = re.search(r'\{[^{}]*"overall_score"[^{}]*\}', raw, re.DOTALL)
            if match:
                try:
                    data = json.loads(match.group())
                    return JudgeResult(
                        score=float(data.get("overall_score", 0)),
                        passed=bool(data.get("passed", False)),
                        reasoning=data.get("reasoning", ""),
                        criteria_scores=data.get("criteria_scores", {}),
                        raw_response=raw,
                    )
                except Exception:
                    pass

            return JudgeResult(
                score=0,
                passed=False,
                reasoning=f"Failed to parse: {raw[:200]}",
                criteria_scores={c: 0 for c in criteria},
                raw_response=raw,
            )

    def judge_routing(self, response: str, expected_agent: str) -> JudgeResult:
        """
        Specialized judge for routing accuracy.
        Checks if response indicates routing to the expected agent.
        """
        # Look for agent name in response
        response_lower = response.lower()
        expected_lower = expected_agent.lower().replace("-", " ").replace("_", " ")

        # Check various patterns
        patterns = [
            expected_agent.lower(),
            expected_agent.replace("-", " ").lower(),
            expected_agent.replace("_", " ").lower(),
        ]

        found = any(p in response_lower for p in patterns)

        return JudgeResult(
            score=5.0 if found else 1.0,
            passed=found,
            reasoning=f"Expected '{expected_agent}', {'found' if found else 'not found'} in response",
            criteria_scores={"routing_accuracy": 5 if found else 1},
        )
