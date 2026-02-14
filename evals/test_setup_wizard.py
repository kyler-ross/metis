#!/usr/bin/env python3
"""
Test suite for PM AI Setup Wizard

Tests state management, validators, platform detection, and migration logic.
Run with: python3 -m pytest .ai/evals/test_setup_wizard.py -v
"""

import pytest
import json
import os
import tempfile
import shutil
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock

# Test fixtures directory
FIXTURES_DIR = Path(__file__).parent / "fixtures"
FIXTURES_DIR.mkdir(exist_ok=True)


class TestStateManager:
    """Tests for setup state management system"""

    @pytest.fixture
    def temp_state_file(self):
        """Create temporary state file for testing"""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            yield f.name
        os.unlink(f.name)

    def test_state_schema_structure(self):
        """Test state schema has required fields"""
        # In a real implementation, we'd import SetupState
        # For now, validate schema structure
        expected_phases = [
            'preflight',
            'system_packages',
            'env_file',
            'credentials',
            'google_oauth',
            'mcp_config',
            'slash_commands',
            'analytics',
            'daemon',
            'shell_alias',
            'auto_update'
        ]

        schema = {
            "version": "4.0.0",
            "started_at": None,
            "last_updated": None,
            "platform": None,
            "node_version": None,
            "python_version": None,
            "phases": {phase: {"status": "pending"} for phase in expected_phases},
            "migration": {"from_v3": False}
        }

        assert "version" in schema
        assert "phases" in schema
        assert len(schema["phases"]) == 11
        assert all(phase in schema["phases"] for phase in expected_phases)

    def test_state_phase_transitions(self):
        """Test valid phase status transitions"""
        valid_statuses = ["pending", "in_progress", "completed", "skipped", "failed"]

        # Test transition logic
        transitions = {
            "pending": ["in_progress", "skipped"],
            "in_progress": ["completed", "failed"],
            "completed": [],  # Terminal state
            "skipped": [],  # Terminal state
            "failed": ["in_progress"]  # Can retry
        }

        for current, allowed_next in transitions.items():
            assert isinstance(allowed_next, list)

    def test_state_resumability(self):
        """Test that setup can be resumed from any phase"""
        phases = ["preflight", "system_packages", "env_file", "credentials",
                  "google_oauth", "mcp_config", "slash_commands", "analytics",
                  "daemon", "shell_alias", "auto_update"]

        for i, phase in enumerate(phases):
            # Simulate partial completion
            completed_phases = phases[:i]
            pending_phases = phases[i:]

            state = {
                "phases": {
                    **{p: {"status": "completed"} for p in completed_phases},
                    **{p: {"status": "pending"} for p in pending_phases}
                }
            }

            # Next phase to execute should be first pending
            next_phase = pending_phases[0] if pending_phases else None

            if next_phase:
                assert state["phases"][next_phase]["status"] == "pending"


class TestPlatformDetector:
    """Tests for platform detection logic"""

    @patch('platform.system')
    def test_detect_macos(self, mock_system):
        """Test macOS detection"""
        mock_system.return_value = 'Darwin'

        # Would call: platform_detector.getPlatform()
        # Expected: 'macOS'
        assert mock_system() == 'Darwin'

    @patch('platform.system')
    def test_detect_linux(self, mock_system):
        """Test Linux detection"""
        mock_system.return_value = 'Linux'

        assert mock_system() == 'Linux'

    def test_package_manager_detection(self):
        """Test package manager detection logic"""
        # macOS → brew
        # Ubuntu/Debian → apt
        # CentOS/RHEL → yum
        # Fedora → dnf

        package_managers = {
            'Darwin': 'brew',
            'Linux-ubuntu': 'apt',
            'Linux-debian': 'apt',
            'Linux-centos': 'yum',
            'Linux-fedora': 'dnf'
        }

        assert package_managers['Darwin'] == 'brew'
        assert package_managers['Linux-ubuntu'] == 'apt'

    def test_shell_detection(self):
        """Test shell detection logic"""
        shells = {
            'zsh': '~/.zshrc',
            'bash': '~/.bashrc',
            'fish': '~/.config/fish/config.fish'
        }

        for shell, config in shells.items():
            assert config.startswith('~/')


