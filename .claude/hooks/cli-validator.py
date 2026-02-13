#!/usr/bin/env python3
"""
PreToolUse hook that validates CLI commands for PM AI scripts.
Blocks malformed commands with helpful error messages.
"""
import json
import re
import sys

# CLI command schemas: { command: { args: [...], required: [...], examples: [...] } }
CLI_SCHEMAS = {
    "google-sheets-api": {
        "read": {
            "args": ["spreadsheet_id", "range"],
            "required": ["spreadsheet_id", "range"],
            "example": 'read SPREADSHEET_ID "Sheet1!A1:B10"'
        },
        "write": {
            "args": ["spreadsheet_id", "range", "value"],
            "required": ["spreadsheet_id", "range", "value"],
            "example": 'write SPREADSHEET_ID "Sheet1!B16" "0.45"'
        },
        "update": {
            "args": ["spreadsheet_id", "range", "json_array"],
            "required": ["spreadsheet_id", "range", "json_array"],
            "example": 'update SPREADSHEET_ID "Sheet1!A1:B2" \'[["a","b"],["c","d"]]\''
        },
        "info": {
            "args": ["spreadsheet_id"],
            "required": ["spreadsheet_id"],
            "example": "info SPREADSHEET_ID"
        },
        "create-tab": {
            "args": ["spreadsheet_id", "tab_name", "index?"],
            "required": ["spreadsheet_id", "tab_name"],
            "example": 'create-tab SPREADSHEET_ID "NewTab"'
        },
        "write-table": {
            "args": ["spreadsheet_id", "tab", "row", "col", "json"],
            "required": ["spreadsheet_id", "tab", "row", "col", "json"],
            "example": 'write-table SPREADSHEET_ID "Sheet1" 0 0 \'{"headers":["A","B"],"data":[[1,2]]}\''
        },
        "append": {
            "args": ["spreadsheet_id", "range", "json_array"],
            "required": ["spreadsheet_id", "range", "json_array"],
            "example": 'append SPREADSHEET_ID "Sheet1!A:B" \'[["new","row"]]\''
        },
    },
    "google-drive-api": {
        "list": {
            "args": ["query?"],
            "required": [],
            "example": 'list "name contains \'budget\'"'
        },
        "search": {
            "args": ["text"],
            "required": ["text"],
            "example": 'search "quarterly report"'
        },
        "info": {
            "args": ["file_id"],
            "required": ["file_id"],
            "example": "info FILE_ID"
        },
        "cat": {
            "args": ["file_id"],
            "required": ["file_id"],
            "example": "cat FILE_ID"
        },
        "ls": {
            "args": ["folder_id"],
            "required": ["folder_id"],
            "example": "ls FOLDER_ID"
        },
    },
    "atlassian-api": {
        "jira": {
            "subcommands": {
                "get": {
                    "args": ["ticket_key"],
                    "required": ["ticket_key"],
                    "example": "jira get PROJ-1234"
                },
                "search": {
                    "args": ["jql"],
                    "required": ["jql"],
                    "example": 'jira search "project=PROJ AND status=Open"'
                },
                "create-ticket": {
                    "args": ["--project", "--type", "--summary", "--description?"],
                    "required": ["--project", "--type", "--summary"],
                    "example": 'jira create-ticket --project PROJ --type Story --summary "Title"'
                },
                "update": {
                    "args": ["ticket_key", "field", "value"],
                    "required": ["ticket_key", "field", "value"],
                    "example": 'jira update PROJ-1234 summary "New title"'
                },
                "comment": {
                    "args": ["ticket_key", "comment_text"],
                    "required": ["ticket_key", "comment_text"],
                    "example": 'jira comment PROJ-1234 "This is a comment"'
                },
            }
        },
        "confluence": {
            "subcommands": {
                "get": {
                    "args": ["page_id"],
                    "required": ["page_id"],
                    "example": "confluence get 123456"
                },
                "search": {
                    "args": ["cql"],
                    "required": ["cql"],
                    "example": 'confluence search "space=TEAM AND title~meeting"'
                },
            }
        }
    }
}

