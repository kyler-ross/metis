#!/usr/bin/env python3
"""
Smoke Tests for PM AI System

Fast, deterministic tests that verify system integrity without LLM calls.
Target: < 30 seconds total runtime.

Run: pytest .ai/evals/test_smoke.py -v --tb=short -m smoke
"""

import json
import os
import subprocess
from pathlib import Path

import pytest

# Get project root (pm/ directory)
PROJECT_ROOT = Path(__file__).parent.parent.parent


class TestFileStructure:
    """Verify critical files exist and have correct structure."""

    @pytest.mark.smoke
    def test_claude_md_exists(self):
        """CLAUDE.md must exist for Claude Code to work."""
        assert (PROJECT_ROOT / "CLAUDE.md").exists(), "CLAUDE.md is required"

    @pytest.mark.smoke
    def test_claude_md_not_empty(self):
        """CLAUDE.md should have substantial content."""
        claude_md = PROJECT_ROOT / "CLAUDE.md"
        content = claude_md.read_text()
        assert len(content) > 1000, "CLAUDE.md seems too short"
        assert "## " in content, "CLAUDE.md should have markdown headers"

    @pytest.mark.smoke
    def test_skills_index_exists(self):
        """Skills index is required for routing."""
        index_path = PROJECT_ROOT / "skills" / "_index.json"
        assert index_path.exists(), "skills/_index.json is required for routing"

    @pytest.mark.smoke
    def test_skills_index_valid_json(self):
        """Skills index must be valid JSON."""
        index_path = PROJECT_ROOT / "skills" / "_index.json"
        with open(index_path) as f:
            data = json.load(f)
        assert "skills" in data, "_index.json should have 'skills' key"
        assert len(data["skills"]) > 0, "_index.json should list skills"

    @pytest.mark.smoke
    def test_env_example_exists(self):
        """ENV example should exist for setup reference."""
        env_example = PROJECT_ROOT / ".ai" / "scripts" / ".env.example"
        assert env_example.exists(), ".env.example is required for setup"

    @pytest.mark.smoke
    def test_pre_commit_config_exists(self):
        """Pre-commit config should exist."""
        config = PROJECT_ROOT / ".pre-commit-config.yaml"
        assert config.exists(), ".pre-commit-config.yaml is required"

    @pytest.mark.smoke
    def test_knowledge_index_exists(self):
        """Knowledge index should exist for discovery."""
        index_path = PROJECT_ROOT / ".ai" / "config" / "knowledge-index.json"
        assert index_path.exists(), "knowledge-index.json is required"


class TestConfiguration:
    """Verify configuration files are valid."""

    @pytest.mark.smoke
    def test_knowledge_index_valid_json(self):
        """Knowledge index must be valid JSON."""
        index_path = PROJECT_ROOT / ".ai" / "config" / "knowledge-index.json"
        with open(index_path) as f:
            data = json.load(f)
        # Check for any of the known keys
        valid_keys = {"files", "knowledge", "knowledge_files"}
        assert valid_keys & set(data.keys()), "Index should have content"

    @pytest.mark.smoke
    def test_team_members_valid_json(self):
        """Team members config must be valid JSON if exists."""
        team_path = PROJECT_ROOT / ".ai" / "config" / "team-members.json"
        if team_path.exists():
            with open(team_path) as f:
                data = json.load(f)
            assert isinstance(data, (list, dict)), "Should be list or dict"

    @pytest.mark.smoke
    def test_gitignore_protects_secrets(self):
        """Gitignore should protect sensitive files."""
        gitignore = PROJECT_ROOT / ".gitignore"
        assert gitignore.exists(), ".gitignore is required"
        content = gitignore.read_text()

        protected_patterns = [".env", ".ai/local", ".ai/work"]
        for pattern in protected_patterns:
            assert pattern in content, f"{pattern} should be in .gitignore"

    @pytest.mark.smoke
    def test_claude_settings_valid(self):
        """Claude settings should be valid JSON."""
        settings_path = PROJECT_ROOT / ".claude" / "settings.json"
        if settings_path.exists():
            with open(settings_path) as f:
                data = json.load(f)
            # Should be a dict with valid structure
            assert isinstance(data, dict)


