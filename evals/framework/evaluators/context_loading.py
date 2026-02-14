"""
Context loading evaluator.

Analyzes what context would be loaded for different agent invocations.
Useful for measuring the effectiveness of progressive context loading.
"""

import json
from pathlib import Path
from typing import Optional

from ..base import (
    BaseEvaluator,
    BranchSnapshot,
    EvalResult,
    EvalStatus,
    register_evaluator,
)
from .token_count import estimate_tokens


@register_evaluator
class ContextLoadingEvaluator(BaseEvaluator):
    """
    Evaluates context loading efficiency.

    Measures:
    - What files would be loaded for each agent
    - Token cost of agent context
    - Comparison of progressive vs greedy loading
    """

    name = "context_loading"
    description = "Analyzes context loading patterns"
    lower_is_better = True  # Less context = better

    # Agents to analyze (most commonly used)
    AGENTS_TO_ANALYZE = [
        "product-coach",
        "sql-query-builder",
        "jira-ticket-writer",
        "daily-chief-of-staff",
        "weekly-update-writer",
    ]

    def evaluate_branch(self, branch: BranchSnapshot) -> list[EvalResult]:
        results = []

        # Load manifest to get context definitions
        manifest_content = branch.read_file(".ai/config/agent-manifest.json")
        if not manifest_content:
            return [EvalResult(
                evaluator=self.name,
                name="context:manifest",
                status=EvalStatus.ERROR,
                error="Could not load agent manifest",
            )]

        try:
            manifest = json.loads(manifest_content)
            agents_data = manifest.get("agents", {})
            # Handle both dict format (name -> config) and list format
            if isinstance(agents_data, dict):
                agents = agents_data  # Already keyed by name
            else:
                # Fix: Filter out agents with empty/missing names to avoid dict key issues
                agents = {
                    name: a
                    for a in agents_data
                    if isinstance(a, dict) and (name := a.get("name")) and name.strip()
                }
        except json.JSONDecodeError as e:
            return [EvalResult(
                evaluator=self.name,
                name="context:manifest",
                status=EvalStatus.ERROR,
                error=f"Invalid manifest JSON: {e}",
            )]

        # Analyze each agent's context
        total_potential_tokens = 0
        total_required_tokens = 0

        for agent_name in self.AGENTS_TO_ANALYZE:
            agent = agents.get(agent_name)
            if not agent:
                continue

            agent_result = self._analyze_agent_context(branch, agent_name, agent)
            results.append(agent_result)

            if agent_result.details:
                total_potential_tokens += agent_result.details.get("potential_tokens", 0)
                total_required_tokens += agent_result.details.get("required_tokens", 0)

        # Summary metrics
        results.append(EvalResult(
            evaluator=self.name,
            name="context:total_required",
            status=EvalStatus.PASSED,
            value=total_required_tokens,
            details={"description": "Total tokens in required_context across analyzed agents"},
        ))

        results.append(EvalResult(
            evaluator=self.name,
            name="context:total_potential",
            status=EvalStatus.PASSED,
            value=total_potential_tokens,
            details={"description": "Total tokens if all optional context loaded"},
        ))

        # Calculate efficiency ratio
        if total_potential_tokens > 0:
            efficiency = (1 - total_required_tokens / total_potential_tokens) * 100
        else:
            efficiency = 0

        results.append(EvalResult(
            evaluator=self.name,
            name="context:efficiency",
            status=EvalStatus.PASSED,
            value=efficiency,
            details={"description": "% reduction from progressive loading"},
        ))

        return results

    def _analyze_agent_context(
        self,
        branch: BranchSnapshot,
        agent_name: str,
        agent: dict
    ) -> EvalResult:
        """Analyze context loading for a single agent."""

        # Get context configuration - support both old and new formats
        context_loading = agent.get("context_loading", {})
        context_config = agent.get("context", {})
        required_context = agent.get("required_context",
                                     context_loading.get("always",
                                     context_config.get("always", [])))
        optional_context = agent.get("optional_context",
                                     context_loading.get("conditional",
                                     context_config.get("conditional", {})))

        # Calculate required tokens
        required_tokens = 0
        required_files = []

        for file_path in required_context:
            content = branch.read_file(file_path)
            if content:
                tokens = estimate_tokens(content)
                required_tokens += tokens
                required_files.append({"path": file_path, "tokens": tokens})

        # Calculate potential tokens (if all optional loaded)
        potential_tokens = required_tokens

        if isinstance(optional_context, dict):
            for key, paths in optional_context.items():
                if isinstance(paths, list):
                    for path in paths:
                        content = branch.read_file(path)
                        if content:
                            potential_tokens += estimate_tokens(content)
                elif isinstance(paths, str):
                    content = branch.read_file(paths)
                    if content:
                        potential_tokens += estimate_tokens(content)

        # Also check the agent definition file itself
        # Q4: Use agent's path from manifest instead of hardcoding ".ai/agents/core/"
        # The manifest stores the actual path which can be in core/, eng/, specialized/, etc.
        agent_file = agent.get("path") or agent.get("file")
        if not agent_file:
            # Fallback: look in common agent directories
            for agent_dir in [".ai/agents/core", ".ai/agents/eng", ".ai/agents/specialized", ".ai/agents/workflows"]:
                candidate = f"{agent_dir}/{agent_name}.md"
                if branch.read_file(candidate) is not None:
                    agent_file = candidate
                    break
            if not agent_file:
                agent_file = f".ai/agents/core/{agent_name}.md"  # Last resort fallback

        agent_content = branch.read_file(agent_file)
        if agent_content:
            agent_tokens = estimate_tokens(agent_content)
            required_tokens += agent_tokens
            potential_tokens += agent_tokens
            required_files.append({"path": agent_file, "tokens": agent_tokens})

        return EvalResult(
            evaluator=self.name,
            name=f"context:{agent_name}",
            status=EvalStatus.PASSED,
            value=required_tokens,
            details={
                "agent": agent_name,
                "required_tokens": required_tokens,
                "potential_tokens": potential_tokens,
                "required_files": required_files,
                "has_progressive_loading": bool(optional_context),
            },
        )