# Wiki markup patterns that agents incorrectly use instead of ADF
WIKI_MARKUP_PATTERNS = [
    (r'\bh[1-6]\.', 'h1./h2./etc - use ADF heading nodes instead'),
    (r'\{quote\}', '{quote} - use ADF blockquote nodes instead'),
    (r'\{code[:\}]', '{code} - use ADF codeBlock nodes instead'),
    (r'\[\~[^\]]+\]', '[~user] mentions - use ADF mention nodes instead'),
]


def detect_wiki_markup_in_jira(command: str) -> list[str]:
    """Detect wiki markup patterns in Jira create/update commands."""
    issues = []

    # Only check jira create/update commands with --description
    if 'atlassian-api' not in command or 'jira' not in command:
        return issues
    if 'create' not in command and 'update' not in command:
        return issues

    # Extract description content (handles heredoc and quoted strings)
    desc_match = re.search(r'--description\s+["\'](.+?)["\']', command, re.DOTALL)
    if not desc_match:
        # Try heredoc pattern
        desc_match = re.search(r'--description\s+"\$\(cat <<[\'"]?EOF[\'"]?\n(.+?)\nEOF\s*\)"', command, re.DOTALL)
    if not desc_match:
        return issues

    description = desc_match.group(1)

    for pattern, message in WIKI_MARKUP_PATTERNS:
        if re.search(pattern, description, re.MULTILINE):
            issues.append(f"Wiki markup detected in Jira description: {message}")

    if issues:
        issues.append("Jira requires ADF format. See: knowledge/jira-adf-formatting.md")

    return issues


# Common mistakes and their fixes
COMMON_MISTAKES = [
    # GitHub: when searching issues/PRs across repos, scope to your org first
    # But allow local repo operations (pr create, pr view, pr list without --repo)
    {
        "pattern": r"gh\s+search\s+(issues|prs|repos)",
        "check": lambda cmd: "--owner=your-org" not in cmd.lower() and "your-org" not in cmd.lower(),
        "message": "When searching GitHub, include your org. Use: gh search prs --owner=your-org 'query'"
    },
    # GitHub: prevent creating PRs to wrong repo (only if --repo flag points elsewhere)
    {
        "pattern": r"gh\s+pr\s+create\s+.*--repo\s+",
        "check": lambda cmd: "--repo" in cmd and "your-org" not in cmd.lower(),
        "message": "PR target repo should be your org. Use: gh pr create --repo your-org/repo or omit --repo for current repo"
    },
    # Sheets: missing spreadsheet ID
    {
        "pattern": r"google-sheets-api\.cjs\s+(read|write|update|info)\s*$",
        "check": lambda cmd: True,
        "message": "Missing spreadsheet_id. Example: google-sheets-api.cjs read SPREADSHEET_ID 'Sheet1!A1:B10'"
    },
    # Sheets: using sheet name instead of ID (except for 'create' which doesn't need an ID)
    {
        "pattern": r"google-sheets-api\.cjs\s+(?!create\b)\w+\s+['\"]?[A-Za-z\s]+['\"]?\s+",
        "check": lambda cmd: not re.search(r"[a-zA-Z0-9_-]{30,}", cmd),
        "message": "First arg must be spreadsheet ID (long alphanumeric), not sheet name. Get ID from URL: docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit"
    },
    # Drive: missing file ID
    {
        "pattern": r"google-drive-api\.cjs\s+(info|cat|download)\s*$",
        "check": lambda cmd: True,
        "message": "Missing file_id. Get ID from URL or use: google-drive-api.cjs list"
    },
    # Atlassian: MCP instead of CLI
    {
        "pattern": r"mcp.*atlassian|mcp.*jira|mcp.*confluence",
        "check": lambda cmd: True,
        "message": "Use CLI instead of MCP for Jira/Confluence (MCP 404s). Use: node scripts/atlassian-api.cjs jira ..."
    },
]


def validate_command(command: str) -> list[str]:
    """Validate a bash command against known patterns. Returns list of issues."""
    issues = []

    for rule in COMMON_MISTAKES:
        if re.search(rule["pattern"], command, re.IGNORECASE):
            if rule["check"](command):
                issues.append(rule["message"])

    return issues


