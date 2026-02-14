#!/usr/bin/env python3
"""
PM Metrics Helper - Query PostHog metrics and generate insights

This script helps PMs:
- Query key metrics (retention, activation, churn, etc.)
- Generate trend analysis
- Compare periods
- Export data for roadmap decisions

Requires: PostHog MCP configured with auth token

Usage:
  python3 .ai/scripts/pm-metrics-helper.py get-metric <metric-name> <days>
  python3 .ai/scripts/pm-metrics-helper.py retention <days>
  python3 .ai/scripts/pm-metrics-helper.py activation
  python3 .ai/scripts/pm-metrics-helper.py compare <metric> <period1> <period2>
"""

import json
import os
import sys
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
from script_runner import run as script_run


class PMMetricsHelper:
    def __init__(self):
        self.repo_root = Path(__file__).parent.parent.parent
        self.log_file = self.repo_root / ".claude" / "pm-metrics-queries.log"
        self.log_file.parent.mkdir(exist_ok=True)

        # Key metrics definitions for Cloaked
        self.metrics_definitions = {
            "retention_d1": "D1 retention (users active next day)",
            "retention_d7": "D7 retention (users active in next 7 days)",
            "retention_d30": "D30 retention (users active in next 30 days)",
            "activation": "% of users who completed identity creation",
            "churn": "% of users inactive for 30 days",
            "identity_creation_rate": "New identities created per user",
            "nps": "Net Promoter Score",
            "feature_adoption": "% of users using specific feature",
            "signup_conversion": "% of signups that complete onboarding"
        }

    def log_query(self, query_type: str, params: dict, result: Optional[dict] = None):
        """Log metrics queries for audit trail"""
        entry = {
            "timestamp": datetime.now().isoformat(),
            "query_type": query_type,
            "params": params,
            "result_summary": str(result)[:200] if result else None
        }
        with open(self.log_file, "a") as f:
            f.write(json.dumps(entry) + "\n")

    def get_metric(self, metric_name: str, days: int = 30) -> Optional[Dict[str, Any]]:
        """
        Query a metric from PostHog

        This is a helper that would normally call PostHog API directly
        or through the MCP interface.
        """
        print(f"\n📊 Querying {metric_name} for last {days} days...")

        if metric_name not in self.metrics_definitions:
            print(f"❌ Unknown metric: {metric_name}")
            print(f"   Available: {', '.join(self.metrics_definitions.keys())}")
            return None

        # This would normally use PostHog MCP to get real data
        # For now, print the query that needs to be executed
        print(f"\n   Metric: {self.metrics_definitions[metric_name]}")
        print(f"   Period: Last {days} days")
        print(f"\n   In Claude Code, you can ask:")
        print(f"   'Use PostHog to get {metric_name} for the last {days} days'")
        print(f"   or pull data directly if you have PostHog dashboard access")

        self.log_query("get_metric", {"metric": metric_name, "days": days})
        return None

    def get_retention(self, days: int = 30) -> Dict[str, str]:
        """Get retention metrics (D1, D7, D30)"""
        print(f"\n📈 Retention Analysis (last {days} days)")
        print("   " + "=" * 50)

        metrics = ["retention_d1", "retention_d7", "retention_d30"]
        results = {}

        for metric in metrics:
            definition = self.metrics_definitions[metric]
            print(f"\n   {definition}")
            print(f"      → Ask in Claude Code: '{definition}'")
            results[metric] = definition

        self.log_query("get_retention", {"days": days})
        return results

    def get_activation(self) -> Dict[str, str]:
        """Get activation metrics"""
        print(f"\n🚀 Activation Analysis")
        print("   " + "=" * 50)

        metrics = ["activation", "identity_creation_rate", "signup_conversion"]

        for metric in metrics:
            definition = self.metrics_definitions[metric]
            print(f"\n   {definition}")
            print(f"      → Ask in Claude Code: 'Show me {metric}'")

        self.log_query("get_activation", {})
        return {}

    def compare_periods(self, metric: str, period1_days: int = 30, period2_days: int = 60):
        """Compare metric across two time periods"""
        print(f"\n📊 Comparing {metric} across periods...")
        print(f"   Period 1: Last {period1_days} days")
        print(f"   Period 2: Last {period2_days} days")

        if metric not in self.metrics_definitions:
            print(f"❌ Unknown metric: {metric}")
            return

        definition = self.metrics_definitions[metric]
        print(f"\n   {definition}")
        print(f"      → Ask: 'Compare {definition} between periods'")

        self.log_query("compare_periods", {
            "metric": metric,
            "period1": period1_days,
            "period2": period2_days
        })

    def list_available_metrics(self):
        """List all available metrics"""
        print("\n📊 Available Metrics for Cloaked:")
        print("   " + "=" * 50)

        for metric, definition in self.metrics_definitions.items():
            print(f"\n   {metric}")
            print(f"      {definition}")

        print("\n" + "   " + "=" * 50)
        print(f"\n   Total: {len(self.metrics_definitions)} metrics defined")

    def export_metrics_for_roadmap(self, filename: str = "roadmap-metrics.json"):
        """Export metrics context for roadmap decisions"""
        output_file = self.repo_root / ".claude" / filename

        context = {
            "exported": datetime.now().isoformat(),
            "metrics_available": self.metrics_definitions,
            "instructions": "Use these metrics when building Q4 roadmap decisions",
            "how_to_use": [
                "Ask in Claude Code: 'Get retention metrics for Q3'",
                "Ask: 'Compare activation between feature A and feature B'",
                "Ask: 'What was identity creation rate last month?'",
                "Metrics will be queried from PostHog via MCP"
            ]
        }

        with open(output_file, "w") as f:
            json.dump(context, f, indent=2)

        print(f"\n✅ Metrics context exported to: {filename}")
        print(f"   Use this as reference when making roadmap decisions")

        self.log_query("export_for_roadmap", {"filename": filename})


def main(ctx):
    """CLI interface"""
    if len(ctx.args) < 1:
        print(__doc__)
        raise Exception('No command provided. See usage above.')

    helper = PMMetricsHelper()
    command = ctx.args[0]

    if command == "list":
        helper.list_available_metrics()

    elif command == "get-metric" and len(ctx.args) >= 2:
        metric = ctx.args[1]
        days = int(ctx.args[2]) if len(ctx.args) > 2 else 30
        helper.get_metric(metric, days)

    elif command == "retention":
        days = int(ctx.args[1]) if len(ctx.args) > 1 else 30
        helper.get_retention(days)

    elif command == "activation":
        helper.get_activation()

    elif command == "compare" and len(ctx.args) >= 3:
        metric = ctx.args[1]
        period1 = int(ctx.args[2])
        period2 = int(ctx.args[3]) if len(ctx.args) > 3 else 60
        helper.compare_periods(metric, period1, period2)

    elif command == "export":
        filename = ctx.args[1] if len(ctx.args) > 1 else "roadmap-metrics.json"
        helper.export_metrics_for_roadmap(filename)

    else:
        print("Unknown command or missing arguments")
        print(__doc__)
        raise Exception(f'Unknown command: {command}')


if __name__ == "__main__":
    script_run(name='pm-metrics-helper', mode='operational', main=main, services=['posthog'])
