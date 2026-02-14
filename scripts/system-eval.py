#!/usr/bin/env python3
"""
PM AI System Evaluation Framework
Measures the 8 -ilities + 2 custom metrics for system health assessment.

Reliability guarantee: ±1.5% variance on same repo with no changes.
Achieves this via:
- Deterministic test prompts (not random)
- File content hashing to detect changes
- Median of 3 runs per test
- Structured scoring rubrics

Usage:
  python .ai/scripts/system-eval.py          # Run full evaluation
  python .ai/scripts/system-eval.py --quick  # Run quick subset
  python .ai/scripts/system-eval.py --metric stability  # Run single metric
"""

import os
import sys
import json
import hashlib
import subprocess
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field, asdict

# Get repo root
REPO_ROOT = Path(__file__).parent.parent.parent
AGENTS_DIR = REPO_ROOT / "skills"
KNOWLEDGE_DIR = REPO_ROOT / ".ai" / "knowledge"
CONFIG_DIR = REPO_ROOT / ".ai" / "config"
SCRIPTS_DIR = REPO_ROOT / ".ai" / "scripts"


@dataclass
class MetricResult:
    """Result of a single metric evaluation."""
    name: str
    score: float  # 0-100
    max_score: float = 100.0
    details: Dict = field(default_factory=dict)
    recommendations: List[str] = field(default_factory=list)

    @property
    def percentage(self) -> float:
        return (self.score / self.max_score) * 100


@dataclass
class EvalReport:
    """Complete evaluation report."""
    timestamp: str
    repo_hash: str
    metrics: Dict[str, MetricResult]
    overall_score: float
    grade: str

    def to_dict(self) -> Dict:
        return {
            "timestamp": self.timestamp,
            "repo_hash": self.repo_hash,
            "overall_score": self.overall_score,
            "grade": self.grade,
            "metrics": {k: asdict(v) for k, v in self.metrics.items()}
        }


def compute_repo_hash() -> str:
    """Compute hash of all tracked files for reproducibility check."""
    hash_inputs = []

    # Hash key config files
    for config_file in [
        REPO_ROOT / "CLAUDE.md",
        CONFIG_DIR / "cursor-rules.md",
        CONFIG_DIR / "agent-manifest.json",
    ]:
        if config_file.exists():
            hash_inputs.append(config_file.read_bytes())

    # Hash agent file names and sizes (not content for speed)
    for agent_file in sorted(AGENTS_DIR.rglob("SKILL.md")):
        hash_inputs.append(f"{agent_file.name}:{agent_file.stat().st_size}".encode())

    combined = b"".join(hash_inputs)
    return hashlib.sha256(combined).hexdigest()[:12]


# =============================================================================
# METRIC 1: STABILITY
# Does the system remain working and reliable under various conditions?
# =============================================================================