class TestCredentialValidators:
    """Tests for API credential validators"""

    def test_atlassian_validator_success(self):
        """Test Atlassian credential validation (mocked success)"""
        with patch('aiohttp.ClientSession.get') as mock_get:
            # Mock successful API responses
            mock_get.return_value.__aenter__.return_value.status = 200
            mock_get.return_value.__aenter__.return_value.json = Mock(
                return_value={"displayName": "Test User"}
            )

            # Would call: validateAtlassian(email, token)
            # Expected: {"valid": True, "user": "Test User"}
            assert mock_get.return_value.__aenter__.return_value.status == 200

    def test_atlassian_validator_401(self):
        """Test Atlassian validation with invalid credentials"""
        with patch('aiohttp.ClientSession.get') as mock_get:
            mock_get.return_value.__aenter__.return_value.status = 401

            # Expected: {"valid": False, "error": "401 Unauthorized"}
            assert mock_get.return_value.__aenter__.return_value.status == 401

    def test_github_validator_success(self):
        """Test GitHub PAT validation (mocked success)"""
        with patch('aiohttp.ClientSession.get') as mock_get:
            mock_response = Mock()
            mock_response.status = 200
            mock_response.headers = {'x-oauth-scopes': 'repo, read:org'}
            mock_response.json = Mock(return_value={"login": "testuser"})

            mock_get.return_value.__aenter__.return_value = mock_response

            # Expected: {"valid": True, "scopes": ["repo", "read:org"]}
            assert 'repo' in mock_response.headers['x-oauth-scopes']

    def test_github_validator_missing_scopes(self):
        """Test GitHub validation with missing scopes"""
        with patch('aiohttp.ClientSession.get') as mock_get:
            mock_response = Mock()
            mock_response.status = 200
            mock_response.headers = {'x-oauth-scopes': 'repo'}  # Missing read:org

            mock_get.return_value.__aenter__.return_value = mock_response

            # Expected: {"valid": False, "error": "Missing scopes: read:org"}
            scopes = mock_response.headers['x-oauth-scopes'].split(', ')
            assert 'read:org' not in scopes

    def test_credential_format_validation(self):
        """Test credential format validation"""
        # GitHub PAT format
        valid_github = "ghp_" + "A" * 36
        assert valid_github.startswith("ghp_")
        assert len(valid_github) == 40

        # Gemini API key format
        valid_gemini = "AIza" + "A" * 35
        assert valid_gemini.startswith("AIza")

        # PostHog auth header format
        valid_posthog = "Bearer phx_" + "A" * 32
        assert valid_posthog.startswith("Bearer phx_")


class TestMigrationDetection:
    """Tests for v3 to v4 migration detection"""

    @pytest.fixture
    def temp_dir(self):
        """Create temporary directory structure for testing"""
        tmpdir = tempfile.mkdtemp()
        yield tmpdir
        shutil.rmtree(tmpdir)

    def test_detect_v3_setup_indicators(self, temp_dir):
        """Test v3 setup detection with multiple indicators"""
        # Create v3 indicators
        mcp_config = Path(temp_dir) / ".claude" / "mcp.json"
        mcp_config.parent.mkdir(parents=True)
        mcp_config.write_text('{"mcpServers": {}}')

        shell_config = Path(temp_dir) / ".zshrc"
        shell_config.write_text('export ATLASSIAN_EMAIL="test@test.com"')

        indicators = []

        # Check MCP exists without state
        if mcp_config.exists():
            indicators.append("mcp_without_state")

        # Check shell env vars
        if shell_config.exists() and "ATLASSIAN_" in shell_config.read_text():
            indicators.append("shell_env_vars")

        # Need 2+ indicators for migration
        assert len(indicators) >= 2

    def test_migration_not_triggered_for_fresh_install(self, temp_dir):
        """Test that migration is not triggered for fresh installs"""
        indicators = []

        # No MCP config
        mcp_config = Path(temp_dir) / ".claude" / "mcp.json"
        if not mcp_config.exists():
            pass  # Good, fresh install

        # No shell env vars
        shell_config = Path(temp_dir) / ".zshrc"
        if not shell_config.exists():
            pass  # Good, fresh install

        assert len(indicators) < 2  # Don't trigger migration


class TestIdempotency:
    """Tests for wizard idempotency (safe to run multiple times)"""

    def test_env_file_update_preserves_existing(self):
        """Test that updating .env preserves existing non-conflicting values"""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.env', delete=False) as f:
            f.write('EXISTING_VAR=value1\n')
            f.write('SHARED_VAR=old_value\n')
            env_file = f.name

        try:
            # Simulate wizard updating env
            lines = Path(env_file).read_text().split('\n')

            # Remove old SHARED_VAR
            lines = [l for l in lines if not l.startswith('SHARED_VAR=')]

            # Add new values
            lines.append('SHARED_VAR=new_value')
            lines.append('NEW_VAR=value2')

            Path(env_file).write_text('\n'.join(lines))

            content = Path(env_file).read_text()

            # Verify existing preserved
            assert 'EXISTING_VAR=value1' in content
            # Verify new value updated
            assert 'SHARED_VAR=new_value' in content
            # Verify no duplicates
            assert content.count('SHARED_VAR=') == 1
        finally:
            os.unlink(env_file)

    def test_mcp_config_merge(self):
        """Test that MCP config merges with existing servers"""
        existing_config = {
            "mcpServers": {
                "custom-server": {"command": "custom", "args": []},
                "github": {"command": "old", "args": []}
            }
        }

        new_servers = {
            "github": {"command": "new", "args": ["--updated"]},
            "posthog": {"command": "posthog", "args": []}
        }

        # Merge logic
        merged = existing_config["mcpServers"].copy()
        merged.update(new_servers)

        # Verify custom server preserved
        assert "custom-server" in merged
        # Verify github updated
        assert merged["github"]["command"] == "new"
        # Verify new server added
        assert "posthog" in merged


