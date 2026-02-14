#!/usr/bin/env python3
"""
Manifest Sync - Auto-generate and sync agent manifest entries.

Scans agent directories, extracts frontmatter, and syncs with manifest.
Classifies fields as: auto-generated (60%), suggested (25%), manual (15%).

Usage:
    python manifest-sync.py           # Report mode (show what would change)
    python manifest-sync.py --apply   # Apply changes to manifest
    python manifest-sync.py --json    # JSON output for CI
"""

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
from script_runner import run as script_run

# Configuration
AGENT_DIRECTORIES = [
    "skills/core",
    "skills/specialized",
    "skills/utilities",
    "skills/experts",
    "skills/personas",
    "skills/workflows",
    ".claude/agents",
]
MANIFEST_PATH = ".ai/config/agent-manifest.json"
REPORTS_DIR = ".ai/reports"
KNOWLEDGE_INDEX_PATH = ".ai/config/knowledge-index.json"

# Field classification
AUTO_FIELDS = {"path", "name", "description", "agent_type", "status", "version"}
SUGGESTED_FIELDS = {"tags", "semantic_tags", "routing_keywords", "required_context"}
MANUAL_FIELDS = {"input_types", "output_types", "failure_modes", "mcp_tools"}


@dataclass
class AgentFile:
    """Represents an agent file on disk."""
    path: str
    name: str
    description: str
    content: str
    agent_type: str
    mtime: datetime


@dataclass
class ManifestDiff:
    """Differences between filesystem and manifest."""
    new_agents: List[AgentFile] = field(default_factory=list)
    removed_agents: List[str] = field(default_factory=list)
    changed_agents: List[Tuple[str, dict]] = field(default_factory=list)
    unchanged_count: int = 0


def get_project_root() -> Path:
    """Get the project root directory."""
    # Try to find root by looking for CLAUDE.md or .ai directory
    current = Path.cwd()
    while current != current.parent:
        if (current / "CLAUDE.md").exists() or (current / ".ai").exists():
            return current
        current = current.parent
    return Path.cwd()


