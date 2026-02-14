#!/usr/bin/env python3
"""
PR Diagram Generator - Generate Mermaid system diagrams for PR comments.

Analyzes the PM AI system structure and generates visual diagrams showing:
1. Agent Architecture - How agents are organized and relate
2. Routing Flow - How tasks get routed to agents
3. Tool Dependencies - What tools/integrations each agent uses
4. Knowledge Graph - What knowledge files agents depend on

Usage:
    python pr-diagram-generator.py [--changed-files FILE_LIST]
    python pr-diagram-generator.py --all
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, List, Optional, Set


def load_manifest() -> dict:
    """Load the agent manifest."""
    manifest_path = Path(__file__).parent.parent / "config" / "agent-manifest.json"
    with open(manifest_path) as f:
        return json.load(f)


def get_agent_category(path: str) -> str:
    """Determine agent category from path."""
    if "core/" in path:
        return "core"
    elif "experts/" in path:
        return "expert"
    elif "personas/" in path:
        return "persona"
    elif "workflows/" in path:
        return "workflow"
    elif "specialized/" in path:
        return "specialized"
    elif "utilities/" in path:
        return "utility"
    elif ".claude/agents/" in path:
        return "router"
    return "other"


def generate_agent_architecture_diagram(manifest: dict) -> str:
    """Generate a diagram showing agent organization."""
    agents = manifest.get("agents", {})

    # Group agents by category
    categories: Dict[str, List[str]] = {
        "core": [],
        "expert": [],
        "persona": [],
        "workflow": [],
        "specialized": [],
        "utility": [],
        "router": [],
    }

    for name, data in agents.items():
        path = data.get("path", "")
        category = get_agent_category(path)
        if category in categories:
            categories[category].append(name)

    lines = [
        "```mermaid",
        "flowchart TB",
        "    subgraph Router[\"🎯 Router\"]",
    ]

    for agent in categories["router"]:
        lines.append(f"        {agent.replace('-', '_')}[\"{agent}\"]")

    lines.append("    end")
    lines.append("")
    lines.append("    subgraph Core[\"⚙️ Core Agents\"]")

    for agent in categories["core"][:8]:  # Limit to prevent overwhelming diagram
        lines.append(f"        {agent.replace('-', '_')}[\"{agent}\"]")
    if len(categories["core"]) > 8:
        lines.append(f"        core_more[\"... +{len(categories['core']) - 8} more\"]")

    lines.append("    end")
    lines.append("")
    lines.append("    subgraph Experts[\"🧠 Expert Personas\"]")

    for agent in categories["expert"][:6]:
        lines.append(f"        {agent.replace('-', '_')}[\"{agent}\"]")
    if len(categories["expert"]) > 6:
        lines.append(f"        expert_more[\"... +{len(categories['expert']) - 6} more\"]")

    lines.append("    end")
    lines.append("")
    lines.append("    subgraph Specialized[\"🔧 Specialized\"]")

    for agent in categories["specialized"][:4]:
        lines.append(f"        {agent.replace('-', '_')}[\"{agent}\"]")
    if len(categories["specialized"]) > 4:
        lines.append(f"        spec_more[\"... +{len(categories['specialized']) - 4} more\"]")

    lines.append("    end")
    lines.append("")

    # Add connections from router to categories
    if categories["router"]:
        router = categories["router"][0].replace('-', '_')
        lines.append(f"    {router} --> Core")
        lines.append(f"    {router} --> Experts")
        lines.append(f"    {router} --> Specialized")

    lines.append("```")
    return "\n".join(lines)


def generate_routing_flow_diagram(manifest: dict) -> str:
    """Generate a diagram showing task routing flow."""
    lines = [
        "```mermaid",
        "flowchart LR",
        "    User([\"👤 User Task\"]) --> SlashCmd{{\"/pm-ai\"}}",
        "    SlashCmd --> Router[\"pm-router\"]",
        "    ",
        "    Router --> |\"product/strategy\"| ProductCoach[\"product-coach\"]",
        "    Router --> |\"data/sql\"| SQLBuilder[\"sql-query-builder\"]",
        "    Router --> |\"jira/tickets\"| JiraWriter[\"jira-ticket-writer\"]",
        "    Router --> |\"docs/confluence\"| ConfManager[\"confluence-manager\"]",
        "    Router --> |\"daily ops\"| DailyCoS[\"daily-chief-of-staff\"]",
        "    Router --> |\"expert panel\"| ExpertPanel[\"expert-panel\"]",
        "    ",
        "    ProductCoach --> Output([\"📄 Output\"])",
        "    SQLBuilder --> Output",
        "    JiraWriter --> Output",
        "    ConfManager --> Output",
        "    DailyCoS --> Output",
        "    ExpertPanel --> Output",
        "```",
    ]
    return "\n".join(lines)


def generate_integration_diagram(manifest: dict) -> str:
    """Generate a diagram showing external integrations."""
    mcp = manifest.get("mcp_integrations", {})

    lines = [
        "```mermaid",
        "flowchart TB",
        "    subgraph PMSystem[\"PM AI System\"]",
        "        Agents[\"Agents\"]",
        "        Scripts[\"CLI Scripts\"]",
        "    end",
        "",
        "    subgraph External[\"External Services\"]",
    ]

    for service, data in mcp.items():
        status = data.get("status", "unknown")
        icon = "✅" if status == "active" else "⚠️"
        lines.append(f"        {service.replace('-', '_')}[\"{icon} {service}\"]")

    lines.append("    end")
    lines.append("")
    lines.append("    Agents --> Scripts")
    lines.append("    Scripts --> External")
    lines.append("```")

    return "\n".join(lines)


def generate_knowledge_graph(manifest: dict, changed_files: Optional[List[str]] = None) -> str:
    """Generate a diagram showing knowledge dependencies."""
    agents = manifest.get("agents", {})
    knowledge = manifest.get("knowledge", {})

    # Build knowledge -> agents mapping
    knowledge_usage: Dict[str, List[str]] = {}

    for agent_name, agent_data in agents.items():
        required = agent_data.get("required_context", [])
        for ctx in required:
            ctx_key = ctx.replace(".md", "").replace("/", "_")
            if ctx_key not in knowledge_usage:
                knowledge_usage[ctx_key] = []
            knowledge_usage[ctx_key].append(agent_name)

    lines = [
        "```mermaid",
        "flowchart LR",
        "    subgraph Knowledge[\"📚 Knowledge Base\"]",
    ]

    # Show top knowledge files by usage
    sorted_knowledge = sorted(knowledge_usage.items(), key=lambda x: len(x[1]), reverse=True)[:6]

    for ctx, agents_list in sorted_knowledge:
        display_name = ctx.replace("_", "-")[:20]
        lines.append(f"        {ctx}[\"{display_name}\"]")

    lines.append("    end")
    lines.append("")
    lines.append("    subgraph Consumers[\"🤖 Agents\"]")

    # Show agents that use knowledge
    shown_agents: Set[str] = set()
    for _, agents_list in sorted_knowledge:
        for agent in agents_list[:2]:  # Limit agents per knowledge
            if agent not in shown_agents:
                shown_agents.add(agent)
                lines.append(f"        {agent.replace('-', '_')}[\"{agent}\"]")

    lines.append("    end")
    lines.append("")

    # Add connections
    for ctx, agents_list in sorted_knowledge:
        for agent in agents_list[:2]:
            if agent in shown_agents:
                lines.append(f"    {ctx} --> {agent.replace('-', '_')}")

    lines.append("```")
    return "\n".join(lines)


def generate_changed_files_diagram(changed_files: List[str]) -> str:
    """Generate a diagram highlighting changed files."""
    if not changed_files:
        return ""

    # Categorize changes
    categories = {
        "agents": [],
        "knowledge": [],
        "scripts": [],
        "config": [],
        "other": [],
    }

    for f in changed_files:
        if ("skills/" in f and "SKILL.md" in f) or ".claude/agents/" in f:
            categories["agents"].append(Path(f).name)
        elif ".ai/knowledge/" in f:
            categories["knowledge"].append(Path(f).name)
        elif ".ai/scripts/" in f:
            categories["scripts"].append(Path(f).name)
        elif ".ai/config/" in f or "CLAUDE.md" in f:
            categories["config"].append(Path(f).name)
        elif ".ai/" in f:
            categories["other"].append(Path(f).name)

    # Only show if there are relevant changes
    total = sum(len(v) for v in categories.values())
    if total == 0:
        return ""

    lines = [
        "```mermaid",
        "flowchart TB",
        "    subgraph Changes[\"📝 Changed in this PR\"]",
    ]

    idx = 0
    for cat, files in categories.items():
        if files:
            lines.append(f"        subgraph {cat.title()}[\"{cat.title()}\"]")
            for f in files[:5]:
                safe_name = f"change_{idx}"
                idx += 1
                lines.append(f"            {safe_name}[\"{f[:25]}\"]")
            if len(files) > 5:
                lines.append(f"            more_{cat}[\"... +{len(files) - 5} more\"]")
            lines.append("        end")

    lines.append("    end")
    lines.append("```")

    return "\n".join(lines)


def detect_feature_changes(changed_files: List[str]) -> Dict[str, List[str]]:
    """Detect what features/components are being changed in this PR."""
    features = {}

    for f in changed_files:
        # Menu Bar App
        if "MenuBarApp/" in f:
            features.setdefault("menu_bar_app", []).append(f)

        # Analytics Database
        if "analytics-db/" in f or "chat-analytics" in f:
            features.setdefault("analytics_db", []).append(f)

        # Cursor Integration
        if "cursor-parser" in f or "cursor" in f.lower():
            features.setdefault("cursor_integration", []).append(f)

        # Analytics Web UI
        if "prototype/" in f and "analytics" in f.lower():
            features.setdefault("analytics_web", []).append(f)

    return features


def generate_feature_diagrams(changed_files: List[str]) -> str:
    """Generate diagrams specific to the features being changed in this PR."""
    features = detect_feature_changes(changed_files)

    if not features:
        return ""

    sections = []

    # Menu Bar App Architecture
    if "menu_bar_app" in features:
        sections.append("### 📱 New Feature: Menu Bar App Architecture")
        sections.append("```mermaid")
        sections.append("flowchart TB")
        sections.append("    subgraph Sources[\"📊 Data Sources\"]")
        sections.append("        cursor_db[(\"Cursor DB<br/>~/Library/Application Support/Cursor\")]")
        sections.append("        claude_logs[(\"Claude Code Logs<br/>~/.claude/logs\")]")
        sections.append("    end")
        sections.append("")
        sections.append("    subgraph Sync[\"🔄 Data Collection\"]")
        sections.append("        sync_script[\"Sync Script<br/>.ai/tools/lib/analytics-db/sync.js\"]")
        sections.append("        cursor_parser[\"Cursor Parser<br/>cursor-parser.js\"]")
        sections.append("        claude_parser[\"Claude Parser<br/>claude.js\"]")
        sections.append("    end")
        sections.append("")
        sections.append("    subgraph Storage[\"💾 Unified Database\"]")
        sections.append("        sqlite[(\"SQLite Database<br/>~/.pm-ai/analytics.db\")]")
        sections.append("        schema[\"Schema<br/>sessions, daily_stats\"]")
        sections.append("    end")
        sections.append("")
        sections.append("    subgraph MenuBar[\"🖥️ Menu Bar App (Swift)\"]")
        sections.append("        app[\"PMMenuBar.app\"]")
        sections.append("        status_item[\"NSStatusItem<br/>'PM' icon in menu bar\"]")
        sections.append("        popover[\"NSPopover<br/>Analytics Dashboard\"]")
        sections.append("        services[\"Services<br/>AnalyticsDB, Git, Launcher\"]")
        sections.append("    end")
        sections.append("")
        sections.append("    cursor_db --> cursor_parser")
        sections.append("    claude_logs --> claude_parser")
        sections.append("    cursor_parser --> sync_script")
        sections.append("    claude_parser --> sync_script")
        sections.append("    sync_script --> sqlite")
        sections.append("    sqlite --> schema")
        sections.append("    schema -.\"SQL queries\".-> services")
        sections.append("    services --> app")
        sections.append("    app --> status_item")
        sections.append("    status_item -.\"click\".-> popover")
        sections.append("```")
        sections.append("")
        sections.append("**User Flow:**")
        sections.append("1. Cursor/Claude Code sessions are automatically tracked")
        sections.append("2. Sync script parses and stores data in SQLite (~/.pm-ai/analytics.db)")
        sections.append("3. Menu bar app reads from SQLite and displays real-time analytics")
        sections.append("4. User clicks PM icon → Popover shows usage stats, git status, quick actions")
        sections.append("")

    # Analytics Database
    if "analytics_db" in features and "menu_bar_app" not in features:
        sections.append("### 📊 Analytics Database Architecture")
        sections.append("```mermaid")
        sections.append("flowchart LR")
        sections.append("    Cursor[(\"Cursor DB\")] --> Parser[\"Parser\"]")
        sections.append("    Claude[(\"Claude Logs\")] --> Parser")
        sections.append("    Parser --> SQLite[(\"~/.pm-ai/analytics.db\")]")
        sections.append("    SQLite --> Web[\"Analytics Web UI\"]")
        sections.append("    SQLite --> API[\"API/Queries\"]")
        sections.append("```")
        sections.append("")

    return "\n".join(sections)


def generate_all_diagrams(manifest: dict, changed_files: Optional[List[str]] = None) -> str:
    """Generate all system diagrams."""
    sections = []

    sections.append("## 🗺️ PM AI System Diagrams")
    sections.append("")

    # Changed files diagram (if applicable)
    if changed_files:
        changes_diagram = generate_changed_files_diagram(changed_files)
        if changes_diagram:
            sections.append("### Files Changed in This PR")
            sections.append(changes_diagram)
            sections.append("")

        # Feature-specific diagrams
        feature_diagrams = generate_feature_diagrams(changed_files)
        if feature_diagrams:
            sections.append(feature_diagrams)

    # Agent architecture
    sections.append("### Agent Architecture")
    sections.append(generate_agent_architecture_diagram(manifest))
    sections.append("")

    # Routing flow
    sections.append("### Task Routing Flow")
    sections.append(generate_routing_flow_diagram(manifest))
    sections.append("")

    # Integrations
    sections.append("### External Integrations")
    sections.append(generate_integration_diagram(manifest))
    sections.append("")

    # Knowledge graph
    sections.append("### Knowledge Dependencies")
    sections.append(generate_knowledge_graph(manifest, changed_files))
    sections.append("")

    sections.append("---")
    sections.append("_Diagrams auto-generated by PR Diagram Generator_")

    return "\n".join(sections)


def main():
    parser = argparse.ArgumentParser(description="Generate Mermaid diagrams for PR comments")
    parser.add_argument("--changed-files", type=str, help="Comma-separated list of changed files")
    parser.add_argument("--changed-files-file", type=str, help="File containing list of changed files")
    parser.add_argument("--all", action="store_true", help="Generate all diagrams regardless of changes")
    parser.add_argument("--output", type=str, help="Output file path (default: stdout)")
    args = parser.parse_args()

    # Load manifest
    try:
        manifest = load_manifest()
    except Exception as e:
        raise RuntimeError(f"Error loading manifest: {e}")

    # Get changed files
    changed_files = None
    if args.changed_files:
        changed_files = [f.strip() for f in args.changed_files.split(",") if f.strip()]
    elif args.changed_files_file:
        try:
            with open(args.changed_files_file) as f:
                changed_files = [line.strip() for line in f if line.strip()]
        except Exception as e:
            print(f"Warning: Could not read changed files: {e}", file=sys.stderr)

    # Generate diagrams
    output = generate_all_diagrams(manifest, changed_files)

    # Write output
    if args.output:
        with open(args.output, "w") as f:
            f.write(output)
    else:
        print(output)


if __name__ == "__main__":
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
    try:
        from script_runner import run as script_run
        script_run(name='pr-diagram-generator', mode='operational', main=lambda ctx: main())
    except ImportError:
        main()