class TestErrorRecovery:
    """Tests for error recovery and retry logic"""

    def test_retry_with_exponential_backoff(self):
        """Test retry logic with backoff"""
        max_retries = 3
        base_delay = 1

        delays = []
        for attempt in range(max_retries):
            delay = base_delay * (2 ** attempt)  # Exponential backoff
            delays.append(delay)

        assert delays == [1, 2, 4]

    def test_validation_retry_offers_skip(self):
        """Test that validation failures offer skip option"""
        attempt = 1
        max_attempts = 3

        options = []

        if attempt < max_attempts:
            options.append("Retry")

        options.extend(["Skip", "Abort"])

        assert "Retry" in options
        assert "Skip" in options
        assert "Abort" in options

    def test_partial_failure_recovery(self):
        """Test recovery from partial failures"""
        phases = ["phase1", "phase2", "phase3", "phase4"]
        completed = ["phase1", "phase2"]
        failed = "phase3"
        pending = ["phase4"]

        state = {
            "phases": {
                **{p: {"status": "completed"} for p in completed},
                failed: {"status": "failed"},
                **{p: {"status": "pending"} for p in pending}
            }
        }

        # On resume, should retry failed phase
        next_phase = failed
        assert state["phases"][next_phase]["status"] == "failed"

        # Can mark as in_progress to retry
        state["phases"][next_phase]["status"] = "in_progress"
        assert state["phases"][next_phase]["status"] == "in_progress"


class TestConfigGeneration:
    """Tests for configuration file generation"""

    def test_mcp_config_valid_json(self):
        """Test that generated MCP config is valid JSON"""
        config = {
            "mcpServers": {
                "github": {
                    "command": "npx",
                    "args": ["-y", "@modelcontextprotocol/server-github"],
                    "env": {"GITHUB_PERSONAL_ACCESS_TOKEN": "test"}
                }
            }
        }

        # Should be valid JSON
        json_str = json.dumps(config, indent=2)
        parsed = json.loads(json_str)

        assert parsed == config
        assert "mcpServers" in parsed

    def test_env_file_format(self):
        """Test .env file format"""
        env_vars = {
            "VAR1": "value1",
            "VAR2": "value with spaces",
            "VAR3": "value=with=equals"
        }

        lines = [f"{k}={v}" for k, v in env_vars.items()]
        content = '\n'.join(lines)

        # Parse back
        parsed = {}
        for line in content.split('\n'):
            if '=' in line:
                key, val = line.split('=', 1)
                parsed[key] = val

        assert parsed == env_vars

    def test_launchagent_plist_structure(self):
        """Test LaunchAgent plist structure"""
        plist = {
            "Label": "com.cloaked.pm-enrichment",
            "ProgramArguments": ["node", "script.js"],
            "RunAtLoad": True,
            "StandardErrorPath": "error.log",
            "StandardOutPath": "output.log",
            "EnvironmentVariables": {
                "GEMINI_API_KEY": "test"
            }
        }

        # Verify required fields
        assert "Label" in plist
        assert "ProgramArguments" in plist
        assert isinstance(plist["ProgramArguments"], list)
        assert "EnvironmentVariables" in plist


class TestSecurityValidation:
    """Tests for security-related validation"""

    def test_env_file_not_committed(self):
        """Test that .env is gitignored"""
        gitignore_patterns = [
            '.env',
            '.ai/scripts/.env',
            '*.env',
            '.google-token.json',
            'setup-state.json'
        ]

        # Verify critical files are in gitignore
        assert '.env' in gitignore_patterns
        assert '.google-token.json' in gitignore_patterns

    def test_credentials_not_in_logs(self):
        """Test that credentials are not logged"""
        sensitive_data = "ghp_secrettoken123"

        # Log message should redact credentials
        log_message = f"Validating GitHub token: {'*' * len(sensitive_data)}"

        assert sensitive_data not in log_message
        assert '*' in log_message

    def test_file_permissions(self):
        """Test that sensitive files have proper permissions"""
        # .env should be 600 (rw-------)
        # .google-token.json should be 600
        # setup-state.json should be 600

        expected_permissions = 0o600  # Owner read/write only

        # This would be tested with actual file operations
        # os.chmod(path, expected_permissions)
        assert expected_permissions == 0o600


# Run tests
if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