def extract_frontmatter(content: str) -> Dict[str, str]:
    """Parse YAML frontmatter from markdown content."""
    frontmatter = {}

    # Check for YAML frontmatter delimiters
    if not content.startswith("---"):
        return frontmatter

    # Find closing delimiter
    lines = content.split("\n")
    end_idx = -1
    for i, line in enumerate(lines[1:], 1):
        if line.strip() == "---":
            end_idx = i
            break

    if end_idx == -1:
        return frontmatter

    # Parse YAML (simple key: value format)
    for line in lines[1:end_idx]:
        if ":" in line:
            key, value = line.split(":", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and value:
                frontmatter[key] = value

    return frontmatter


def infer_agent_type(path: str) -> str:
    """Infer agent type from directory path."""
    if "/experts/" in path:
        return "expert"
    elif "/personas/" in path:
        return "persona"
    elif "/workflows/" in path:
        return "workflow"
    elif "/core/" in path or "/.claude/agents/" in path:
        return "core"
    return "core"


def suggest_tags(content: str, name: str) -> List[str]:
    """Extract suggested tags from content structure."""
    tags = set()

    # Extract from headers
    headers = re.findall(r'^##?\s+(.+)$', content, re.MULTILINE)
    for header in headers:
        # Convert header to potential tags
        words = header.lower().split()
        for word in words:
            if len(word) > 3 and word not in {"the", "and", "for", "with", "this", "that"}:
                tags.add(word)

    # Extract from bold text (potential key concepts)
    bold_items = re.findall(r'\*\*([^*]+)\*\*', content)
    for item in bold_items[:10]:  # Limit to first 10
        if len(item) < 30:  # Skip long phrases
            tags.add(item.lower())

    # Add name-based tags
    name_parts = re.split(r'[-_\s]', name.lower())
    for part in name_parts:
        if len(part) > 2:
            tags.add(part)

    return sorted(list(tags))[:10]  # Limit to 10 tags


def suggest_routing_keywords(name: str, description: str, content: str) -> List[str]:
    """Suggest keywords that would route to this agent."""
    keywords = set()

    # From name
    name_parts = re.split(r'[-_\s]', name.lower())
    keywords.update(p for p in name_parts if len(p) > 2)

    # From description
    if description:
        desc_words = description.lower().split()
        # Focus on nouns and verbs (simple heuristic: longer words)
        keywords.update(w for w in desc_words if len(w) > 4)

    # Common PM task keywords based on agent type
    if "coach" in name.lower() or "strategy" in content.lower():
        keywords.update(["strategy", "advice", "should", "decision"])
    if "sql" in name.lower() or "query" in content.lower() or "analyze" in name.lower():
        keywords.update(["data", "metrics", "query", "sql", "analytics"])
    if "jira" in name.lower() or "ticket" in content.lower():
        keywords.update(["ticket", "jira", "create", "issue", "bug"])
    if "transcript" in name.lower() or "meeting" in content.lower():
        keywords.update(["meeting", "transcript", "notes", "summary"])

    return sorted(list(keywords))[:15]


def suggest_required_context(tags: List[str], root: Path) -> List[str]:
    """Cross-reference tags with knowledge index to suggest required context."""
    required = []

    # Try to load knowledge index
    knowledge_index_path = root / KNOWLEDGE_INDEX_PATH
    if knowledge_index_path.exists():
        try:
            with open(knowledge_index_path) as f:
                index = json.load(f)
                # Match tags to knowledge files
                for doc in index.get("documents", []):
                    doc_tags = doc.get("tags", [])
                    if any(tag in doc_tags for tag in tags):
                        required.append(doc.get("path", ""))
        except (json.JSONDecodeError, KeyError):
            pass

    # Default required context based on common patterns
    tag_str = " ".join(tags)
    if any(t in tag_str for t in ["data", "metric", "sql", "query"]):
        required.append(".ai/knowledge/redshift-schema.md")
        required.append(".ai/knowledge/business-metrics-and-logic.md")
    if any(t in tag_str for t in ["product", "feature", "design"]):
        required.append(".ai/knowledge/cloaked-product-overview.md")
        required.append(".ai/knowledge/product-principles.md")
    if any(t in tag_str for t in ["jira", "ticket", "atlassian"]):
        required.append(".ai/knowledge/jira-integration.md")

    return sorted(list(set(required)))[:5]


def scan_agent_directories(root: Path) -> List[AgentFile]:
    """Walk agent directories and collect agent files."""
    agents = []

    for dir_path in AGENT_DIRECTORIES:
        full_path = root / dir_path
        if not full_path.exists():
            continue

        for md_file in full_path.rglob("SKILL.md"):
            # Skip files starting with underscore
            if md_file.name.startswith("_"):
                continue

            try:
                content = md_file.read_text()
                frontmatter = extract_frontmatter(content)

                # Get name from frontmatter or filename
                name = frontmatter.get("name", md_file.stem)
                description = frontmatter.get("description", "")

                # Get relative path
                rel_path = str(md_file.relative_to(root))

                agents.append(AgentFile(
                    path=rel_path,
                    name=name,
                    description=description,
                    content=content,
                    agent_type=infer_agent_type(rel_path),
                    mtime=datetime.fromtimestamp(md_file.stat().st_mtime)
                ))
            except Exception as e:
                print(f"Warning: Could not read {md_file}: {e}", file=sys.stderr)

    return agents


def load_manifest(root: Path) -> dict:
    """Load the current manifest."""
    manifest_path = root / MANIFEST_PATH
    if not manifest_path.exists():
        return {"version": "1.0", "agents": []}

    try:
        with open(manifest_path) as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"Warning: Could not load manifest: {e}", file=sys.stderr)
        return {"version": "1.0", "agents": []}