def validate_jql(jql: str) -> list[str]:
    """Validate JQL query syntax. Returns list of issues."""
    issues = []

    # 1. Check balanced parentheses
    paren_depth = 0
    in_string = False
    string_char = None

    for i, char in enumerate(jql):
        # Track string state (ignore parens inside strings)
        if char in ('"', "'") and (i == 0 or jql[i-1] != '\\'):
            if not in_string:
                in_string = True
                string_char = char
            elif char == string_char:
                in_string = False
                string_char = None
            continue

        if not in_string:
            if char == '(':
                paren_depth += 1
            elif char == ')':
                paren_depth -= 1
                if paren_depth < 0:
                    issues.append(f"JQL has unmatched closing parenthesis ')' at position {i}")
                    return issues

    if paren_depth > 0:
        issues.append(f"JQL has {paren_depth} unclosed opening parenthesis '(' - check AND/OR groupings")
    elif paren_depth < 0:
        issues.append(f"JQL has {abs(paren_depth)} extra closing parenthesis ')'")

    # 2. Check for common JQL syntax errors
    # Double operators
    if re.search(r'\b(AND|OR)\s+(AND|OR)\b', jql, re.IGNORECASE):
        issues.append("JQL has consecutive AND/OR operators")

    # Trailing operator
    if re.search(r'\b(AND|OR)\s*$', jql.strip(), re.IGNORECASE):
        issues.append("JQL ends with AND/OR - incomplete query")

    # Leading operator
    if re.search(r'^\s*(AND|OR)\b', jql.strip(), re.IGNORECASE):
        issues.append("JQL starts with AND/OR - incomplete query")

    # Empty IN clause
    if re.search(r'\bIN\s*\(\s*\)', jql, re.IGNORECASE):
        issues.append("JQL has empty IN() clause")

    return issues


def validate_cli_args(command: str) -> list[str]:
    """Validate CLI script arguments."""
    issues = []

    # Extract script and args
    sheets_match = re.search(r"google-sheets-api\.cjs\s+(\w+)\s*(.*)", command)
    drive_match = re.search(r"google-drive-api\.cjs\s+(\w+)\s*(.*)", command)
    atlassian_match = re.search(r"atlassian-api\.cjs\s+(jira|confluence)\s+(\w+)\s*(.*)", command)

    if sheets_match:
        cmd, args = sheets_match.groups()
        schema = CLI_SCHEMAS["google-sheets-api"].get(cmd)
        if schema:
            # Count non-empty args (rough check)
            arg_parts = [a for a in re.split(r'\s+(?=(?:[^"]*"[^"]*")*[^"]*$)', args.strip()) if a]
            required_count = len(schema["required"])
            if len(arg_parts) < required_count:
                issues.append(f"'{cmd}' requires {required_count} args: {', '.join(schema['required'])}. Example: {schema['example']}")

    if drive_match:
        cmd, args = drive_match.groups()
        schema = CLI_SCHEMAS["google-drive-api"].get(cmd)
        if schema:
            arg_parts = [a for a in args.strip().split() if a]
            required_count = len(schema["required"])
            if len(arg_parts) < required_count:
                issues.append(f"'{cmd}' requires {required_count} args: {', '.join(schema['required'])}. Example: {schema['example']}")

    if atlassian_match:
        service, cmd, args = atlassian_match.groups()
        service_schema = CLI_SCHEMAS["atlassian-api"].get(service, {}).get("subcommands", {})
        schema = service_schema.get(cmd)
        if schema:
            # For flag-based commands, check required flags
            if any(arg.startswith("--") for arg in schema["required"]):
                for req_flag in schema["required"]:
                    if req_flag.startswith("--") and req_flag not in args:
                        issues.append(f"Missing required flag: {req_flag}. Example: {schema['example']}")
                        break

        # Validate JQL for jira search commands
        if service == "jira" and cmd in ("search", "jql"):
            jql = extract_quoted_string(args)
            if jql:
                issues.extend(validate_jql(jql))

    # Also check for desire-path shortcut: atlassian-api.cjs search "query"
    shortcut_match = re.search(r"atlassian-api\.cjs\s+(?:search|jql)\s+(.*)", command)
    if shortcut_match and not atlassian_match:
        jql = extract_quoted_string(shortcut_match.group(1))
        if jql:
            issues.extend(validate_jql(jql))

    # Check for wiki markup in Jira descriptions (agents often use wrong format)
    issues.extend(detect_wiki_markup_in_jira(command))

    return issues


