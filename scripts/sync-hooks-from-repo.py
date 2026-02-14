#!/usr/bin/env python3
"""
Full Repository Sync - SessionStart Hook

Runs at the start of each Claude Code session to:
1. Pull ALL latest changes from repo (git pull) - including:
   - New/updated hooks
   - New meeting transcripts
   - Updated agents and workflows
   - Knowledge base updates
   - Any other PM repo content
2. Compare hooks in ~/.claude/settings.json with .ai/config/hook-definitions.json
3. Update user's settings.json if repo has new/updated hooks
4. Log sync activity

This ensures the PM has the latest everything: hooks, docs, agents, transcripts.
"""

import json
import sys
import subprocess
import os
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
from script_runner import run as script_run


class HookSync:
    def __init__(self, repo_root: str):
        self.repo_root = Path(repo_root)
        self.settings_file = Path.home() / ".claude" / "settings.json"
        self.hooks_config_file = self.repo_root / ".ai" / "config" / "hook-definitions.json"
        self.sync_log = self.repo_root / ".claude" / "hook-sync.log"
        self.sync_log.parent.mkdir(exist_ok=True)

    def log(self, message: str):
        """Log sync activity"""
        timestamp = datetime.now().isoformat()
        with open(self.sync_log, "a") as f:
            f.write(f"[{timestamp}] {message}\n")

    def git_pull(self) -> bool:
        """Pull latest changes from repo (hooks, docs, agents, transcripts, everything)"""
        try:
            os.chdir(self.repo_root)
            # Use git pull with rebase to handle diverged histories gracefully
            result = subprocess.run(
                ["git", "pull", "--quiet", "--no-rebase"],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                self.log("✅ Git pull successful - all repo content synced (hooks, docs, agents, transcripts, etc)")
                return True
            else:
                # Even if pull fails, repo might still be usable - don't block session start
                self.log(f"⚠️ Git pull had issues: {result.stderr[:100]} (using local repo state)")
                return False
        except Exception as e:
            # Git pull failures should not interrupt Claude Code session
            self.log(f"⚠️ Git pull failed: {str(e)[:100]} (using local repo state)")
            return False

    def load_hook_definitions(self) -> Dict[str, Any]:
        """Load hook definitions from repo"""
        if not self.hooks_config_file.exists():
            # Fallback: generate default hooks config
            return self._generate_default_hooks()

        try:
            with open(self.hooks_config_file) as f:
                config = json.load(f)

            # Replace {REPO_ROOT} placeholders with actual repo path
            config_str = json.dumps(config)
            config_str = config_str.replace("{REPO_ROOT}", str(self.repo_root))
            return json.loads(config_str)
        except Exception as e:
            self.log(f"❌ Failed to load hook definitions: {e}")
            return self._generate_default_hooks()

    def _generate_default_hooks(self) -> Dict[str, Any]:
        """Generate default hooks config if not in repo"""
        return {
            "version": "1.0",
            "hooks": {
                "SessionStart": [
                    {
                        "matcher": "*",
                        "hooks": [
                            {
                                "type": "command",
                                "command": f'python3 {self.repo_root}/.ai/scripts/sync-hooks-from-repo.py "{self.repo_root}" 2>/dev/null || true'
                            }
                        ]
                    }
                ],
                "UserPromptSubmit": [
                    {
                        "matcher": "*",
                        "hooks": [
                            {
                                "type": "command",
                                "command": f'if echo "${{USER_MESSAGE}}" | grep -qiE "self.?improv|learn from|remember this|knowledge gap|should know about|missing.*(knowledge|doc|info)"; then python3 {self.repo_root}/.ai/scripts/self-improvement-engine.py user_request "$(echo "${{USER_MESSAGE}}" | head -c 200)" && echo ""; fi'
                            }
                        ]
                    }
                ]
            }
        }

    def load_user_settings(self) -> Dict[str, Any]:
        """Load user's Claude Code settings"""
        if not self.settings_file.exists():
            return {}

        try:
            with open(self.settings_file) as f:
                return json.load(f)
        except Exception as e:
            self.log(f"❌ Failed to load user settings: {e}")
            return {}

    def hooks_equal(self, hook1: Dict, hook2: Dict) -> bool:
        """Check if two hooks are equivalent"""
        return json.dumps(hook1, sort_keys=True) == json.dumps(hook2, sort_keys=True)

    def sync_hooks(self):
        """Compare and sync hooks from repo to user settings"""
        repo_hooks = self.load_hook_definitions()
        user_settings = self.load_user_settings()

        if "hooks" not in repo_hooks:
            self.log("⚠️ No hooks defined in repo")
            return

        if "hooks" not in user_settings:
            user_settings["hooks"] = {}

        changes_made = False

        # For each hook type in repo
        for event_type, repo_hook_list in repo_hooks["hooks"].items():
            if event_type not in user_settings["hooks"]:
                user_settings["hooks"][event_type] = []
                self.log(f"➕ Added new hook type: {event_type}")
                changes_made = True

            # Check each hook in repo
            for repo_hook in repo_hook_list:
                # See if this hook already exists in user settings
                hook_exists = any(
                    self.hooks_equal(h, repo_hook)
                    for h in user_settings["hooks"][event_type]
                )

                if not hook_exists:
                    user_settings["hooks"][event_type].append(repo_hook)
                    self.log(f"➕ Added new hook: {event_type}")
                    changes_made = True

        if changes_made:
            # Write updated settings
            try:
                with open(self.settings_file, "w") as f:
                    json.dump(user_settings, f, indent=2)
                self.log("✅ User settings updated with new hooks")
            except Exception as e:
                self.log(f"❌ Failed to save user settings: {e}")
        else:
            self.log("✅ Hooks already in sync")

    def run(self):
        """Execute the full repository sync process"""
        self.log("=" * 60)
        self.log("🔄 Repository Sync Started (pulling all changes: hooks, docs, agents, transcripts, etc)")

        # Step 1: Pull latest repo changes (everything)
        self.git_pull()

        # Step 2: Load and sync hooks to user's Claude Code settings
        self.sync_hooks()

        self.log("✅ Repository Sync Complete - PM now has latest everything")
        self.log("=" * 60)


def main(ctx):
    if len(ctx.args) < 1:
        raise Exception("Usage: sync-hooks-from-repo.py <repo_root>")

    repo_root = ctx.args[0]
    syncer = HookSync(repo_root)
    syncer.run()


if __name__ == "__main__":
    script_run(name='sync-hooks-from-repo', mode='operational', main=main, services=[])
