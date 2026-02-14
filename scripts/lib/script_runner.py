#!/usr/bin/env python3
"""
Script Runner - Python equivalent of script-runner.cjs

Provides structured error handling and output for Python PM AI scripts.
Simpler than the Node version - wraps main() in try/except with:
- Structured error output to stderr
- Exit 0 for diagnostic mode (issues in output, not exit code)
- Exit 1 only for operational mode on unrecoverable errors
- Consistent error formatting

Usage:
    from lib.script_runner import run

    def main(ctx):
        # ctx.args - parsed argv (list)
        # ctx.log.info/warn/error - structured output
        # ctx.mode - 'diagnostic', 'operational', or 'ci'
        results = check_stuff()
        ctx.report(results)

    run(
        name='watchdog',
        mode='diagnostic',
        main=main,
    )
"""

import asyncio
import json
import os
import sys
import traceback
from datetime import datetime


class Colors:
    """ANSI color codes, disabled when stderr is not a TTY."""
    _is_tty = hasattr(sys.stderr, 'isatty') and sys.stderr.isatty()

    RED = '\033[31m' if _is_tty else ''
    YELLOW = '\033[33m' if _is_tty else ''
    GREEN = '\033[32m' if _is_tty else ''
    DIM = '\033[2m' if _is_tty else ''
    BOLD = '\033[1m' if _is_tty else ''
    RESET = '\033[0m' if _is_tty else ''


class Logger:
    """Structured logger - all output to stderr."""

    def __init__(self, json_mode=False):
        self.json_mode = json_mode

    def _write(self, level, message, meta=None):
        meta = meta or {}
        if self.json_mode:
            entry = {'level': level, 'message': message, **meta, 'timestamp': datetime.now().isoformat()}
            print(json.dumps(entry), file=sys.stderr)
            return

        prefixes = {
            'error': f'{Colors.RED}[ERROR]{Colors.RESET}',
            'warn': f'{Colors.YELLOW}[WARN]{Colors.RESET}',
            'info': f'{Colors.DIM}[INFO]{Colors.RESET}',
        }
        prefix = prefixes.get(level, f'[{level.upper()}]')
        service = meta.get('service')
        if service:
            line = f'{prefix} {Colors.DIM}({service}){Colors.RESET} {message}'
        else:
            line = f'{prefix} {message}'

        print(line, file=sys.stderr)

        recovery = meta.get('recovery')
        if recovery:
            for step in recovery:
                print(f'  -> {step}', file=sys.stderr)

    def info(self, message, **meta):
        self._write('info', message, meta)

    def warn(self, message, **meta):
        self._write('warn', message, meta)

    def error(self, message, **meta):
        self._write('error', message, meta)


def categorize_error(err):
    """Categorize a Python exception into type and retryability."""
    msg = str(err).lower()

    # isinstance checks first - these are more specific than message matching
    if isinstance(err, ConnectionError):
        return {'type': 'network_error', 'category': 'network', 'retryable': True}
    if isinstance(err, TimeoutError):
        return {'type': 'timeout', 'category': 'network', 'retryable': True}
    if isinstance(err, FileNotFoundError):
        return {'type': 'filesystem_error', 'category': 'system', 'retryable': False}
    if isinstance(err, PermissionError):
        return {'type': 'permission_error', 'category': 'system', 'retryable': False}
    if isinstance(err, (json.JSONDecodeError, ValueError)):
        return {'type': 'parse_error', 'category': 'data', 'retryable': False}

    # Message-based matching for generic exceptions
    if any(p in msg for p in ('401', '403', 'unauthorized', 'forbidden', 'auth fail', 'auth error', 'authentication failed', 'invalid_auth', 'not_authed')):
        return {'type': 'auth_failure', 'category': 'auth', 'retryable': False}
    if any(k in msg for k in ('429', 'rate limit', 'too many requests')):
        return {'type': 'rate_limit', 'category': 'throttle', 'retryable': True}
    if any(k in msg for k in ('timeout', 'timed out')):
        return {'type': 'timeout', 'category': 'network', 'retryable': True}
    if any(k in msg for k in ('connection', 'econnrefused', 'enotfound', 'network')):
        return {'type': 'network_error', 'category': 'network', 'retryable': True}
    if any(k in msg for k in ('404', 'not found')):
        return {'type': 'not_found', 'category': 'client', 'retryable': False}
    if any(k in msg for k in ('500', 'server error', '502', '503')):
        return {'type': 'server_error', 'category': 'server', 'retryable': True}

    return {'type': 'unknown_error', 'category': 'unknown', 'retryable': False}