class TestScriptExecutability:
    """Verify critical scripts can be invoked."""

    @pytest.mark.smoke
    def test_atlassian_api_help(self):
        """atlassian-api.cjs should respond to help."""
        script = PROJECT_ROOT / ".ai" / "scripts" / "atlassian-api.cjs"
        if not script.exists():
            pytest.skip("atlassian-api.cjs not found")

        result = subprocess.run(
            ["node", str(script), "help"],
            capture_output=True,
            text=True,
            timeout=10,
            cwd=PROJECT_ROOT,
        )
        # Should show help (exit 0) or usage error (exit 1) but not crash
        assert result.returncode in [0, 1], f"Unexpected exit: {result.stderr}"

    @pytest.mark.smoke
    def test_setup_doctor_runs(self):
        """setup-doctor.cjs should run without crashing."""
        script = PROJECT_ROOT / ".ai" / "scripts" / "setup-doctor.cjs"
        if not script.exists():
            pytest.skip("setup-doctor.cjs not found")

        result = subprocess.run(
            ["node", str(script), "--help"],
            capture_output=True,
            text=True,
            timeout=10,
            cwd=PROJECT_ROOT,
        )
        # May fail due to missing credentials, but shouldn't crash
        assert result.returncode in [0, 1, 2], f"Crash: {result.stderr}"

    @pytest.mark.smoke
    def test_watchdog_runs(self):
        """watchdog.py should run with --help."""
        script = PROJECT_ROOT / ".ai" / "scripts" / "watchdog.py"
        if not script.exists():
            pytest.skip("watchdog.py not found")

        result = subprocess.run(
            ["python3", str(script), "--help"],
            capture_output=True,
            text=True,
            timeout=10,
            cwd=PROJECT_ROOT,
        )
        assert result.returncode == 0, f"Help failed: {result.stderr}"

    @pytest.mark.smoke
    def test_fast_validate_exists_and_runs(self):
        """fast-validate.sh should exist and be executable."""
        script = PROJECT_ROOT / ".ai" / "scripts" / "fast-validate.sh"
        if not script.exists():
            pytest.skip("fast-validate.sh not found")

        # Check it's executable
        assert os.access(script, os.X_OK), "fast-validate.sh should be executable"


class TestSkillsIntegrity:
    """Verify skills system integrity."""

    @pytest.mark.smoke
    def test_all_indexed_skills_have_files(self):
        """All skills in index should have corresponding SKILL.md files."""
        index_path = PROJECT_ROOT / "skills" / "_index.json"
        with open(index_path) as f:
            data = json.load(f)

        missing = []
        skills = data.get("skills", {})

        # Handle both dict format (skill_name: metadata) and list format
        if isinstance(skills, dict):
            for skill_name, skill_data in skills.items():
                if isinstance(skill_data, dict):
                    skill_path = skill_data.get("path", "")
                else:
                    skill_path = skill_data if isinstance(skill_data, str) else ""

                if skill_path:
                    # Path may already include SKILL.md or just be the directory
                    if skill_path.endswith("SKILL.md"):
                        full_path = PROJECT_ROOT / "skills" / skill_path
                    elif skill_path.startswith("skills/"):
                        full_path = PROJECT_ROOT / skill_path / "SKILL.md"
                    else:
                        full_path = PROJECT_ROOT / "skills" / skill_path / "SKILL.md"

                    if not full_path.exists():
                        missing.append(skill_path)
        elif isinstance(skills, list):
            for skill in skills:
                if isinstance(skill, dict):
                    skill_path = skill.get("path", "")
                else:
                    skill_path = skill if isinstance(skill, str) else ""

                if skill_path:
                    if skill_path.endswith("SKILL.md"):
                        full_path = PROJECT_ROOT / "skills" / skill_path
                    elif skill_path.startswith("skills/"):
                        full_path = PROJECT_ROOT / skill_path / "SKILL.md"
                    else:
                        full_path = PROJECT_ROOT / "skills" / skill_path / "SKILL.md"

                    if not full_path.exists():
                        missing.append(skill_path)

        # Allow some missing (may be newly added or removed)
        if len(missing) > 5:
            pytest.fail(f"Too many missing SKILL.md files ({len(missing)}): {missing[:5]}...")

    @pytest.mark.smoke
    def test_skill_manifests_valid_json(self):
        """All skill manifest.json files should be valid JSON."""
        skills_dir = PROJECT_ROOT / "skills"
        invalid = []

        for manifest in skills_dir.rglob("manifest.json"):
            try:
                with open(manifest) as f:
                    json.load(f)
            except json.JSONDecodeError as e:
                invalid.append(f"{manifest}: {e}")

        assert not invalid, f"Invalid manifest.json files: {invalid}"


