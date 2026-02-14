"""
Built-in evaluators for the PM AI evaluation framework.

Each evaluator measures a specific aspect of the system:
- TokenCountEvaluator: Measures context size (tokens in key files)
- FileStructureEvaluator: Analyzes file organization
- RoutingEvaluator: Tests agent routing accuracy
- ContextLoadingEvaluator: Analyzes what context would be loaded

To add a new evaluator:
1. Create a new file in this directory
2. Subclass BaseEvaluator
3. Decorate with @register_evaluator
4. Import in this __init__.py
"""

from .token_count import TokenCountEvaluator
from .file_structure import FileStructureEvaluator
from .routing import RoutingEvaluator
from .context_loading import ContextLoadingEvaluator

__all__ = [
    "TokenCountEvaluator",
    "FileStructureEvaluator",
    "RoutingEvaluator",
    "ContextLoadingEvaluator",
]
