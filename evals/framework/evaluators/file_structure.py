"""
File structure evaluator.

Analyzes the organization of files in the repository.
Useful for tracking how restructuring affects the codebase.
"""

import json
from pathlib import Path

from ..base import (
    BaseEvaluator,
    BranchSnapshot,
    EvalResult,
    EvalStatus,
    register_evaluator,
)


@register_evaluator
class FileStructureEvaluator(BaseEvaluator):
    """
    Evaluates the file structure of the PM AI system.

    Tracks:
    - Number of agents
    - Number of knowledge files
    - Agent organization (flat vs categorized)
    - Manifest completeness
    """

    name = "file_structure"
    description = "Analyzes file organization and structure"
    lower_is_better = False  # More organization = better (to a point)

    def evaluate_branch(self, branch: BranchSnapshot) -> list[EvalResult]:
        results = []

        # Count agents
        agent_results = self._count_agents(branch)
        results.extend(agent_results)

        # Count knowledge files
        knowledge_results = self._count_knowledge(branch)
        results.extend(knowledge_results)

        # Check manifest completeness
        manifest_results = self._check_manifest(branch)
        results.extend(manifest_results)

        return results

    def _count_agents(self, branch: BranchSnapshot) -> list[EvalResult]:
        """Count and categorize agent files."""
        results = []

        # Find all agent markdown files
        agent_files = branch.glob_files(".ai/agents/**/*.md")
        agent_files = [f for f in agent_files if f.name != "README.md"]

        # Categorize by directory
        categories = {}
        for f in agent_files:
            # Get the category (subdirectory name)
            rel_path = f.relative_to(branch.path / ".ai/agents")
            if len(rel_path.parts) > 1:
                category = rel_path.parts[0]
            else:
                category = "root"
            categories.setdefault(category, []).append(f.name)

        results.append(EvalResult(
            evaluator=self.name,
            name="agents:total_count",
            status=EvalStatus.PASSED,
            value=len(agent_files),
            details={"files": [f.name for f in agent_files]},
        ))

        results.append(EvalResult(
            evaluator=self.name,
            name="agents:categories",
            status=EvalStatus.PASSED,
            value=len(categories),
            details={"categories": {k: len(v) for k, v in categories.items()}},
        ))

        # Check for eng agents specifically (new in restructure)
        eng_agents = categories.get("eng", [])
        results.append(EvalResult(
            evaluator=self.name,
            name="agents:eng_count",
            status=EvalStatus.PASSED,
            value=len(eng_agents),
            details={"agents": eng_agents},
        ))

        return results

    def _count_knowledge(self, branch: BranchSnapshot) -> list[EvalResult]:
        """Count knowledge base files."""
        results = []

        knowledge_files = branch.glob_files(".ai/knowledge/**/*.md")
        knowledge_files.extend(branch.glob_files(".ai/knowledge/**/*.json"))

        # Exclude auto-generated files
        excluded = {"about-me.md", "about-cloaked.md"}
        knowledge_files = [f for f in knowledge_files if f.name not in excluded]

        results.append(EvalResult(
            evaluator=self.name,
            name="knowledge:file_count",
            status=EvalStatus.PASSED,
            value=len(knowledge_files),
            details={},
        ))

        # Check for experiment files
        experiment_files = branch.glob_files(".ai/knowledge/experiments/**/*.json")
        experiment_files = [f for f in experiment_files if not f.name.startswith("_")]

        results.append(EvalResult(
            evaluator=self.name,
            name="knowledge:experiment_count",
            status=EvalStatus.PASSED,
            value=len(experiment_files),
            details={},
        ))

        return results

    def _check_manifest(self, branch: BranchSnapshot) -> list[EvalResult]:
        """Check agent manifest completeness."""
        results = []

        manifest_content = branch.read_file(".ai/config/agent-manifest.json")
        if manifest_content is None:
            results.append(EvalResult(
                evaluator=self.name,
                name="manifest:exists",
                status=EvalStatus.FAILED,
                value=False,
                error="agent-manifest.json not found",
            ))
            return results

        try:
            manifest = json.loads(manifest_content)
            agents_data = manifest.get("agents", {})

            # Handle both dict format (name -> config) and list format
            if isinstance(agents_data, dict):
                agents = list(agents_data.values())
            else:
                agents = agents_data

            results.append(EvalResult(
                evaluator=self.name,
                name="manifest:agent_count",
                status=EvalStatus.PASSED,
                value=len(agents),
                details={},
            ))

            # Check for agents with descriptions > 100 chars
            rich_descriptions = [
                a for a in agents
                if isinstance(a, dict) and len(a.get("description", "")) > 100
            ]
            results.append(EvalResult(
                evaluator=self.name,
                name="manifest:rich_descriptions",
                status=EvalStatus.PASSED,
                value=len(rich_descriptions),
                details={
                    "percentage": len(rich_descriptions) / len(agents) * 100 if agents else 0
                },
            ))

            # Check for agents with context_loading or required_context defined
            with_context = [
                a for a in agents
                if isinstance(a, dict) and (a.get("required_context") or a.get("context_loading"))
            ]
            results.append(EvalResult(
                evaluator=self.name,
                name="manifest:context_defined",
                status=EvalStatus.PASSED,
                value=len(with_context),
                details={
                    "percentage": len(with_context) / len(agents) * 100 if agents else 0
                },
            ))

        except json.JSONDecodeError as e:
            results.append(EvalResult(
                evaluator=self.name,
                name="manifest:valid_json",
                status=EvalStatus.FAILED,
                value=False,
                error=str(e),
            ))

        return results
