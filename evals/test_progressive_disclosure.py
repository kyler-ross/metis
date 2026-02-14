"""
Test Progressive Disclosure Pattern
=====================================
Tests that agents follow the progressive disclosure pattern:
- Core files are <500 lines
- Resource directories exist
- Resources are referenced correctly
- Schema domain files follow the pattern
"""

import pytest
from pathlib import Path
import re


AGENTS_DIR = Path(__file__).parent.parent / "agents" / "core"
SCHEMAS_DIR = Path(__file__).parent.parent / "knowledge" / "schemas"


class TestAgentProgressiveDisclosure:
    """Test that core agents follow progressive disclosure pattern."""

    @pytest.fixture
    def core_agents(self):
        """Get all core agent files (excluding backups)."""
        return [
            f for f in AGENTS_DIR.glob("*.md")
            if not f.name.endswith(".bak") and "original" not in f.name
        ]

    def test_all_agents_under_500_lines(self, core_agents):
        """All core agent files should be under 500 lines."""
        failures = []

        for agent in core_agents:
            lines = len(agent.read_text().splitlines())
            if lines > 500:
                failures.append(f"{agent.name}: {lines} lines (max 500)")

        assert len(failures) == 0, f"Agents exceed 500 lines:\n" + "\n".join(failures)

    def test_large_agents_have_resources(self, core_agents):
        """Agents over 250 lines should have resource directories."""
        failures = []

        for agent in core_agents:
            lines = len(agent.read_text().splitlines())
            if lines > 250:
                resource_dir = AGENTS_DIR / agent.stem
                if not resource_dir.exists() or not resource_dir.is_dir():
                    failures.append(f"{agent.name} ({lines} lines) has no resources")

        assert len(failures) == 0, f"Large agents missing resources:\n" + "\n".join(failures)

    def test_agents_reference_resources(self, core_agents):
        """Agents with resource directories should reference them."""
        failures = []

        for agent in core_agents:
            resource_dir = AGENTS_DIR / agent.stem
            if resource_dir.exists() and resource_dir.is_dir():
                content = agent.read_text()

                # Check for resource selection section
                has_selection = any(
                    pattern in content.lower()
                    for pattern in ["workflow selection", "resource selection", "mode selection"]
                )

                # Check for Read tool references (can be Read: or **Load**: or just Load:)
                has_read_references = ("Read:" in content or
                                     "Load:" in content or
                                     "**Load**:" in content)

                if not (has_selection and has_read_references):
                    failures.append(
                        f"{agent.name}: Has resources but doesn't reference them "
                        f"(selection={has_selection}, read={has_read_references})"
                    )

        assert len(failures) == 0, f"Agents don't reference resources:\n" + "\n".join(failures)

    def test_resources_are_focused(self, core_agents):
        """Resource files should be focused (not overly large)."""
        failures = []

        for agent in core_agents:
            resource_dir = AGENTS_DIR / agent.stem
            if resource_dir.exists() and resource_dir.is_dir():
                for resource in resource_dir.glob("*.md"):
                    lines = len(resource.read_text().splitlines())
                    # Resources can be larger than core files (they're loaded on-demand)
                    # But shouldn't exceed 1000 lines (defeats the purpose)
                    if lines > 1000:
                        failures.append(
                            f"{agent.stem}/{resource.name}: {lines} lines (recommend <1000)"
                        )

        assert len(failures) == 0, f"Resource files too large:\n" + "\n".join(failures)

    # NOTE: test_backups_exist_for_refactored_agents was removed during
    # security audit Phase 3 cleanup. Backup files (.bak) were intentionally
    # deleted as tech debt - they were consuming tokens and the refactoring
    # has been stable for months. Agents now use resource directories instead.


