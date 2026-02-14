"""
Test Phase 1 Validators
========================
Tests for validation infrastructure:
- Validators exist and are executable
- Framework exports correct interfaces
- File size validator works
"""

import pytest
import subprocess
from pathlib import Path


VALIDATORS_DIR = Path(__file__).parent.parent / "scripts" / "validators"


class TestValidatorInfrastructure:
    """Test that validator infrastructure is set up correctly."""

    def test_jira_validator_exists(self):
        """Jira validator script should exist."""
        assert (VALIDATORS_DIR / "validate-jira-ticket.js").exists()

    def test_confluence_validator_exists(self):
        """Confluence validator script should exist."""
        assert (VALIDATORS_DIR / "validate-confluence-page.js").exists()

    def test_google_sheet_validator_exists(self):
        """Google Sheets validator script should exist."""
        assert (VALIDATORS_DIR / "validate-google-sheet.js").exists()

    def test_agent_file_size_validator_exists(self):
        """Agent file size validator script should exist and be executable."""
        validator = VALIDATORS_DIR / "validate-agent-file-size.sh"
        assert validator.exists()
        # Check if executable
        assert validator.stat().st_mode & 0o111, "Script should be executable"


class TestAgentFileSizeValidator:
    """Test agent file size validation (progressive disclosure enforcement)."""

    def test_all_agents_under_500_lines(self):
        """All core agents should be under 500 lines."""
        result = subprocess.run(
            ["bash", VALIDATORS_DIR / "validate-agent-file-size.sh"],
            capture_output=True,
            text=True,
            cwd=Path(__file__).parent.parent.parent
        )

        assert result.returncode == 0, f"Agent file size validation failed:\n{result.stdout}"
        assert "✅ All agents follow progressive disclosure pattern" in result.stdout


class TestValidationFramework:
    """Test the shared validation framework utilities."""

    def test_framework_file_exists(self):
        """Validation framework should exist."""
        framework = VALIDATORS_DIR / "lib" / "validation-framework.js"
        assert framework.exists()

    def test_framework_exports_validation_gate(self):
        """ValidationGate class should be available."""
        result = subprocess.run(
            ["node", "--input-type=module", "-e", "import { ValidationGate } from './.ai/scripts/validators/lib/validation-framework.js'; console.log(typeof ValidationGate)"],
            capture_output=True,
            text=True,
            cwd=Path(__file__).parent.parent.parent
        )

        assert "function" in result.stdout, "ValidationGate should be exported"

    def test_framework_exports_validators(self):
        """validators object should be available."""
        result = subprocess.run(
            ["node", "--input-type=module", "-e", "import { validators } from './.ai/scripts/validators/lib/validation-framework.js'; console.log(typeof validators)"],
            capture_output=True,
            text=True,
            cwd=Path(__file__).parent.parent.parent
        )

        assert "object" in result.stdout, "validators should be exported"