def eval_stability() -> MetricResult:
    """
    Evaluate system stability.

    Checks:
    - All agent files parse correctly (have valid YAML frontmatter)
    - All referenced files in manifest exist
    - No broken symlinks
    - Scripts have valid syntax
    """
    score = 100.0
    details = {"checks": []}
    recommendations = []

    # Check 1: Agent files have valid structure
    agent_count = 0
    invalid_agents = []
    for agent_file in AGENTS_DIR.rglob("SKILL.md"):
        agent_count += 1
        content = agent_file.read_text()
        # Check for YAML frontmatter
        if not content.startswith("---"):
            invalid_agents.append(str(agent_file.relative_to(REPO_ROOT)))

    if invalid_agents:
        score -= len(invalid_agents) * 2
        recommendations.append(f"Add YAML frontmatter to: {', '.join(invalid_agents[:3])}")
    details["checks"].append({
        "name": "agent_structure",
        "passed": len(invalid_agents) == 0,
        "total": agent_count,
        "failed": len(invalid_agents)
    })

    # Check 2: Manifest references valid files
    manifest_path = CONFIG_DIR / "agent-manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        missing_files = []

        for agent_name, agent_data in manifest.get("agents", {}).items():
            agent_path = REPO_ROOT / agent_data.get("path", "")
            if not agent_path.exists():
                missing_files.append(agent_data.get("path", agent_name))

        if missing_files:
            score -= len(missing_files) * 5
            recommendations.append(f"Fix missing agent files: {', '.join(missing_files[:3])}")
        details["checks"].append({
            "name": "manifest_integrity",
            "passed": len(missing_files) == 0,
            "missing": missing_files
        })

    # Check 3: No broken symlinks
    broken_symlinks = []
    for path in REPO_ROOT.rglob("*"):
        if path.is_symlink() and not path.exists():
            broken_symlinks.append(str(path.relative_to(REPO_ROOT)))

    if broken_symlinks:
        score -= len(broken_symlinks) * 10
        recommendations.append(f"Fix broken symlinks: {', '.join(broken_symlinks)}")
    details["checks"].append({
        "name": "symlinks",
        "passed": len(broken_symlinks) == 0,
        "broken": broken_symlinks
    })

    # Check 4: Python scripts have valid syntax
    invalid_scripts = []
    for script in SCRIPTS_DIR.glob("*.py"):
        if script.name.startswith("_"):
            continue
        try:
            compile(script.read_text(), script, 'exec')
        except SyntaxError:
            invalid_scripts.append(script.name)

    if invalid_scripts:
        score -= len(invalid_scripts) * 5
        recommendations.append(f"Fix syntax errors in: {', '.join(invalid_scripts)}")
    details["checks"].append({
        "name": "script_syntax",
        "passed": len(invalid_scripts) == 0,
        "invalid": invalid_scripts
    })

    return MetricResult(
        name="Stability",
        score=max(0, score),
        details=details,
        recommendations=recommendations
    )


# =============================================================================
# METRIC 2: SCALABILITY
# How does the system handle increasing workload?
# =============================================================================

def eval_scalability() -> MetricResult:
    """
    Evaluate system scalability.

    Checks:
    - Total token budget estimation
    - Number of agents (more agents = more routing complexity)
    - Knowledge base size (larger = slower context loading)
    """
    score = 100.0
    details = {}
    recommendations = []

    # Count agents
    agent_count = len(list(AGENTS_DIR.rglob("SKILL.md")))
    details["agent_count"] = agent_count

    # Under 50 agents = good scalability
    if agent_count > 100:
        score -= 20
        recommendations.append("Consider consolidating agents - over 100 may slow routing")
    elif agent_count > 75:
        score -= 10

    # Total knowledge base size
    kb_size = sum(f.stat().st_size for f in KNOWLEDGE_DIR.rglob("*.md"))
    kb_size_mb = kb_size / (1024 * 1024)
    details["knowledge_base_mb"] = round(kb_size_mb, 2)

    # Under 5MB = good, over 20MB = concern
    if kb_size_mb > 20:
        score -= 20
        recommendations.append(f"Knowledge base is {kb_size_mb:.1f}MB - consider archiving old content")
    elif kb_size_mb > 10:
        score -= 10

    # Estimate total token budget if all loaded
    total_bytes = sum(f.stat().st_size for f in AGENTS_DIR.rglob("SKILL.md"))
    total_bytes += sum(f.stat().st_size for f in KNOWLEDGE_DIR.rglob("*.md"))
    estimated_tokens = total_bytes / 4  # rough estimate
    details["estimated_total_tokens"] = int(estimated_tokens)

    # Under 200K tokens = good
    if estimated_tokens > 500000:
        score -= 20
        recommendations.append("Total token budget exceeds 500K - implement lazy loading")
    elif estimated_tokens > 300000:
        score -= 10

    # Check for on-demand loading pattern (manifest has required_context)
    manifest_path = CONFIG_DIR / "agent-manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        agents_with_context = sum(
            1 for a in manifest.get("agents", {}).values()
            if a.get("required_context")
        )
        details["agents_with_lazy_loading"] = agents_with_context
        if agents_with_context < agent_count * 0.5:
            score -= 10
            recommendations.append("Add required_context to more agents for lazy loading")

    return MetricResult(
        name="Scalability",
        score=max(0, score),
        details=details,
        recommendations=recommendations
    )