class TestSchemaProgressiveDisclosure:
    """Test that schema files follow progressive disclosure pattern."""

    def test_schema_directory_exists(self):
        """Schema domain directory should exist."""
        assert SCHEMAS_DIR.exists(), "Schema directory missing"
        assert SCHEMAS_DIR.is_dir(), "Schema path is not a directory"

    def test_required_schema_domains_exist(self):
        """Required schema domain files should exist."""
        required = [
            "user-subscription-tables.md",
            "payment-revenue-tables.md",
            "analytics-tables.md",
            "privacy-data-removal-tables.md",
            "product-feature-tables.md",
            "card-pay-tables.md",
            "postgres-only-tables.md",
            "data-quality-notes.md",
            "complete-table-index.md"
        ]

        missing = []
        for schema in required:
            if not (SCHEMAS_DIR / schema).exists():
                missing.append(schema)

        assert len(missing) == 0, f"Missing schema files: {', '.join(missing)}"

    def test_main_schema_references_domains(self):
        """Main TABLE_SCHEMA_REFERENCE.md should reference domain files."""
        main_schema = Path(__file__).parent.parent / "knowledge" / "TABLE_SCHEMA_REFERENCE.md"
        content = main_schema.read_text()

        # Should have "Progressive Disclosure" section
        assert "progressive disclosure" in content.lower(), "Missing progressive disclosure section"

        # Should reference schema domain files
        domain_references = [
            "user-subscription-tables.md",
            "payment-revenue-tables.md",
            "analytics-tables.md",
            "privacy-data-removal-tables.md",
            "card-pay-tables.md"
        ]

        missing_refs = []
        for ref in domain_references:
            if ref not in content:
                missing_refs.append(ref)

        assert len(missing_refs) == 0, f"Main schema doesn't reference: {', '.join(missing_refs)}"

    def test_main_schema_is_index(self):
        """Main schema should be <300 lines (index/router, not full reference)."""
        main_schema = Path(__file__).parent.parent / "knowledge" / "TABLE_SCHEMA_REFERENCE.md"
        lines = len(main_schema.read_text().splitlines())

        assert lines < 300, f"Main schema is {lines} lines (should be <300 as an index)"

    def test_schema_domains_have_content(self):
        """Schema domain files should have substantial content."""
        failures = []

        for schema in SCHEMAS_DIR.glob("*.md"):
            lines = len(schema.read_text().splitlines())
            # Each domain should have at least 50 lines (otherwise not worth splitting)
            if lines < 50:
                failures.append(f"{schema.name}: Only {lines} lines (seems incomplete)")

        assert len(failures) == 0, f"Schema files too small:\n" + "\n".join(failures)


class TestResourceFileNaming:
    """Test that resource files follow naming conventions."""

    def test_resource_files_use_kebab_case(self):
        """Resource files should use kebab-case naming."""
        failures = []

        for agent_dir in AGENTS_DIR.glob("*/"):
            if agent_dir.is_dir():
                for resource in agent_dir.glob("*.md"):
                    # Check if filename uses kebab-case (lowercase with hyphens)
                    name = resource.stem
                    if not re.match(r'^[a-z0-9-]+$', name):
                        failures.append(f"{agent_dir.name}/{resource.name}: Should use kebab-case")

        assert len(failures) == 0, f"Resource files not using kebab-case:\n" + "\n".join(failures)

    def test_no_spaces_in_resource_names(self):
        """Resource files should not have spaces in names."""
        failures = []

        for agent_dir in AGENTS_DIR.glob("*/"):
            if agent_dir.is_dir():
                for resource in agent_dir.glob("*.md"):
                    if " " in resource.name:
                        failures.append(f"{agent_dir.name}/{resource.name}")

        assert len(failures) == 0, f"Resource files with spaces:\n" + "\n".join(failures)


class TestResourceDiscovery:
    """Test that resource files are discoverable and well-organized."""

    def test_agents_with_resources_have_multiple_files(self):
        """Agents with resource directories should have 2+ resource files."""
        failures = []

        for agent_dir in AGENTS_DIR.glob("*/"):
            if agent_dir.is_dir():
                resources = list(agent_dir.glob("*.md"))
                if len(resources) < 2:
                    failures.append(
                        f"{agent_dir.name}: Only {len(resources)} resource file(s) "
                        f"(recommend 2+ for meaningful separation)"
                    )

        assert len(failures) == 0, f"Agents with too few resources:\n" + "\n".join(failures)

    def test_resource_directories_match_agent_names(self):
        """Resource directories should match their agent's name."""
        failures = []

        for agent_dir in AGENTS_DIR.glob("*/"):
            if agent_dir.is_dir():
                agent_file = AGENTS_DIR / f"{agent_dir.name}.md"
                if not agent_file.exists():
                    failures.append(
                        f"{agent_dir.name}/: Directory exists but no matching {agent_dir.name}.md"
                    )

        assert len(failures) == 0, f"Orphaned resource directories:\n" + "\n".join(failures)