class TestModuleIntegrity:
    """Verify core modules can be imported."""

    @pytest.mark.smoke
    def test_service_definitions_loads(self):
        """service-definitions.cjs should load correctly."""
        script = PROJECT_ROOT / ".ai" / "scripts" / "lib" / "service-definitions.cjs"
        if not script.exists():
            pytest.skip("service-definitions.cjs not found")

        result = subprocess.run(
            [
                "node",
                "-e",
                f"const m = require('{script}'); console.log(Object.keys(m.SERVICES).length)",
            ],
            capture_output=True,
            text=True,
            timeout=5,
        )
        assert result.returncode == 0, f"Load failed: {result.stderr}"
        count = int(result.stdout.strip())
        assert count > 0, "SERVICES should have entries"

    @pytest.mark.smoke
    def test_error_categories_loads(self):
        """error-categories.cjs should load correctly."""
        script = PROJECT_ROOT / ".ai" / "scripts" / "lib" / "error-categories.cjs"
        if not script.exists():
            pytest.skip("error-categories.cjs not found")

        result = subprocess.run(
            [
                "node",
                "-e",
                f"const m = require('{script}'); console.log(typeof m.categorizeError)",
            ],
            capture_output=True,
            text=True,
            timeout=5,
        )
        assert result.returncode == 0, f"Load failed: {result.stderr}"
        assert "function" in result.stdout, "categorizeError should be a function"

    @pytest.mark.smoke
    def test_auth_check_loads(self):
        """auth-check.cjs should load correctly."""
        script = PROJECT_ROOT / ".ai" / "scripts" / "lib" / "auth-check.cjs"
        if not script.exists():
            pytest.skip("auth-check.cjs not found")

        result = subprocess.run(
            [
                "node",
                "-e",
                f"const m = require('{script}'); console.log(typeof m.checkAuthFor)",
            ],
            capture_output=True,
            text=True,
            timeout=5,
        )
        assert result.returncode == 0, f"Load failed: {result.stderr}"
        assert "function" in result.stdout, "checkAuthFor should be a function"


class TestHooksIntegrity:
    """Verify Claude hooks are valid."""

    @pytest.mark.smoke
    def test_hooks_directory_exists(self):
        """Hooks directory should exist."""
        hooks_dir = PROJECT_ROOT / ".claude" / "hooks"
        assert hooks_dir.exists(), ".claude/hooks directory is required"

    @pytest.mark.smoke
    def test_cli_validator_syntax(self):
        """cli-validator.py should have valid Python syntax."""
        script = PROJECT_ROOT / ".claude" / "hooks" / "cli-validator.py"
        if not script.exists():
            pytest.skip("cli-validator.py not found")

        result = subprocess.run(
            ["python3", "-m", "py_compile", str(script)],
            capture_output=True,
            text=True,
            timeout=5,
        )
        assert result.returncode == 0, f"Syntax error: {result.stderr}"

    @pytest.mark.smoke
    def test_pr_scope_enforcer_syntax(self):
        """pr-scope-enforcer.py should have valid Python syntax."""
        script = PROJECT_ROOT / ".claude" / "hooks" / "pr-scope-enforcer.py"
        if not script.exists():
            pytest.skip("pr-scope-enforcer.py not found")

        result = subprocess.run(
            ["python3", "-m", "py_compile", str(script)],
            capture_output=True,
            text=True,
            timeout=5,
        )
        assert result.returncode == 0, f"Syntax error: {result.stderr}"