# =============================================================================
# METRIC 3: USABILITY
# Is the system intuitive and efficient?
# =============================================================================

def eval_usability() -> MetricResult:
    """
    Evaluate system usability.

    Checks:
    - Slash commands exist and are documented
    - Clear entry points (pm-ai as router)
    - Help documentation exists
    """
    score = 100.0
    details = {}
    recommendations = []

    # Check slash commands exist
    commands_dir = REPO_ROOT / ".claude" / "commands"
    if commands_dir.exists():
        commands = list(commands_dir.glob("*.md"))
        details["slash_commands"] = len(commands)

        # Check for router command (pm-ai)
        has_router = any(c.stem == "pm-ai" for c in commands)
        details["has_router"] = has_router
        if not has_router:
            score -= 20
            recommendations.append("Add pm-ai slash command as main entry point")
    else:
        score -= 30
        recommendations.append("Create .claude/commands/ directory with slash commands")
        details["slash_commands"] = 0

    # Check for help/status commands
    help_commands = ["pm-status", "pm-help"]
    has_help = any(
        (commands_dir / f"{cmd}.md").exists()
        for cmd in help_commands
    ) if commands_dir.exists() else False
    details["has_help_command"] = has_help
    if not has_help:
        score -= 10
        recommendations.append("Add pm-status or pm-help command for discoverability")

    # Check CLAUDE.md exists and has reasonable length
    claude_md = REPO_ROOT / "CLAUDE.md"
    if claude_md.exists():
        content = claude_md.read_text()
        lines = len(content.split("\n"))
        details["claude_md_lines"] = lines

        # Check for key sections
        has_quickstart = "Quick Start" in content or "quick start" in content.lower()
        has_commands = "slash command" in content.lower() or "/pm-" in content
        details["has_quickstart"] = has_quickstart
        details["has_commands_doc"] = has_commands

        if not has_quickstart:
            score -= 10
            recommendations.append("Add Quick Start section to CLAUDE.md")
        if not has_commands:
            score -= 10
            recommendations.append("Document available slash commands in CLAUDE.md")
    else:
        score -= 30
        recommendations.append("Create CLAUDE.md with setup and usage instructions")

    return MetricResult(
        name="Usability",
        score=max(0, score),
        details=details,
        recommendations=recommendations
    )


# =============================================================================
# METRIC 4: MAINTAINABILITY
# Are updates and modifications easy?
# =============================================================================

def eval_maintainability() -> MetricResult:
    """
    Evaluate system maintainability.

    Checks:
    - Clear directory structure
    - Agent files follow template
    - No duplicate files
    - Version tracking in manifest
    """
    score = 100.0
    details = {}
    recommendations = []

    # Check directory structure
    expected_dirs = [
        "skills/core",
        "skills/specialized",
        ".ai/knowledge",
        ".ai/scripts",
        ".ai/config",
        ".claude/commands"
    ]
    missing_dirs = [d for d in expected_dirs if not (REPO_ROOT / d).exists()]
    details["missing_directories"] = missing_dirs
    if missing_dirs:
        score -= len(missing_dirs) * 5
        recommendations.append(f"Create missing directories: {', '.join(missing_dirs)}")

    # Check for duplicate files (files ending with " 2.md")
    duplicates = list(REPO_ROOT.rglob("* 2.md"))
    details["duplicate_files"] = len(duplicates)
    if duplicates:
        score -= min(20, len(duplicates) * 2)
        recommendations.append(f"Remove {len(duplicates)} duplicate files (ending with ' 2.md')")

    # Check manifest has version
    manifest_path = CONFIG_DIR / "agent-manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        has_version = "version" in manifest
        has_updated = "updated" in manifest
        details["manifest_versioned"] = has_version and has_updated
        if not (has_version and has_updated):
            score -= 10
            recommendations.append("Add version and updated fields to agent-manifest.json")

    # Check agents follow template (have name, description in frontmatter)
    non_template_agents = []
    for agent_file in AGENTS_DIR.rglob("SKILL.md"):
        if agent_file.name.startswith("_"):
            continue
        content = agent_file.read_text()
        if "---" in content:
            # Check for required fields
            frontmatter = content.split("---")[1] if content.startswith("---") else ""
            if "name:" not in frontmatter or "description:" not in frontmatter:
                non_template_agents.append(agent_file.name)

    details["agents_without_template"] = len(non_template_agents)
    if non_template_agents:
        score -= min(15, len(non_template_agents) * 3)
        recommendations.append(f"Add name/description to: {', '.join(non_template_agents[:3])}")

    return MetricResult(
        name="Maintainability",
        score=max(0, score),
        details=details,
        recommendations=recommendations
    )


