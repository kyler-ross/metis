"""
Token counting evaluator.

Measures the token count of key files to track context size.
Lower is better - we want to reduce context bloat.
"""

import re
from pathlib import Path

from ..base import (
    BaseEvaluator,
    BranchSnapshot,
    EvalResult,
    EvalStatus,
    register_evaluator,
)


def estimate_tokens(text: str) -> int:
    """
    Estimate token count for text.

    Uses a simple heuristic: ~4 characters per token for English text.
    This is approximate but consistent for comparison purposes.

    Q2: Standardized to match JS implementation (chars / 4) for consistency
    across the codebase. Both context-loader.cjs and context-audit.cjs use
    the same formula: Math.ceil(text.length / 4)

    For more accuracy, could use tiktoken or the actual tokenizer,
    but this adds dependencies and the relative comparison is what matters.
    """
    if not text:
        return 0
    # Q2: Use chars/4 formula matching JS implementation
    import math
    return math.ceil(len(text) / 4)


@register_evaluator
class TokenCountEvaluator(BaseEvaluator):
    """
    Evaluates token count of key configuration files.

    This measures the "context load" that Claude Code sees when
    starting a session. Lower token counts mean faster startup
    and more room for actual conversation.
    """

    name = "token_count"
    description = "Measures token count in key files"
    lower_is_better = True

    # Files to measure (relative to repo root)
    FILES_TO_MEASURE = [
        ("CLAUDE.md", "Main instructions"),
        (".ai/pm/CLAUDE.md", "PM-specific instructions"),
        (".ai/eng/CLAUDE.md", "Eng-specific instructions"),
        (".cursorrules", "Cursor rules (if exists)"),
        (".ai/config/agent-manifest.json", "Agent manifest"),
    ]

    # Directories to measure aggregate tokens
    DIRS_TO_MEASURE = [
        (".ai/agents", "Agent definitions"),
        (".ai/knowledge", "Knowledge base"),
    ]

    def evaluate_branch(self, branch: BranchSnapshot) -> list[EvalResult]:
        results = []

        # Measure individual files
        total_tokens = 0
        for file_path, description in self.FILES_TO_MEASURE:
            content = branch.read_file(file_path)
            if content is not None:
                tokens = estimate_tokens(content)
                total_tokens += tokens
                results.append(EvalResult(
                    evaluator=self.name,
                    name=f"tokens:{file_path}",
                    status=EvalStatus.PASSED,
                    value=tokens,
                    details={
                        "file": file_path,
                        "description": description,
                        "chars": len(content),
                        "lines": content.count('\n') + 1,
                    }
                ))

        # Measure directories
        for dir_path, description in self.DIRS_TO_MEASURE:
            dir_tokens = 0
            file_count = 0
            files = branch.glob_files(f"{dir_path}/**/*.md")
            files.extend(branch.glob_files(f"{dir_path}/**/*.json"))

            for file in files:
                try:
                    content = file.read_text()
                    dir_tokens += estimate_tokens(content)
                    file_count += 1
                except Exception:
                    pass

            total_tokens += dir_tokens
            results.append(EvalResult(
                evaluator=self.name,
                name=f"tokens:{dir_path}/",
                status=EvalStatus.PASSED,
                value=dir_tokens,
                details={
                    "directory": dir_path,
                    "description": description,
                    "file_count": file_count,
                }
            ))

        # Add total
        results.append(EvalResult(
            evaluator=self.name,
            name="tokens:total",
            status=EvalStatus.PASSED,
            value=total_tokens,
            details={"description": "Total tokens across all measured files"},
        ))

        return results


@register_evaluator
class ClaudeMdDepthEvaluator(BaseEvaluator):
    """
    Evaluates the structure and depth of CLAUDE.md files.

    Measures how instructions are organized - flatter is often
    better for Claude to parse, but some nesting aids organization.
    """

    name = "claude_md_structure"
    description = "Analyzes CLAUDE.md structure and organization"
    lower_is_better = False  # Higher score = better organized

    def evaluate_branch(self, branch: BranchSnapshot) -> list[EvalResult]:
        results = []

        claude_files = [
            "CLAUDE.md",
            ".ai/pm/CLAUDE.md",
            ".ai/eng/CLAUDE.md",
        ]

        for file_path in claude_files:
            content = branch.read_file(file_path)
            if content is None:
                continue

            analysis = self._analyze_structure(content)
            results.append(EvalResult(
                evaluator=self.name,
                name=f"structure:{file_path}",
                status=EvalStatus.PASSED,
                value=analysis["score"],
                details=analysis,
            ))

        return results

    def _analyze_structure(self, content: str) -> dict:
        """Analyze the structure of a markdown file."""
        lines = content.split('\n')

        h1_count = sum(1 for l in lines if l.startswith('# '))
        h2_count = sum(1 for l in lines if l.startswith('## '))
        h3_count = sum(1 for l in lines if l.startswith('### '))
        h4_count = sum(1 for l in lines if l.startswith('#### '))

        # Count code blocks
        code_blocks = len(re.findall(r'```', content)) // 2

        # Count tables
        tables = len(re.findall(r'\|.*\|.*\|', content))

        # Calculate a "structure score"
        # Prefer: clear hierarchy, not too deep, reasonable sections
        total_headings = h1_count + h2_count + h3_count + h4_count
        depth_penalty = h4_count * 2  # Penalize deep nesting
        structure_score = min(100, (h2_count * 10) + (h3_count * 5) - depth_penalty)

        return {
            "h1_count": h1_count,
            "h2_count": h2_count,
            "h3_count": h3_count,
            "h4_count": h4_count,
            "total_headings": total_headings,
            "code_blocks": code_blocks,
            "tables": tables,
            "line_count": len(lines),
            "score": max(0, structure_score),
        }
