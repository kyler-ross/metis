#!/usr/bin/env python3
"""
Cloaked PM Self-Improvement Engine - Enhanced Version

SYSTEM OF SYSTEMS ARCHITECTURE:
This engine operates as part of a larger feedback loop that:
1. Detects knowledge gaps through hooks and user input
2. Analyzes gaps using manifest-aware categorization
3. Discovers relevant knowledge and agents
4. Proposes improvements that maintain system coherence
5. Tracks improvements for continuous learning

The engine understands:
- Agent roles and their knowledge requirements (from manifest)
- Knowledge structure and semantic relationships (from knowledge-index)
- System relationships and dependencies
- Impact analysis (what breaks if we don't fix this?)

This ensures improvements enhance the entire system, not just isolated parts.
"""

import json
import os
import sys
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any


class ManifestAwareKnowledgeSystem:
    """Manages knowledge understanding using the agent manifest and knowledge index"""
    
    def __init__(self, ai_dir: Path):
        self.ai_dir = ai_dir
        self.manifest = self._load_json(ai_dir / "config" / "agent-manifest.json")
        self.knowledge_index = self._load_json(ai_dir / "config" / "knowledge-index.json")
        self.dispatch_config = self._load_json(ai_dir / "config" / "intelligent-dispatch-hooks.json")
        
    def _load_json(self, path: Path) -> dict:
        """Safely load JSON file"""
        if not path.exists():
            return {}
        try:
            with open(path) as f:
                return json.load(f)
        except:
            return {}
    
    def find_agents_by_knowledge(self, doc_name: str) -> List[str]:
        """Find which agents use a specific knowledge doc"""
        agents = []
        for agent_name, agent_data in self.manifest.get("agents", {}).items():
            if doc_name in agent_data.get("required_context", []):
                agents.append(agent_name)
        return agents
    
    def find_knowledge_by_tag(self, tag: str) -> List[str]:
        """Find knowledge docs by semantic tag"""
        matching = []
        for doc, tags in self.knowledge_index.get("tag_to_documents", {}).items():
            if tag.lower() in [t.lower() for t in tags]:
                matching.append(doc)
        return matching
    
    def get_agent_description(self, agent_name: str) -> str:
        """Get agent description from manifest"""
        agent = self.manifest.get("agents", {}).get(agent_name, {})
        return agent.get("description", "Unknown agent")


class KnowledgeGapAnalyzer:
    """Analyzes knowledge gaps using semantic understanding"""
    
    # More sophisticated gap patterns with semantic meaning
    GAP_PATTERNS = {
        "database": {
            "keywords": ["database", "query", "schema", "table", "sql", "redshift", "analytics", "metric"],
            "agents": ["sql-query-builder", "data-analyst"],
            "knowledge_tags": ["data", "sql", "metrics"],
            "target_docs": ["redshift-schema.md", "business-metrics-and-logic.md", "query-examples.md"],
            "severity": "high"
        },
        "api_integration": {
            "keywords": ["api", "endpoint", "auth", "token", "request", "response", "integration"],
            "agents": ["pm-router", "self-improvement"],
            "knowledge_tags": ["api", "integration"],
            "target_docs": ["api-integration-patterns.md"],
            "severity": "high"
        },
        "product_strategy": {
            "keywords": ["feature", "product", "strategy", "design", "user", "validation", "metrics"],
            "agents": ["product-coach", "pm-router"],
            "knowledge_tags": ["product", "strategy", "features"],
            "target_docs": ["cloaked-product-overview.md", "product-principles.md"],
            "severity": "high"
        },
        "workflow_process": {
            "keywords": ["workflow", "process", "procedure", "step", "how to", "sequence"],
            "agents": ["daily-chief-of-staff", "self-improvement"],
            "knowledge_tags": ["workflow"],
            "target_docs": ["pm-workflow-context.md"],
            "severity": "medium"
        },
        "configuration": {
            "keywords": ["config", "env", "setting", "setup", "initialize", "environment"],
            "agents": ["self-improvement"],
            "knowledge_tags": ["architecture"],
            "target_docs": ["architecture-decisions.md"],
            "severity": "medium"
        },
        "tool_usage": {
            "keywords": ["tool", "command", "option", "flag", "argument", "cli", "feature"],
            "agents": ["pm-router"],
            "knowledge_tags": ["tools", "workflow"],
            "target_docs": ["pm-workflow-context.md"],
            "severity": "low"
        }
    }
    
    def __init__(self, knowledge_system: ManifestAwareKnowledgeSystem):
        self.knowledge_system = knowledge_system
    
    def analyze_gap(self, trigger_type: str, content: str, tool_name: Optional[str] = None) -> Dict[str, Any]:
        """Analyze a knowledge gap with full context"""
        analysis = {
            "trigger_type": trigger_type,
            "tool": tool_name,
            "timestamp": datetime.now().isoformat(),
            "content_summary": content[:300],
            "detected_categories": [],
            "severity": "medium",
            "affected_agents": set(),
            "recommended_docs": [],
            "system_impact": None
        }
        
        content_lower = content.lower()
        
        # Detect categories based on pattern matching
        for category, pattern_info in self.GAP_PATTERNS.items():
            if any(kw in content_lower for kw in pattern_info["keywords"]):
                analysis["detected_categories"].append(category)
                analysis["affected_agents"].update(pattern_info["agents"])
                analysis["recommended_docs"].extend(pattern_info["target_docs"])
                if pattern_info["severity"] == "high":
                    analysis["severity"] = "high"
        
        # Deduplicate and analyze system impact
        analysis["affected_agents"] = list(analysis["affected_agents"])
        analysis["recommended_docs"] = list(set(analysis["recommended_docs"]))
        
        # Assess system impact
        analysis["system_impact"] = self._assess_impact(
            analysis["detected_categories"],
            analysis["affected_agents"]
        )
        
        return analysis
    
    def _assess_impact(self, categories: List[str], agents: List[str]) -> str:
        """Assess how this gap impacts the overall system"""
        if not categories:
            return "No immediate system impact"
        
        # Map impact based on what's affected
        critical_agents = ["pm-router", "sql-query-builder", "product-coach"]
        core_categories = ["database", "product_strategy"]
        
        if any(agent in agents for agent in critical_agents):
            if any(cat in categories for cat in core_categories):
                return "CRITICAL: Affects core agents and critical system functions"
            return f"HIGH: Affects critical agents ({', '.join([a for a in agents if a in critical_agents])})"
        
        return f"MEDIUM: Affects {len(agents)} agents ({', '.join(agents[:2])}...)"


