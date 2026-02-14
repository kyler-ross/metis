#!/usr/bin/env python3
"""
PM Jira Helper - Interact with Jira for PM tasks

This script helps PMs:
- Create well-formed tickets matching guardrails
- Query existing tickets
- Manage roadmap items
- Check ticket status

Usage:
  python3 .ai/scripts/pm-jira-helper.py create-ticket <title> <description>
  python3 .ai/scripts/pm-jira-helper.py list-tickets <project>
  python3 .ai/scripts/pm-jira-helper.py add-to-roadmap <ticket-id> <roadmap-name>
"""

import json
import sys
import os
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
from script_runner import run


class PMJiraHelper:
    def __init__(self):
        self.repo_root = Path(__file__).parent.parent.parent
        self.log_file = self.repo_root / ".claude" / "pm-jira-operations.log"
        self.log_file.parent.mkdir(exist_ok=True)

    def log_operation(self, operation: str, details: dict):
        """Log Jira operations for audit trail"""
        entry = {
            "timestamp": datetime.now().isoformat(),
            "operation": operation,
            "details": details
        }
        with open(self.log_file, "a") as f:
            f.write(json.dumps(entry) + "\n")

    def create_ticket(self, title: str, description: str, ticket_type: str = "Story") -> Optional[str]:
        """
        Create a Jira ticket using the CLI

        This assumes you have jira CLI configured with Cloaked credentials.
        If not, you'll be prompted for auth.

        Usage: python3 pm-jira-helper.py create-ticket "Title" "Description"
        """
        print(f"\n📝 Creating {ticket_type} in Jira...")
        print(f"   Title: {title}")
        print(f"   Description: {description[:100]}...")

        # Create issue using Jira CLI
        try:
            result = subprocess.run(
                [
                    "jira",
                    "issue",
                    "create",
                    "-t", title,
                    "-d", description,
                    "-T", ticket_type,
                    "--project=ALL"  # Cloaked project key
                ],
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode == 0:
                ticket_id = result.stdout.strip()
                print(f"✅ Created: {ticket_id}")

                self.log_operation("create_ticket", {
                    "ticket_id": ticket_id,
                    "title": title,
                    "type": ticket_type
                })

                return ticket_id
            else:
                print(f"❌ Error: {result.stderr}")
                return None

        except FileNotFoundError:
            print("❌ Jira CLI not found. Install with: brew install jira")
            return None
        except subprocess.TimeoutExpired:
            print("❌ Jira command timed out")
            return None

    def list_tickets(self, project: str = "ALL", status: Optional[str] = None) -> list:
        """List tickets in a project, optionally filtered by status"""
        print(f"\n📋 Listing tickets in {project}...")

        try:
            jql = f"project = {project}"
            if status:
                jql += f" AND status = '{status}'"

            result = subprocess.run(
                ["jira", "issue", "list", "--jql", jql],
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode == 0:
                print(result.stdout)
                self.log_operation("list_tickets", {"project": project, "status": status})
                return result.stdout.split("\n")
            else:
                print(f"❌ Error: {result.stderr}")
                return []

        except FileNotFoundError:
            print("❌ Jira CLI not found")
            return []

    def add_to_roadmap(self, ticket_id: str, roadmap_name: str):
        """Add ticket to a roadmap in Jira"""
        print(f"\n🗺️  Adding {ticket_id} to roadmap: {roadmap_name}")

        try:
            # This depends on your Jira roadmap structure
            # Adjust based on your actual custom fields
            result = subprocess.run(
                [
                    "jira",
                    "issue",
                    "edit",
                    ticket_id,
                    "-f", "Roadmap=" + roadmap_name
                ],
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode == 0:
                print(f"✅ Added to roadmap")
                self.log_operation("add_to_roadmap", {
                    "ticket_id": ticket_id,
                    "roadmap": roadmap_name
                })
            else:
                print(f"⚠️  May need manual roadmap update: {result.stderr}")

        except FileNotFoundError:
            print("❌ Jira CLI not found")

    def validate_ticket_format(self, ticket_data: dict) -> list:
        """Validate ticket against Jira guardrail"""
        errors = []

        # Check mandatory fields from .ai/guardrails/jira-ticket.md
        mandatory_fields = [
            ("title", "Title is required"),
            ("summary", "One-sentence summary is required"),
            ("acceptance_criteria", "At least 3 acceptance criteria required"),
            ("business_impact", "Business impact must be explained"),
            ("testing_steps", "Testing steps must be provided")
        ]

        for field, message in mandatory_fields:
            if field not in ticket_data or not ticket_data[field]:
                errors.append(f"❌ {message}")

        if errors:
            print("\n🛑 Ticket validation failed:")
            for error in errors:
                print(f"   {error}")
            return errors

        print("\n✅ Ticket validation passed - ready to submit")
        return []


def main(ctx):
    """CLI interface"""
    if len(ctx.args) < 1:
        print(__doc__)
        raise Exception('No command provided. Usage: pm-jira-helper.py <command> [args...]')

    helper = PMJiraHelper()
    command = ctx.args[0]

    if command == "create-ticket" and len(ctx.args) >= 3:
        title = ctx.args[1]
        description = ctx.args[2]
        helper.create_ticket(title, description)

    elif command == "list-tickets":
        project = ctx.args[1] if len(ctx.args) > 1 else "ALL"
        status = ctx.args[2] if len(ctx.args) > 2 else None
        helper.list_tickets(project, status)

    elif command == "add-to-roadmap" and len(ctx.args) >= 3:
        ticket_id = ctx.args[1]
        roadmap = ctx.args[2]
        helper.add_to_roadmap(ticket_id, roadmap)

    else:
        print("❌ Unknown command or missing arguments")
        print(__doc__)
        raise Exception(f'Unknown command or missing arguments: {command}')


run(name='pm-jira-helper', mode='operational', main=main, services=['jira'])