# Credential patterns that should never appear in CLI commands
# Minimum lengths harmonized with git-pre-commit.sh to avoid mismatch
CREDENTIAL_PATTERNS = [
    (r'sk-[A-Za-z0-9]{20,}', 'OpenAI API key (sk-...)'),
    (r'sk-ant-[A-Za-z0-9_-]{20,}', 'Anthropic API key (sk-ant-...)'),
    (r'sk-proj-[A-Za-z0-9_-]{20,}', 'OpenAI project key (sk-proj-...)'),
    (r'xoxb-[A-Za-z0-9-]{10,}', 'Slack bot token (xoxb-...)'),
    (r'xoxp-[A-Za-z0-9-]{10,}', 'Slack user token (xoxp-...)'),
    (r'ATATT[A-Za-z0-9]{20,}', 'Atlassian API token (ATATT...)'),
    (r'ghp_[A-Za-z0-9]{36,}', 'GitHub personal access token (ghp_...)'),
    (r'ghu_[A-Za-z0-9]{36,}', 'GitHub user-to-server token (ghu_...)'),
    (r'ghs_[A-Za-z0-9]{36,}', 'GitHub server-to-server token (ghs_...)'),
    (r'AKIA[0-9A-Z]{16}', 'AWS access key (AKIA...)'),
    (r'phc_[A-Za-z0-9]{20,}', 'PostHog API key (phc_...)'),
    (r'AIza[A-Za-z0-9_-]{30,}', 'Google API key (AIza...)'),
    (r'figd_[A-Za-z0-9_-]{20,}', 'Figma token (figd_...)'),
]


def detect_credentials_in_command(command: str) -> list[str]:
    """Detect hardcoded credentials in a bash command. Returns list of issues."""
    issues = []
    for pattern, label in CREDENTIAL_PATTERNS:
        if re.search(pattern, command):
            issues.append(
                f"Hardcoded credential detected: {label}. "
                f"Use environment variables instead. Never pass secrets directly in commands."
            )
    return issues


def extract_quoted_string(text: str) -> str | None:
    """Extract the first quoted string from text, or the whole text if unquoted."""
    text = text.strip()
    if not text:
        return None

    # Try to extract matching single or double quoted string (backreference ensures matching quotes)
    match = re.match(r'^(["\'])(.+)\1$', text, re.DOTALL)
    if match:
        return match.group(2)

    # Try to find a quoted string anywhere (matching quotes)
    match = re.search(r'"([^"]+)"|\'([^\']+)\'', text)
    if match:
        return match.group(1) or match.group(2)

    # Return unquoted text if no quotes found
    return text if text else None


def main():
    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(f"Hook error: Invalid JSON input: {e}", file=sys.stderr)
        sys.exit(1)

    tool_name = input_data.get("tool_name", "")
    tool_input = input_data.get("tool_input", {})
    command = tool_input.get("command", "")

    # Only validate Bash commands
    if tool_name != "Bash" or not command:
        sys.exit(0)

    # Credential detection runs on ALL bash commands (before CLI-specific checks)
    cred_issues = detect_credentials_in_command(command)
    if cred_issues:
        print("CREDENTIAL LEAK BLOCKED:", file=sys.stderr)
        for issue in cred_issues:
            print(f"  - {issue}", file=sys.stderr)
        sys.exit(2)

    # Skip if not a PM AI CLI command or GitHub command
    cli_patterns = ["google-sheets-api", "google-drive-api", "atlassian-api", "gh ", "mcp"]
    if not any(p in command for p in cli_patterns):
        sys.exit(0)

    # Run validations
    issues = validate_command(command)
    issues.extend(validate_cli_args(command))

    if issues:
        print("CLI VALIDATION FAILED:", file=sys.stderr)
        for issue in issues:
            print(f"  - {issue}", file=sys.stderr)
        # Exit 2 blocks tool call, stderr shown to Claude
        sys.exit(2)

    sys.exit(0)


if __name__ == "__main__":
    main()