@register_evaluator
class LatentSpacePrimingEvaluator(BaseEvaluator):
    """
    Evaluates presence of latent space engineering patterns in agent prompts.

    Checks for:
    - Confidence/supportive language
    - Reflection prompts
    - Style exemplars
    - Competitive dynamics
    """

    name = "latent_space_priming"
    description = "Checks for latent space engineering patterns"
    lower_is_better = False  # More patterns = better

    # Patterns to look for (case-insensitive)
    CONFIDENCE_PATTERNS = [
        r"you'?ve? got this",
        r"take your time",
        r"no rush",
        r"thoughtful.*response",
        r"well.?reasoned",
    ]

    REFLECTION_PATTERNS = [
        r"before respond",
        r"consider:",
        r"what assumptions",
        r"what would.*verify",
        r"briefly consider",
    ]

    EXEMPLAR_PATTERNS = [
        r"style exemplar",
        r"example of.*style",
        r"match this tone",
        r"good style:",
        r"bad style:",
    ]

    COMPETITIVE_PATTERNS = [
        r"credited",
        r"recognition",
        r"multiple.*review",
        r"competition",
    ]

    def evaluate_branch(self, branch: BranchSnapshot) -> list[EvalResult]:
        results = []

        # Find all agent files
        agent_files = branch.glob_files(".ai/agents/**/*.md")

        total_agents = 0
        agents_with_priming = 0
        pattern_counts = {
            "confidence": 0,
            "reflection": 0,
            "exemplar": 0,
            "competitive": 0,
        }

        for agent_file in agent_files:
            if agent_file.name == "README.md":
                continue

            total_agents += 1
            content = agent_file.read_text().lower()

            has_any = False

            for pattern in self.CONFIDENCE_PATTERNS:
                if self._pattern_found(pattern, content):
                    pattern_counts["confidence"] += 1
                    has_any = True
                    break

            for pattern in self.REFLECTION_PATTERNS:
                if self._pattern_found(pattern, content):
                    pattern_counts["reflection"] += 1
                    has_any = True
                    break

            for pattern in self.EXEMPLAR_PATTERNS:
                if self._pattern_found(pattern, content):
                    pattern_counts["exemplar"] += 1
                    has_any = True
                    break

            for pattern in self.COMPETITIVE_PATTERNS:
                if self._pattern_found(pattern, content):
                    pattern_counts["competitive"] += 1
                    has_any = True
                    break

            if has_any:
                agents_with_priming += 1

        # Calculate coverage
        coverage = (agents_with_priming / total_agents * 100) if total_agents > 0 else 0

        results.append(EvalResult(
            evaluator=self.name,
            name="priming:coverage",
            status=EvalStatus.PASSED,
            value=coverage,
            score=coverage,
            details={
                "agents_with_priming": agents_with_priming,
                "total_agents": total_agents,
            },
        ))

        for pattern_type, count in pattern_counts.items():
            results.append(EvalResult(
                evaluator=self.name,
                name=f"priming:{pattern_type}",
                status=EvalStatus.PASSED,
                value=count,
                details={"description": f"Agents with {pattern_type} patterns"},
            ))

        return results

    def _pattern_found(self, pattern: str, content: str) -> bool:
        """Check if pattern is found in content."""
        import re
        return bool(re.search(pattern, content, re.IGNORECASE))