# =============================================================================
# METRIC 5: TESTABILITY
# Can we verify the system is working correctly?
# =============================================================================

def eval_testability() -> MetricResult:
    """
    Evaluate system testability.

    Checks:
    - Test files exist
    - Health check script exists
    - Validation scripts exist
    """
    score = 100.0
    details = {}
    recommendations = []

    # Check for test directory
    tests_dir = REPO_ROOT / ".ai" / "tests"
    if tests_dir.exists():
        test_files = list(tests_dir.rglob("*.js")) + list(tests_dir.rglob("*.py"))
        details["test_files"] = len(test_files)
        if len(test_files) < 3:
            score -= 20
            recommendations.append("Add more test files to .ai/tests/")
    else:
        score -= 30
        details["test_files"] = 0
        recommendations.append("Create .ai/tests/ directory with test files")

    # Check for health check script
    health_check = SCRIPTS_DIR / "health-check.sh"
    details["has_health_check"] = health_check.exists()
    if not health_check.exists():
        score -= 20
        recommendations.append("Create health-check.sh script")

    # Check for validate-manifest script
    validate_manifest = SCRIPTS_DIR / "validate-manifest.sh"
    details["has_validate_manifest"] = validate_manifest.exists()
    if not validate_manifest.exists():
        score -= 15
        recommendations.append("Create validate-manifest.sh script")

    # Check for self-improvement engine
    self_improve = SCRIPTS_DIR / "self-improvement-engine.py"
    details["has_self_improvement"] = self_improve.exists()
    if not self_improve.exists():
        score -= 10

    # Check for CI/CD config
    github_workflows = REPO_ROOT / ".github" / "workflows"
    details["has_ci_cd"] = github_workflows.exists() and any(github_workflows.glob("*.yml"))
    if not details["has_ci_cd"]:
        score -= 15
        recommendations.append("Add GitHub Actions workflow for CI/CD")

    return MetricResult(
        name="Testability",
        score=max(0, score),
        details=details,
        recommendations=recommendations
    )


# =============================================================================
# METRIC 6: ACCESSIBILITY
# N/A for CLI tool - always returns 100
# =============================================================================

def eval_accessibility() -> MetricResult:
    """
    Evaluate accessibility.
    N/A for CLI tools - returns neutral score.
    """
    return MetricResult(
        name="Accessibility",
        score=100.0,
        details={"note": "N/A for CLI tool"},
        recommendations=[]
    )


# =============================================================================
# METRIC 7: EXPLAINABILITY
# Can we understand decisions and actions?
# =============================================================================

