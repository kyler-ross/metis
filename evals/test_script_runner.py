#!/usr/bin/env python3
"""
Tests for .ai/scripts/lib/script_runner.py

Verifies error categorization, recovery guidance, Context, and Logger classes.

Run: python3 -m pytest .ai/evals/test_script_runner.py -v
"""

import io
import json
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

# Add scripts dir to path so we can import the module
SCRIPTS_DIR = Path(__file__).parent.parent / 'scripts'
sys.path.insert(0, str(SCRIPTS_DIR))

from lib.script_runner import categorize_error, get_recovery, Context, Logger


# ─── categorize_error ───────────────────────────────────────────────

class TestCategorizeError:
    """Test error categorization logic."""

    def test_connection_error_is_network(self):
        result = categorize_error(ConnectionError('connection refused'))
        assert result['category'] == 'network'
        assert result['retryable'] is True

    def test_permission_error_is_system(self):
        """PermissionError is caught by isinstance check, not message matching."""
        result = categorize_error(PermissionError('access denied'))
        assert result['category'] == 'system'
        assert result['retryable'] is False

    def test_timeout_error_is_network(self):
        result = categorize_error(TimeoutError('timed out'))
        assert result['category'] == 'network'
        assert result['type'] == 'timeout'
        assert result['retryable'] is True

    def test_generic_exception_is_unknown(self):
        result = categorize_error(Exception('something broke'))
        assert result['category'] == 'unknown'
        assert result['type'] == 'unknown_error'

    def test_401_in_message_is_auth(self):
        result = categorize_error(Exception('HTTP 401 unauthorized'))
        assert result['category'] == 'auth'
        assert result['type'] == 'auth_failure'
        assert result['retryable'] is False

    def test_429_in_message_is_throttle(self):
        result = categorize_error(Exception('HTTP 429 too many requests'))
        assert result['category'] == 'throttle'
        assert result['type'] == 'rate_limit'
        assert result['retryable'] is True

    def test_403_in_message_is_auth(self):
        result = categorize_error(Exception('HTTP 403 forbidden'))
        assert result['category'] == 'auth'

    def test_404_in_message_is_client(self):
        result = categorize_error(Exception('HTTP 404 not found'))
        assert result['category'] == 'client'
        assert result['retryable'] is False

    def test_500_in_message_is_server(self):
        result = categorize_error(Exception('HTTP 500 server error'))
        assert result['category'] == 'server'
        assert result['retryable'] is True

    def test_file_not_found_is_system(self):
        result = categorize_error(FileNotFoundError('no such file'))
        assert result['category'] == 'system'

    def test_json_decode_error_is_data(self):
        result = categorize_error(json.JSONDecodeError('bad json', '', 0))
        assert result['category'] == 'data'
        assert result['type'] == 'parse_error'

    def test_value_error_is_data(self):
        result = categorize_error(ValueError('invalid value'))
        assert result['category'] == 'data'

    def test_result_always_has_required_keys(self):
        """Every categorization result must have type, category, retryable."""
        errors = [
            Exception('generic'),
            ConnectionError('net'),
            PermissionError('perm'),
            TimeoutError('to'),
        ]
        for err in errors:
            result = categorize_error(err)
            assert 'type' in result
            assert 'category' in result
            assert 'retryable' in result


# ─── get_recovery ───────────────────────────────────────────────────

class TestGetRecovery:
    """Test recovery guidance lookup."""

    def test_returns_list_of_strings(self):
        result = get_recovery('auth_failure')
        assert isinstance(result, list)
        assert all(isinstance(s, str) for s in result)

    def test_auth_failure_has_recovery_steps(self):
        result = get_recovery('auth_failure')
        assert len(result) > 0

    def test_network_error_has_recovery_steps(self):
        result = get_recovery('network_error')
        assert len(result) > 0

    def test_unknown_type_returns_default(self):
        result = get_recovery('nonexistent_error_type')
        assert isinstance(result, list)
        assert len(result) > 0

    def test_service_specific_recovery(self):
        """When a service is specified, get service-specific guidance."""
        result = get_recovery('auth_failure', service='google')
        assert any('google' in step.lower() or 'oauth' in step.lower() or 'GOOGLE' in step for step in result)

    def test_service_fallback_to_default(self):
        """Unknown service falls back to default guidance."""
        result = get_recovery('auth_failure', service='nonexistent_service')
        default = get_recovery('auth_failure')
        assert result == default


# ─── Context ────────────────────────────────────────────────────────

class TestContext:
    """Test the Context execution wrapper."""

    def test_has_expected_attributes(self):
        log = Logger()
        ctx = Context(name='test-script', mode='operational', args=['--verbose'], log=log)
        assert ctx.name == 'test-script'
        assert ctx.mode == 'operational'
        assert ctx.args == ['--verbose']
        assert ctx.log is log

    def test_log_has_required_methods(self):
        log = Logger()
        ctx = Context(name='test', mode='diagnostic', args=[], log=log)
        assert callable(ctx.log.info)
        assert callable(ctx.log.warn)
        assert callable(ctx.log.error)

    def test_report_json_mode(self, capsys):
        """report() in JSON mode writes structured output to stdout."""
        log = Logger()
        ctx = Context(name='test', mode='diagnostic', args=['--json'], log=log)
        results = {'errors': [], 'warnings': ['something off'], 'ok': ['all good']}
        ctx.report(results)
        captured = capsys.readouterr()
        data = json.loads(captured.out)
        assert data['status'] == 'warning'
        assert data['summary']['warning_count'] == 1
        assert data['summary']['ok_count'] == 1

    def test_report_error_status(self, capsys):
        """report() with errors shows error status in JSON mode."""
        log = Logger()
        ctx = Context(name='test', mode='diagnostic', args=['--json'], log=log)
        results = {'errors': ['bad thing'], 'warnings': [], 'ok': []}
        ctx.report(results)
        captured = capsys.readouterr()
        data = json.loads(captured.out)
        assert data['status'] == 'error'