class TestPathIntegrity:
    """Verify all path references point to existing files after migrations."""

    @pytest.mark.smoke
    def test_agent_manifest_paths_exist(self):
        """All active agent paths in manifest should point to existing files."""
        manifest_path = PROJECT_ROOT / ".ai" / "config" / "agent-manifest.json"
        if not manifest_path.exists():
            pytest.skip("agent-manifest.json not found")

        with open(manifest_path) as f:
            data = json.load(f)

        missing = []
        for agent_name, agent_data in data.get("agents", {}).items():
            # Skip agents that aren't actively maintained
            if agent_data.get("status") in ("inactive", "planned", "deprecated", "archived"):
                continue
            path = agent_data.get("path")
            if path:
                full_path = PROJECT_ROOT / path
                if not full_path.exists():
                    missing.append(f"{agent_name}: {path}")

        assert not missing, f"Agent manifest references missing files: {missing}"

    @pytest.mark.smoke
    def test_knowledge_index_files_exist(self):
        """Knowledge index entries should reference existing files."""
        index_path = PROJECT_ROOT / ".ai" / "config" / "knowledge-index.json"
        if not index_path.exists():
            pytest.skip("knowledge-index.json not found")

        with open(index_path) as f:
            data = json.load(f)

        knowledge_dir = PROJECT_ROOT / ".ai" / "knowledge"
        files = data.get("knowledge_files", data.get("files", []))

        # Handle dict format {filename: metadata} and list format
        if isinstance(files, dict):
            file_paths = list(files.keys())
        elif isinstance(files, list):
            file_paths = [
                e.get("path", "") if isinstance(e, dict) else str(e)
                for e in files
            ]
        else:
            file_paths = []

        missing = []
        for path in file_paths:
            if not path:
                continue
            # Try as-is from project root, then relative to knowledge dir
            full_path = PROJECT_ROOT / path
            if not full_path.exists():
                alt_path = knowledge_dir / path
                if not alt_path.exists():
                    missing.append(path)

        # Allow up to 10% stale (recently deleted/moved files), capped at 20
        threshold = max(3, min(len(file_paths) * 0.1, 20))
        assert len(missing) <= threshold, (
            f"Too many missing files in knowledge index "
            f"({len(missing)}/{len(file_paths)}): {missing[:10]}"
        )

    @pytest.mark.smoke
    def test_skill_load_directives_resolve(self):
        """Load directives in SKILL.md files should point to existing files."""
        import re

        skills_dir = PROJECT_ROOT / "skills"
        if not skills_dir.exists():
            pytest.skip("skills/ directory not found")

        missing = []
        for skill_file in skills_dir.rglob("SKILL.md"):
            content = skill_file.read_text()
            # Match "Load: path" but not markdown bold "**Load:**" descriptions
            for match in re.finditer(
                r"^(?!\s*-\s*\*\*)(?:Load|Read):\s*`?([^`\n*]+)`?",
                content,
                re.MULTILINE,
            ):
                ref_path = match.group(1).strip()
                # Skip URLs, variables, and non-path references
                if ref_path.startswith(("http", "$", "#")):
                    continue
                # Skip if it looks like prose, not a file path
                if " " in ref_path and not ref_path.endswith((".md", ".json", ".py")):
                    continue
                # Resolve relative to skill directory
                full_path = skill_file.parent / ref_path
                if not full_path.exists():
                    # Also try from project root
                    alt_path = PROJECT_ROOT / ref_path
                    if not alt_path.exists():
                        rel = skill_file.relative_to(PROJECT_ROOT)
                        missing.append(f"{rel}: {ref_path}")

        assert not missing, f"SKILL.md Load directives reference missing files: {missing[:10]}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short", "-m", "smoke"])