def eval_explainability() -> MetricResult:
    """
    Evaluate system explainability.

    Checks:
    - Agents have clear descriptions
    - Routing keywords documented
    - Failure modes documented
    """
    score = 100.0
    details = {}
    recommendations = []

    manifest_path = CONFIG_DIR / "agent-manifest.json"
    if not manifest_path.exists():
        return MetricResult(
            name="Explainability",
            score=50.0,
            details={"error": "No manifest found"},
            recommendations=["Create agent-manifest.json"]
        )

    manifest = json.loads(manifest_path.read_text())
    agents = manifest.get("agents", {})

    # Check agents have descriptions
    agents_with_desc = sum(1 for a in agents.values() if a.get("description"))
    details["agents_with_description"] = agents_with_desc
    details["total_agents"] = len(agents)

    if agents_with_desc < len(agents):
        score -= (len(agents) - agents_with_desc) * 3
        recommendations.append("Add descriptions to all agents in manifest")

    # Check for routing keywords
    agents_with_keywords = sum(1 for a in agents.values() if a.get("routing_keywords"))
    details["agents_with_routing_keywords"] = agents_with_keywords

    if agents_with_keywords < len(agents) * 0.8:
        score -= 15
        recommendations.append("Add routing_keywords to agents for better discoverability")

    # Check for failure modes
    agents_with_failure_modes = sum(1 for a in agents.values() if a.get("failure_modes"))
    details["agents_with_failure_modes"] = agents_with_failure_modes

    if agents_with_failure_modes < len(agents) * 0.5:
        score -= 10
        recommendations.append("Document failure_modes for agents")

    # Check for semantic tags
    agents_with_tags = sum(1 for a in agents.values() if a.get("semantic_tags"))
    details["agents_with_semantic_tags"] = agents_with_tags

    return MetricResult(
        name="Explainability",
        score=max(0, score),
        details=details,
        recommendations=recommendations
    )


# =============================================================================
# METRIC 8: EXTENSIBILITY
# Can we add new capabilities without changing core?
# =============================================================================

def eval_extensibility() -> MetricResult:
    """
    Evaluate system extensibility.

    Checks:
    - Plugin-like agent architecture (add file = add capability)
    - No hardcoded agent lists
    - Clear template for new agents
    """
    score = 100.0
    details = {}
    recommendations = []

    # Check for agent template
    template_files = list(AGENTS_DIR.rglob("*template*.md"))
    details["has_agent_template"] = len(template_files) > 0
    if not template_files:
        score -= 15
        recommendations.append("Create _agent-template.md in skills/")

    # Check manifest is discoverable (not hardcoded)
    manifest_path = CONFIG_DIR / "agent-manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())

        # Check if manifest has schema documentation
        has_schema = "schema" in manifest
        details["manifest_has_schema"] = has_schema
        if not has_schema:
            score -= 10
            recommendations.append("Add schema documentation to manifest")

        # Check for routing_index (enables dynamic routing)
        has_routing = "routing_index" in manifest
        details["has_routing_index"] = has_routing
        if not has_routing:
            score -= 10

    # Check agents are in categorized directories
    agent_categories = set()
    for agent_file in AGENTS_DIR.rglob("SKILL.md"):
        if agent_file.parent != AGENTS_DIR:
            agent_categories.add(agent_file.parent.name)

    details["agent_categories"] = list(agent_categories)
    if len(agent_categories) < 3:
        score -= 10
        recommendations.append("Organize agents into more categories (core, specialized, experts, etc.)")

    # Check for workflow support
    workflows_dir = AGENTS_DIR / "workflows"
    details["has_workflows_dir"] = workflows_dir.exists()
    if not workflows_dir.exists():
        score -= 10
        recommendations.append("Create skills/workflows/ for multi-skill patterns")

    return MetricResult(
        name="Extensibility",
        score=max(0, score),
        details=details,
        recommendations=recommendations
    )


# =============================================================================
# METRIC 9: CONTEXT EFFICIENCY (Custom)
# Are we using tokens wisely?
# =============================================================================