class ImprovementProposalGenerator:
    """Generates intelligent improvement proposals that maintain system coherence"""
    
    def __init__(self, knowledge_system: ManifestAwareKnowledgeSystem, analyzer: KnowledgeGapAnalyzer):
        self.knowledge_system = knowledge_system
        self.analyzer = analyzer
    
    def generate(self, gap_analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Generate a complete improvement proposal"""
        proposal = {
            "id": datetime.now().strftime("%Y%m%d-%H%M%S"),
            "timestamp": gap_analysis["timestamp"],
            "gap_analysis": gap_analysis,
            "improvements": [],
            "reasoning": [],
            "prerequisites": [],
            "success_criteria": [],
            "rollback_plan": None
        }
        
        # Generate category-specific improvements
        for category in gap_analysis["detected_categories"]:
            improvements = self._generate_category_improvements(category, gap_analysis)
            proposal["improvements"].extend(improvements)
        
        # Ensure target files exist
        proposal["improvements"] = self._validate_targets(proposal["improvements"])
        
        # Add coherence analysis
        proposal["system_coherence"] = self._check_coherence(proposal["improvements"])
        
        # Add reasoning for each improvement
        proposal["reasoning"] = self._generate_reasoning(proposal["improvements"], gap_analysis)
        
        return proposal
    
    def _generate_category_improvements(self, category: str, gap_analysis: Dict) -> List[Dict]:
        """Generate improvements for a specific gap category"""
        improvements = []
        pattern_info = self.analyzer.GAP_PATTERNS.get(category, {})
        
        # Primary: Update/create knowledge doc
        for doc in pattern_info.get("target_docs", []):
            improvements.append({
                "type": "knowledge_update",
                "target": f".ai/knowledge/{doc}",
                "action": f"Add or clarify content related to {category}",
                "priority": pattern_info.get("severity", "medium"),
                "affected_agents": pattern_info.get("agents", [])
            })
        
        # Secondary: Update agent instructions if gap indicates agent confusion
        if len(gap_analysis["affected_agents"]) <= 2 and gap_analysis["affected_agents"]:
            agent = gap_analysis["affected_agents"][0]
            improvements.append({
                "type": "agent_update",
                "target": f"skills/core/{agent}/SKILL.md",
                "action": f"Clarify {category} instructions for {agent}",
                "priority": "medium",
                "affected_agents": [agent]
            })
        
        # Tertiary: Update manifest if context is missing
        if gap_analysis["affected_agents"]:
            improvements.append({
                "type": "manifest_update",
                "target": ".ai/config/agent-manifest.json",
                "action": f"Verify agents have required {category} knowledge",
                "priority": "low",
                "affected_agents": gap_analysis["affected_agents"]
            })
        
        return improvements
    
    def _validate_targets(self, improvements: List[Dict]) -> List[Dict]:
        """Ensure all target files exist before proposing"""
        valid = []
        kb_dir = self.knowledge_system.ai_dir / "knowledge"
        agents_dir = self.knowledge_system.ai_dir / "agents"
        
        for improvement in improvements:
            target = improvement["target"]
            
            # Check if target file exists or can be created
            if target.startswith(".ai/knowledge/"):
                path = self.knowledge_system.ai_dir.parent / target
                if path.exists() or path.parent.exists():
                    valid.append(improvement)
            elif target.startswith("skills/"):
                path = self.knowledge_system.ai_dir.parent / target
                if path.exists():
                    valid.append(improvement)
            elif target.startswith(".ai/config/"):
                path = self.knowledge_system.ai_dir.parent / target
                if path.exists():
                    valid.append(improvement)
        
        return valid
    
    def _check_coherence(self, improvements: List[Dict]) -> Dict[str, Any]:
        """Check that improvements maintain system coherence"""
        return {
            "is_coherent": True,
            "conflicts": [],
            "dependencies": self._find_dependencies(improvements),
            "integration_points": self._find_integration_points(improvements)
        }
    
    def _find_dependencies(self, improvements: List[Dict]) -> List[str]:
        """Find dependencies between improvements"""
        # If updating knowledge, might need to update manifest
        deps = []
        has_knowledge_update = any(i["type"] == "knowledge_update" for i in improvements)
        has_manifest_update = any(i["type"] == "manifest_update" for i in improvements)
        
        if has_knowledge_update and not has_manifest_update:
            deps.append("Consider updating manifest if adding new knowledge")
        
        return deps
    
    def _find_integration_points(self, improvements: List[Dict]) -> List[str]:
        """Find where improvements integrate with existing system"""
        agents_affected = set()
        for improvement in improvements:
            agents_affected.update(improvement.get("affected_agents", []))
        
        return [f"Verify {agent} uses updated knowledge" for agent in agents_affected]
    
    def _generate_reasoning(self, improvements: List[Dict], gap_analysis: Dict) -> List[str]:
        """Generate clear reasoning for each improvement"""
        reasoning = [
            f"System Impact: {gap_analysis['system_impact']}",
            f"Affected Agents: {', '.join(gap_analysis['affected_agents']) or 'None identified'}",
            f"Gap Categories: {', '.join(gap_analysis['detected_categories']) or 'Generic'}",
        ]
        
        if gap_analysis["affected_agents"]:
            for agent in gap_analysis["affected_agents"]:
                desc = self.knowledge_system.get_agent_description(agent)
                reasoning.append(f"{agent}: {desc}")
        
        return reasoning


class SelfImprovementEngine:
    """Main orchestrator for self-improvement loop"""
    
    def __init__(self):
        self.repo_root = Path(__file__).parent.parent.parent
        self.ai_dir = self.repo_root / ".ai"
        self.claude_dir = self.repo_root / ".claude"
        self.log_file = self.claude_dir / "self-improvement-log.md"
        
        # Create subdirectories
        self.claude_dir.mkdir(exist_ok=True)
        (self.claude_dir / "pending-improvements").mkdir(exist_ok=True)
        
        # Initialize knowledge systems
        self.knowledge_system = ManifestAwareKnowledgeSystem(self.ai_dir)
        self.analyzer = KnowledgeGapAnalyzer(self.knowledge_system)
        self.generator = ImprovementProposalGenerator(self.knowledge_system, self.analyzer)
    
    def process_request(self, trigger_type: str, content: str, tool_name: Optional[str] = None):
        """Process a self-improvement request end-to-end"""
        print(f"\n{'='*80}")
        print("🔍 SELF-IMPROVEMENT ENGINE ACTIVATED")
        print(f"{'='*80}")
        
        # Step 1: Analyze the gap
        print(f"\n📊 Step 1: Analyzing gap...")
        gap_analysis = self.analyzer.analyze_gap(trigger_type, content, tool_name)
        
        if not gap_analysis["detected_categories"]:
            print("ℹ️  No knowledge gaps detected. Suggestions for improvement:")
            print(f"   • Content: {content[:100]}...")
            return
        
        print(f"   ✓ Detected categories: {', '.join(gap_analysis['detected_categories'])}")
        print(f"   ✓ System impact: {gap_analysis['system_impact']}")
        print(f"   ✓ Affected agents: {', '.join(gap_analysis['affected_agents']) or 'None'}")
        
        # Step 2: Generate proposal
        print(f"\n💡 Step 2: Generating proposal...")
        proposal = self.generator.generate(gap_analysis)
        
        print(f"   ✓ Generated {len(proposal['improvements'])} improvements")
        if proposal['system_coherence']['dependencies']:
            print(f"   ✓ Dependencies identified: {len(proposal['system_coherence']['dependencies'])}")
        
        # Step 3: Display proposal
        print(f"\n📋 Step 3: Proposal Details")
        self._display_proposal(proposal)
        
        # Step 4: Log and save
        print(f"\n💾 Step 4: Logging and saving...")
        self._log_proposal(proposal)
        self._save_proposal_json(proposal)
        
        print(f"\n✅ Self-improvement request processed!")
        print(f"   Proposal ID: {proposal['id']}")
        print(f"   Location: .claude/pending-improvements/{proposal['id']}.json")
        print(f"   Log: .claude/self-improvement-log.md")
        print(f"\n{'='*80}\n")
    
    def _display_proposal(self, proposal: Dict):
        """Display proposal in user-friendly format"""
        gap = proposal["gap_analysis"]
        
        print(f"\n📌 Gap Summary:")
        print(f"   Type: {gap['trigger_type']}")
        if gap['tool']:
            print(f"   Tool: {gap['tool']}")
        print(f"   Categories: {', '.join(gap['detected_categories']) or 'Generic'}")
        print(f"   Severity: {gap['severity']}")
        
        print(f"\n🎯 Proposed Improvements:")
        for i, imp in enumerate(proposal['improvements'], 1):
            print(f"\n   {i}. {imp['action']}")
            print(f"      Target: {imp['target']}")
            print(f"      Type: {imp['type']}")
            print(f"      Priority: {imp['priority']}")
            if imp.get('affected_agents'):
                print(f"      Affects: {', '.join(imp['affected_agents'])}")
        
        if proposal['reasoning']:
            print(f"\n💭 Reasoning:")
            for reason in proposal['reasoning'][:3]:
                print(f"   • {reason}")
        
        if proposal['system_coherence']['dependencies']:
            print(f"\n🔗 Dependencies:")
            for dep in proposal['system_coherence']['dependencies']:
                print(f"   • {dep}")
    
    def _log_proposal(self, proposal: Dict):
        """Log proposal to markdown log file"""
        if not self.log_file.exists():
            with open(self.log_file, "w") as f:
                f.write("# Self-Improvement Log\n\n")
        
        with open(self.log_file, "a") as f:
            f.write(f"## Proposal {proposal['id']}\n")
            f.write(f"**Time**: {proposal['timestamp']}\n")
            f.write(f"**Status**: Pending\n\n")
            
            gap = proposal['gap_analysis']
            f.write(f"**Gap Type**: {gap['trigger_type']}\n")
            f.write(f"**Categories**: {', '.join(gap['detected_categories']) or 'None'}\n")
            f.write(f"**System Impact**: {gap['system_impact']}\n\n")
            
            f.write("### Proposed Improvements\n")
            for imp in proposal['improvements']:
                f.write(f"- {imp['action']}\n")
                f.write(f"  - Target: `{imp['target']}`\n")
                f.write(f"  - Priority: {imp['priority']}\n")
            
            f.write("\n---\n\n")
    
    def _save_proposal_json(self, proposal: Dict):
        """Save proposal as JSON for processing"""
        path = self.claude_dir / "pending-improvements" / f"{proposal['id']}.json"
        with open(path, "w") as f:
            json.dump(proposal, f, indent=2, default=str)


def main(ctx=None):
    args = ctx.args if ctx else sys.argv[1:]
    if len(args) < 2:
        raise RuntimeError(
            "Usage: self-improvement-engine.py <trigger_type> <content> [--tool TOOL]\n"
            "Trigger types: user_request, tool_failure"
        )

    trigger_type = args[0]
    content = args[1]
    tool_name = None

    # Parse optional arguments
    i = 2
    while i < len(args):
        if args[i] == "--tool" and i + 1 < len(args):
            tool_name = args[i + 1]
            i += 2
        else:
            i += 1

    engine = SelfImprovementEngine()
    engine.process_request(trigger_type, content, tool_name)


if __name__ == "__main__":
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
    try:
        from script_runner import run as script_run
        script_run(name='self-improvement-engine', mode='operational', main=main)
    except ImportError:
        main()
