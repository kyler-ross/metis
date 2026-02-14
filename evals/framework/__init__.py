"""
A/B Evaluation Framework for Claude Code
=========================================

A modular, extensible framework for comparing PM AI agent performance
across branches.

## Quick Start

```python
from framework import EvalRunner
from framework.evaluators import TokenCountEvaluator, RoutingEvaluator

runner = EvalRunner(
    branch_a_path="/path/to/main",
    branch_b_path="/path/to/feature",
)

report = runner.run([
    TokenCountEvaluator(),
    RoutingEvaluator(),
])

print(report.to_json())
```

## Architecture

- `base.py`: Core abstractions (BaseEvaluator, EvalResult, EvalReport)
- `evaluators/`: Built-in evaluators (token count, routing, etc.)
- `reporters.py`: Report generation (Markdown, JSON)
- `runner.py`: Orchestrates evaluation runs

## Adding New Evaluators

1. Subclass `BaseEvaluator`
2. Implement `evaluate_branch()`
3. Decorate with `@register_evaluator`
4. Import in `evaluators/__init__.py`

See `evaluators/token_count.py` for an example.
"""

__version__ = "0.2.0"

from .base import (
    BaseEvaluator,
    BranchSnapshot,
    EvalResult,
    EvalReport,
    EvalStatus,
    register_evaluator,
    get_evaluator,
    list_evaluators,
    get_all_evaluators,
)

from .runner import EvalRunner
from .reporters import MarkdownReporter, JSONReporter, print_summary

# Import evaluators to register them
from . import evaluators

__all__ = [
    # Core classes
    "BaseEvaluator",
    "BranchSnapshot",
    "EvalResult",
    "EvalReport",
    "EvalStatus",
    # Registry
    "register_evaluator",
    "get_evaluator",
    "list_evaluators",
    "get_all_evaluators",
    # Runner
    "EvalRunner",
    # Reporters
    "MarkdownReporter",
    "JSONReporter",
    "print_summary",
]