def generate_manifest_entry(agent: AgentFile, root: Path) -> dict:
    """Create a full manifest entry for an agent."""
    tags = suggest_tags(agent.content, agent.name)
    routing_keywords = suggest_routing_keywords(agent.name, agent.description, agent.content)
    required_context = suggest_required_context(tags, root)

    return {
        # Auto-generated fields (60%)
        "path": agent.path,
        "name": agent.name,
        "description": agent.description,
        "agent_type": agent.agent_type,
        "status": "active",
        "version": "1.0",

        # Suggested fields (25%) - marked for review
        "tags": tags,
        "semantic_tags": [],  # Requires human curation
        "routing_keywords": routing_keywords,
        "required_context": required_context,

        # Manual fields (15%) - placeholders
        "input_types": [],
        "output_types": [],
        "failure_modes": [],
        "mcp_tools": [],

        # Metadata
        "_auto_generated": True,
        "_needs_review": True,
        "_last_sync": datetime.now().isoformat()
    }


def diff_with_manifest(agents: List[AgentFile], manifest: dict) -> ManifestDiff:
    """Compare filesystem agents with manifest entries."""
    diff = ManifestDiff()

    # Handle both dict and array formats for manifest agents
    agents_data = manifest.get("agents", {})
    if isinstance(agents_data, dict):
        # Dict format: {"agent-name": {path: ..., description: ...}}
        manifest_by_path = {}
        for name, data in agents_data.items():
            if isinstance(data, dict) and "path" in data:
                manifest_by_path[data["path"]] = {"name": name, **data}
    else:
        # Array format: [{path: ..., name: ...}, ...]
        manifest_by_path = {a["path"]: a for a in agents_data if isinstance(a, dict)}

    fs_paths = {a.path for a in agents}
    manifest_paths = set(manifest_by_path.keys())

    # Find new agents
    for agent in agents:
        if agent.path not in manifest_paths:
            diff.new_agents.append(agent)

    # Find removed agents
    diff.removed_agents = sorted(manifest_paths - fs_paths)

    # Find changed agents (name or description mismatch)
    for agent in agents:
        if agent.path in manifest_by_path:
            existing = manifest_by_path[agent.path]
            if existing.get("name") != agent.name or existing.get("description") != agent.description:
                diff.changed_agents.append((agent.path, {
                    "old_name": existing.get("name"),
                    "new_name": agent.name,
                    "old_desc": existing.get("description"),
                    "new_desc": agent.description
                }))
            else:
                diff.unchanged_count += 1

    return diff


def apply_diff(manifest: dict, diff: ManifestDiff, agents: List[AgentFile], root: Path) -> dict:
    """Apply diff to manifest and return updated manifest."""
    # Build agent lookup
    agent_by_path = {a.path: a for a in agents}

    # Ensure agents is a dict (the current format)
    if not isinstance(manifest.get("agents"), dict):
        manifest["agents"] = {}

    agents_dict = manifest["agents"]

    # Remove deleted agents
    for path in diff.removed_agents:
        # Find and remove by path
        to_remove = None
        for name, data in agents_dict.items():
            if isinstance(data, dict) and data.get("path") == path:
                to_remove = name
                break
        if to_remove:
            del agents_dict[to_remove]

    # Update changed agents
    for path, _ in diff.changed_agents:
        agent = agent_by_path[path]
        for name, data in agents_dict.items():
            if isinstance(data, dict) and data.get("path") == path:
                agents_dict[name]["description"] = agent.description
                agents_dict[name]["_last_sync"] = datetime.now().isoformat()
                break

    # Add new agents
    for agent in diff.new_agents:
        entry = generate_manifest_entry(agent, root)
        # Use agent name as key, remove name from entry since it's the key
        agent_name = entry.pop("name", agent.name)
        agents_dict[agent_name] = entry

    # Update version
    parts = manifest.get("version", "1.0").split(".")
    try:
        patch = int(parts[-1]) + 1
        manifest["version"] = f"{'.'.join(parts[:-1])}.{patch}"
    except (ValueError, IndexError):
        manifest["version"] = "2.4"

    manifest["updated"] = datetime.now().strftime("%Y-%m-%d")

    return manifest