# Basic recovery guidance (subset of the Node version)
RECOVERY_GUIDANCE = {
    'auth_failure': {
        'default': ['Check your API credentials', 'Run /pm-setup to reconfigure'],
        'google': ['Run: node .ai/scripts/google-auth-setup.cjs', 'Check GOOGLE_CLIENT_ID in .env'],
        'jira': ['Verify ATLASSIAN_EMAIL and JIRA_API_KEY in .env', 'Generate new token at id.atlassian.com'],
        'granola': ['Run: node .ai/scripts/granola-auth.cjs refresh', 'Check Granola token validity'],
    },
    'rate_limit': {
        'default': ['Wait 60 seconds before retrying', 'Reduce request frequency'],
    },
    'timeout': {
        'default': ['Retry the request', 'Check service status'],
    },
    'network_error': {
        'default': ['Check internet connection', 'Verify DNS resolution'],
    },
    'not_found': {
        'default': ['Verify the resource ID/path is correct', 'Check access permissions'],
    },
    'filesystem_error': {
        'default': ['Check file/directory exists', 'Verify permissions'],
    },
    'parse_error': {
        'default': ['Check input data format', 'Verify API response format'],
    },
}


def get_recovery(error_type, service=None):
    """Get recovery guidance for an error type and optional service."""
    type_guidance = RECOVERY_GUIDANCE.get(error_type, {})
    if service and service in type_guidance:
        return type_guidance[service]
    return type_guidance.get('default', ['Check error details and retry'])


class Context:
    """Script execution context passed to the main function."""

    def __init__(self, name, mode, args, log):
        self.name = name
        self.mode = mode
        self.args = args
        self.log = log

    def report(self, results, title=None):
        """Report diagnostic results.

        Note: This intentionally duplicates structured-output.cjs report() logic.
        Keep both in sync when changing the report format.
        """
        errors = results.get('errors', [])
        warnings = results.get('warnings', [])
        ok = results.get('ok', [])

        json_mode = '--json' in self.args

        if json_mode:
            status = 'error' if errors else ('warning' if warnings else 'ok')
            output = {
                'status': status,
                'errors': errors,
                'warnings': warnings,
                'ok': ok,
                'summary': {
                    'error_count': len(errors),
                    'warning_count': len(warnings),
                    'ok_count': len(ok),
                },
            }
            print(json.dumps(output, indent=2))
            return

        if title:
            print(f'\n{Colors.BOLD}{title}{Colors.RESET}', file=sys.stderr)

        for e in errors:
            msg = e if isinstance(e, str) else e.get('message', str(e))
            svc = e.get('service') if isinstance(e, dict) else None
            rec = e.get('recovery') if isinstance(e, dict) else None
            self.log.error(msg, service=svc, recovery=rec)

        for w in warnings:
            msg = w if isinstance(w, str) else w.get('message', str(w))
            svc = w.get('service') if isinstance(w, dict) else None
            rec = w.get('recovery') if isinstance(w, dict) else None
            self.log.warn(msg, service=svc, recovery=rec)

        for o in ok:
            msg = o if isinstance(o, str) else o.get('message', str(o))
            print(f'{Colors.GREEN}[OK]{Colors.RESET} {msg}', file=sys.stderr)

        parts = []
        if errors:
            parts.append(f'{Colors.RED}{len(errors)} error{"s" if len(errors) != 1 else ""}{Colors.RESET}')
        if warnings:
            parts.append(f'{Colors.YELLOW}{len(warnings)} warning{"s" if len(warnings) != 1 else ""}{Colors.RESET}')
        if ok:
            parts.append(f'{Colors.GREEN}{len(ok)} ok{Colors.RESET}')

        print(f'\n{", ".join(parts)}', file=sys.stderr)


def run(name, main, mode='operational', services=None):
    """
    Run a script with structured error handling.

    Args:
        name: Script name for error reporting
        main: Main function - receives Context object
        mode: 'diagnostic' (always exit 0), 'operational' (exit 1 on failure), 'ci' (exit 1 on any error)
        services: List of required service names (for future auth checking)
    """
    json_mode = '--json' in sys.argv
    logger = Logger(json_mode=json_mode)

    ctx = Context(
        name=name,
        mode=mode,
        args=sys.argv[1:],
        log=logger,
    )

    try:
        result = main(ctx)
        if asyncio.iscoroutine(result):
            asyncio.run(result)
        sys.exit(0)
    except KeyboardInterrupt:
        logger.warn('Interrupted by user')
        sys.exit(130)
    except SystemExit as e:
        exit_code = e.code if isinstance(e.code, int) else 1
        if exit_code == 0:
            sys.exit(0)
        if mode == 'diagnostic':
            print(f"[DIAG] Script exited with code {exit_code} (suppressed in diagnostic mode)", file=sys.stderr)
            sys.exit(0)
        sys.exit(exit_code)
    except Exception as err:
        cat = categorize_error(err)
        recovery = get_recovery(cat['type'], services[0] if services else None)

        if json_mode:
            error_output = {
                'status': 'error',
                'error': {
                    'type': cat['type'],
                    'category': cat['category'],
                    'message': str(err),
                    'retryable': cat['retryable'],
                    'recovery': recovery,
                },
            }
            print(json.dumps(error_output, indent=2))
        else:
            type_label = cat['type']
            if services:
                type_label += f' ({services[0]})'
            logger.error(f'{type_label}: {err}', recovery=recovery)

            # Show traceback in CI mode only when --debug or --verbose is passed
            if mode == 'ci':
                if '--debug' in sys.argv or '--verbose' in sys.argv:
                    traceback.print_exc(file=sys.stderr)

        if mode == 'diagnostic':
            sys.exit(0)
        else:
            sys.exit(1)