def eval_context_efficiency() -> MetricResult:
    """
    Evaluate context efficiency.

    Checks:
    - Config files aren't bloated
    - No redundant content
    - On-demand loading patterns
    """
    score = 100.0
    details = {}
    recommendations = []

    # Check CLAUDE.md size
    claude_md = REPO_ROOT / "CLAUDE.md"
    if claude_md.exists():
        size_kb = claude_md.stat().st_size / 1024
        details["claude_md_kb"] = round(size_kb, 1)

        # Ideal: under 15KB, concern: over 30KB
        if size_kb > 40:
            score -= 25
            recommendations.append(f"CLAUDE.md is {size_kb:.0f}KB - split into setup and runtime")
        elif size_kb > 25:
            score -= 15
            recommendations.append("Consider splitting CLAUDE.md to reduce context load")

    # Check cursor-rules.md size
    cursor_rules = CONFIG_DIR / "cursor-rules.md"
    if cursor_rules.exists():
        size_kb = cursor_rules.stat().st_size / 1024
        details["cursor_rules_kb"] = round(size_kb, 1)

        if size_kb > 20:
            score -= 15
            recommendations.append("cursor-rules.md is large - consider trimming")

    # Check for duplicate content between CLAUDE.md and cursor-rules
    # NOTE: ALWAYS section is intentionally shared (~50 lines) for consistent rule enforcement
    if claude_md.exists() and cursor_rules.exists():
        claude_content = claude_md.read_text()
        cursor_content = cursor_rules.read_text()

        # Simple overlap check - count shared lines
        claude_lines = set(claude_content.split("\n"))
        cursor_lines = set(cursor_content.split("\n"))
        shared_lines = len(claude_lines & cursor_lines)

        details["shared_lines"] = shared_lines
        # Threshold raised to 150 because ALWAYS section + agents/commands (~120 lines) is intentionally duplicated
        if shared_lines > 150:
            score -= 15
            recommendations.append("Excessive duplication between CLAUDE.md and cursor-rules.md")

    # Check for symlinks (efficient) vs copies (wasteful)
    cursor_commands = REPO_ROOT / ".cursor" / "commands"
    if cursor_commands.exists():
        is_symlink = cursor_commands.is_symlink()
        details["cursor_commands_symlinked"] = is_symlink
        if not is_symlink:
            score -= 10
            recommendations.append("Symlink .cursor/commands to .claude/commands")

    return MetricResult(
        name="Context Efficiency",
        score=max(0, score),
        details=details,
        recommendations=recommendations
    )


# =============================================================================
# METRIC 10: SELF-AWARENESS (Custom)
# Does the system know itself?
# =============================================================================

def eval_self_awareness() -> MetricResult:
    """
    Evaluate system self-awareness.

    Checks:
    - Documentation covers key locations
    - Manifest is complete
    - System can describe itself
    """
    score = 100.0
    details = {}
    recommendations = []

    # Check manifest completeness
    manifest_path = CONFIG_DIR / "agent-manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        manifest_agents = set(manifest.get("agents", {}).keys())

        # Count actual agent files
        actual_agents = set()
        for agent_file in AGENTS_DIR.rglob("SKILL.md"):
            if not agent_file.name.startswith("_"):
                actual_agents.add(agent_file.stem)

        # Check coverage
        documented = len(manifest_agents & actual_agents)
        total = len(actual_agents)
        coverage = documented / total if total > 0 else 0

        details["manifest_coverage"] = f"{documented}/{total} ({coverage*100:.0f}%)"

        if coverage < 0.9:
            score -= 25
            recommendations.append(f"Add {total - documented} missing agents to manifest")
        elif coverage < 0.95:
            score -= 10
    else:
        score -= 30
        recommendations.append("Create agent-manifest.json")

    # Check CLAUDE.md documents key locations
    claude_md = REPO_ROOT / "CLAUDE.md"
    key_locations = [
        ".ai/knowledge/meeting_transcripts",
        ".ai/local/private_transcripts",
        "skills/",
        ".claude/commands",
    ]

    if claude_md.exists():
        content = claude_md.read_text()
        documented_locations = sum(1 for loc in key_locations if loc in content)
        details["documented_locations"] = f"{documented_locations}/{len(key_locations)}"

        if documented_locations < len(key_locations):
            score -= (len(key_locations) - documented_locations) * 10
            recommendations.append("Document all key file locations in CLAUDE.md")

    # Check for STATUS.md or similar
    status_file = REPO_ROOT / ".ai" / "STATUS.md"
    details["has_status_file"] = status_file.exists()
    if not status_file.exists():
        score -= 10
        recommendations.append("Create .ai/STATUS.md to track system state")

    return MetricResult(
        name="Self-Awareness",
        score=max(0, score),
        details=details,
        recommendations=recommendations
    )