def generate_report(diff: ManifestDiff, agents: List[AgentFile], root: Path) -> str:
    """Generate human-readable report."""
    lines = [
        "# Manifest Sync Report",
        f"Generated: {datetime.now().isoformat()}",
        "",
        "## Summary",
        f"- **New agents:** {len(diff.new_agents)}",
        f"- **Removed agents:** {len(diff.removed_agents)}",
        f"- **Changed agents:** {len(diff.changed_agents)}",
        f"- **Unchanged:** {diff.unchanged_count}",
        ""
    ]

    if diff.new_agents:
        lines.append("## New Agents")
        for agent in diff.new_agents:
            lines.append(f"- `{agent.path}` - {agent.name}")
            if agent.description:
                lines.append(f"  - {agent.description}")
        lines.append("")

    if diff.removed_agents:
        lines.append("## Removed Agents")
        for path in diff.removed_agents:
            lines.append(f"- `{path}`")
        lines.append("")

    if diff.changed_agents:
        lines.append("## Changed Agents")
        for path, changes in diff.changed_agents:
            lines.append(f"- `{path}`")
            if changes.get("old_name") != changes.get("new_name"):
                lines.append(f"  - Name: {changes['old_name']} → {changes['new_name']}")
            if changes.get("old_desc") != changes.get("new_desc"):
                lines.append(f"  - Description updated")
        lines.append("")

    return "\n".join(lines)


def generate_suggestions(diff: ManifestDiff, agents: List[AgentFile], root: Path) -> dict:
    """Generate suggested field values for new agents."""
    suggestions = {}

    for agent in diff.new_agents:
        entry = generate_manifest_entry(agent, root)
        suggestions[agent.path] = {
            "tags": entry["tags"],
            "routing_keywords": entry["routing_keywords"],
            "required_context": entry["required_context"]
        }

    return suggestions


def main(ctx):
    parser = argparse.ArgumentParser(description="Sync agent manifest with filesystem")
    parser.add_argument("--apply", action="store_true", help="Apply changes to manifest")
    parser.add_argument("--json", action="store_true", help="Output JSON for CI")
    args = parser.parse_args()

    root = get_project_root()

    # Scan and diff
    agents = scan_agent_directories(root)
    manifest = load_manifest(root)
    diff = diff_with_manifest(agents, manifest)

    # Check if any changes
    has_changes = bool(diff.new_agents or diff.removed_agents or diff.changed_agents)

    if args.json:
        # JSON output for CI
        output = {
            "has_changes": has_changes,
            "new_count": len(diff.new_agents),
            "removed_count": len(diff.removed_agents),
            "changed_count": len(diff.changed_agents),
            "unchanged_count": diff.unchanged_count,
            "new_agents": [a.path for a in diff.new_agents],
            "removed_agents": diff.removed_agents,
            "changed_agents": [p for p, _ in diff.changed_agents]
        }
        print(json.dumps(output, indent=2))
        if has_changes:
            raise Exception(f"Manifest has {len(diff.new_agents)} new, {len(diff.removed_agents)} removed, {len(diff.changed_agents)} changed agents")
        return

    # Human-readable output
    print(generate_report(diff, agents, root))

    if not has_changes:
        print("Manifest is in sync with filesystem")
        return

    if args.apply:
        # Apply changes
        updated_manifest = apply_diff(manifest, diff, agents, root)

        # Write manifest
        manifest_path = root / MANIFEST_PATH
        with open(manifest_path, "w") as f:
            json.dump(updated_manifest, f, indent=2)
        print(f"Updated {MANIFEST_PATH} (version {updated_manifest['version']})")

        # Write reports
        reports_dir = root / REPORTS_DIR
        reports_dir.mkdir(exist_ok=True)

        # Write suggestions
        suggestions = generate_suggestions(diff, agents, root)
        if suggestions:
            suggestions_path = reports_dir / "manifest-sync-suggestions.json"
            with open(suggestions_path, "w") as f:
                json.dump(suggestions, f, indent=2)
            print(f"Wrote suggestions to {suggestions_path}")

        # Write report
        report_path = reports_dir / "manifest-sync-report.md"
        with open(report_path, "w") as f:
            f.write(generate_report(diff, agents, root))
        print(f"Wrote report to {report_path}")
    else:
        print("\nRun with --apply to update manifest")


if __name__ == "__main__":
    script_run(name='manifest-sync', mode='operational', main=main, services=[])