# ─── Logger ─────────────────────────────────────────────────────────

class TestLogger:
    """Test structured logging output."""

    def test_info_writes_to_stderr(self):
        log = Logger()
        stderr = io.StringIO()
        with patch('sys.stderr', stderr):
            log.info('test message')
        output = stderr.getvalue()
        assert 'test message' in output

    def test_warn_writes_to_stderr(self):
        log = Logger()
        stderr = io.StringIO()
        with patch('sys.stderr', stderr):
            log.warn('warning message')
        output = stderr.getvalue()
        assert 'warning message' in output

    def test_error_writes_to_stderr(self):
        log = Logger()
        stderr = io.StringIO()
        with patch('sys.stderr', stderr):
            log.error('error message')
        output = stderr.getvalue()
        assert 'error message' in output

    def test_json_mode_output(self):
        log = Logger(json_mode=True)
        stderr = io.StringIO()
        with patch('sys.stderr', stderr):
            log.info('structured log')
        output = stderr.getvalue()
        data = json.loads(output.strip())
        assert data['level'] == 'info'
        assert data['message'] == 'structured log'
        assert 'timestamp' in data

    def test_json_mode_with_meta(self):
        log = Logger(json_mode=True)
        stderr = io.StringIO()
        with patch('sys.stderr', stderr):
            log.error('auth failed', service='jira')
        output = stderr.getvalue()
        data = json.loads(output.strip())
        assert data['service'] == 'jira'

    def test_recovery_steps_printed(self):
        log = Logger()
        stderr = io.StringIO()
        with patch('sys.stderr', stderr):
            log.error('failed', recovery=['step 1', 'step 2'])
        output = stderr.getvalue()
        assert 'step 1' in output
        assert 'step 2' in output


# ─── Integration tests (subprocess) ───────────────────────────────

import subprocess
import os

# Absolute path to .ai/scripts/lib/ for subprocess test scripts
SCRIPTS_LIB_PATH = str(Path(__file__).parent.parent / 'scripts' / 'lib')


class TestRunIntegration:
    """Integration tests for run() via subprocess."""

    def _run_script(self, code, args=None, timeout=10):
        """Write code to temp file and execute."""
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write(code)
            f.flush()
            try:
                result = subprocess.run(
                    [sys.executable, f.name] + (args or []),
                    capture_output=True, text=True, timeout=timeout,
                )
                return result
            finally:
                os.unlink(f.name)

    def test_happy_path_exits_0(self):
        """Script that succeeds should exit 0."""
        code = f"""
import sys
sys.path.insert(0, {SCRIPTS_LIB_PATH!r})
from script_runner import run

def main(ctx):
    pass

run('test', main)
"""
        result = self._run_script(code)
        assert result.returncode == 0

    def test_error_operational_exits_1(self):
        """Error in operational mode should exit 1."""
        code = f"""
import sys
sys.path.insert(0, {SCRIPTS_LIB_PATH!r})
from script_runner import run

def main(ctx):
    raise RuntimeError('something broke')

run('test', main, mode='operational')
"""
        result = self._run_script(code)
        assert result.returncode == 1

    def test_error_diagnostic_exits_0(self):
        """Error in diagnostic mode should exit 0."""
        code = f"""
import sys
sys.path.insert(0, {SCRIPTS_LIB_PATH!r})
from script_runner import run

def main(ctx):
    raise RuntimeError('something broke')

run('test', main, mode='diagnostic')
"""
        result = self._run_script(code)
        assert result.returncode == 0

    def test_keyboard_interrupt_exits_130(self):
        """KeyboardInterrupt in main should exit 130."""
        code = f"""
import sys
sys.path.insert(0, {SCRIPTS_LIB_PATH!r})
from script_runner import run

def main(ctx):
    raise KeyboardInterrupt()

run('test', main)
"""
        result = self._run_script(code)
        assert result.returncode == 130

    def test_sys_exit_remapped_in_diagnostic(self):
        """sys.exit(1) in diagnostic mode should be remapped to exit 0."""
        code = f"""
import sys
sys.path.insert(0, {SCRIPTS_LIB_PATH!r})
from script_runner import run

def main(ctx):
    sys.exit(1)

run('test', main, mode='diagnostic')
"""
        result = self._run_script(code)
        assert result.returncode == 0

    def test_ci_mode_debug_shows_traceback(self):
        """CI mode with --debug flag should show traceback in stderr."""
        code = f"""
import sys
sys.path.insert(0, {SCRIPTS_LIB_PATH!r})
from script_runner import run

def main(ctx):
    raise RuntimeError('debug error')

run('test', main, mode='ci')
"""
        result = self._run_script(code, args=['--debug'])
        assert result.returncode == 1
        assert 'Traceback' in result.stderr
        assert 'debug error' in result.stderr

    def test_ci_mode_no_debug_no_traceback(self):
        """CI mode without --debug should NOT show traceback in stderr."""
        code = f"""
import sys
sys.path.insert(0, {SCRIPTS_LIB_PATH!r})
from script_runner import run

def main(ctx):
    raise RuntimeError('quiet error')

run('test', main, mode='ci')
"""
        result = self._run_script(code)
        assert result.returncode == 1
        assert 'Traceback' not in result.stderr
        assert 'quiet error' in result.stderr