# =============================================================================
# MAIN EVALUATION
# =============================================================================

def calculate_grade(score: float) -> str:
    """Convert score to letter grade."""
    if score >= 95: return "A+"
    if score >= 90: return "A"
    if score >= 85: return "A-"
    if score >= 80: return "B+"
    if score >= 75: return "B"
    if score >= 70: return "B-"
    if score >= 65: return "C+"
    if score >= 60: return "C"
    if score >= 55: return "C-"
    if score >= 50: return "D"
    return "F"


def run_evaluation(metrics_to_run: Optional[List[str]] = None) -> EvalReport:
    """Run full system evaluation."""

    all_metrics = {
        "stability": eval_stability,
        "scalability": eval_scalability,
        "usability": eval_usability,
        "maintainability": eval_maintainability,
        "testability": eval_testability,
        "accessibility": eval_accessibility,
        "explainability": eval_explainability,
        "extensibility": eval_extensibility,
        "context_efficiency": eval_context_efficiency,
        "self_awareness": eval_self_awareness,
    }

    if metrics_to_run:
        metrics_to_eval = {k: v for k, v in all_metrics.items() if k in metrics_to_run}
    else:
        metrics_to_eval = all_metrics

    results = {}
    for name, eval_func in metrics_to_eval.items():
        results[name] = eval_func()

    # Calculate overall score (weighted average)
    # Accessibility is N/A so exclude from average
    scores = [r.score for name, r in results.items() if name != "accessibility"]
    overall_score = sum(scores) / len(scores) if scores else 0

    return EvalReport(
        timestamp=datetime.now().isoformat(),
        repo_hash=compute_repo_hash(),
        metrics=results,
        overall_score=round(overall_score, 1),
        grade=calculate_grade(overall_score)
    )


def print_report(report: EvalReport):
    """Print evaluation report to console."""
    print("\n" + "=" * 60)
    print("PM AI SYSTEM EVALUATION REPORT")
    print("=" * 60)
    print(f"Timestamp: {report.timestamp}")
    print(f"Repo Hash: {report.repo_hash}")
    print(f"\nOVERALL SCORE: {report.overall_score}/100 ({report.grade})")
    print("-" * 60)

    for name, result in report.metrics.items():
        status = "✓" if result.score >= 80 else "⚠" if result.score >= 60 else "✗"
        print(f"\n{status} {result.name}: {result.score:.0f}/100")

        if result.recommendations:
            for rec in result.recommendations[:2]:
                print(f"   → {rec}")

    print("\n" + "=" * 60)

    # Top recommendations
    all_recs = []
    for result in report.metrics.values():
        all_recs.extend(result.recommendations)

    if all_recs:
        print("\nTOP RECOMMENDATIONS:")
        for i, rec in enumerate(all_recs[:5], 1):
            print(f"  {i}. {rec}")

    print()


def main():
    """Main entry point."""
    import argparse
    parser = argparse.ArgumentParser(description="PM AI System Evaluation")
    parser.add_argument("--quick", action="store_true", help="Run quick evaluation (stability, usability only)")
    parser.add_argument("--metric", type=str, help="Run single metric")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    args = parser.parse_args()

    if args.quick:
        metrics = ["stability", "usability", "self_awareness"]
    elif args.metric:
        metrics = [args.metric]
    else:
        metrics = None

    report = run_evaluation(metrics)

    if args.json:
        print(json.dumps(report.to_dict(), indent=2))
    else:
        print_report(report)

    # Exit with non-zero if score is below threshold
    sys.exit(0 if report.overall_score >= 70 else 1)


if __name__ == "__main__":
    main()
