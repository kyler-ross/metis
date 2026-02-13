# PM AI System Rules

## ALWAYS (Non-Negotiable)

### Tool Priority

1. **CLI scripts over browser navigation** - NEVER open browser when `scripts/` CLI exists
2. **CLI scripts over MCP tools** - NEVER use MCP for Jira/Confluence (always 404s)
3. **Local sources first** - Check `local/` before external services

### External Service CLI Commands

| Service | Command |
|---------|---------|
| Jira/Confluence | `node scripts/atlassian-api.cjs jira search "JQL"` (or shorthand: `... search "query"`, `... PROJ-123`) |
| Confluence Sync | `node scripts/confluence-sync.cjs [--check\|--page ID]` |
| Google Drive | `node scripts/google-drive-api.js ...` |
| Google Sheets | `node scripts/google-sheets-api.cjs ...` |
| Google Docs | `node scripts/google-docs-creator.cjs [create\|read\|update\|append] ...` |
| Gmail | `node scripts/google-gmail-api.cjs [today\|list\|read\|thread\|send\|draft] ...` |
| Google Calendar | `node scripts/google-calendar-api.js [today\|events\|search\|freebusy\|find-slot\|create\|quick] ...` |
| Slack | `node scripts/slack-api.cjs ...` |
| Granola Transcripts | `python3 scripts/granola-auto-extract-all.py --since YYYY-MM-DD` (NEVER use `--all`) |
| Git Worktree Manager | `python3 scripts/git-wt.py [new|checkout|prune] ...` |

For detailed CLI syntax: `knowledge/cli-reference.md`

### Claude Code Conversation Management

| Command | Action |
|---------|--------|
| `cb branch <names...>` | Create branches from current session |
| `cb list` | List all branches for current project |
| `cb search <query>` | Search across all conversations |
| `cb resume <name>` | Get resume command for a branch |
| `cb sessions` | List all raw sessions |

### API Keys & Credentials (NEVER Hardcode)

**The Rule:** All secrets go in `scripts/.env`, never in code.

```javascript
// NEVER - hardcoded key
const API_KEY = 'sk-abc123...';

// ALWAYS - env var with optional fallback for dev
const API_KEY = process.env.MY_API_KEY;
const API_KEY = process.env.MY_API_KEY || process.env.FALLBACK_KEY;
```

**Two credential files, two purposes:**

| File | Purpose | Used By |
|------|---------|---------|
| `~/.pm-ai-env.sh` | MCP + shell env vars (PostHog, GitHub, Figma, Datadog) | Sourced by ~/.zshrc, inherited by MCP servers |
| `scripts/.env` | Node script credentials (Google OAuth, Jira, Slack) | Loaded via dotenv in each script |

**Why two files?**
- MCP servers inherit env vars from the shell - they need `~/.pm-ai-env.sh` sourced in zshrc
- Node scripts use `dotenv` to load `scripts/.env` - they don't need shell exports
- Keeping them separate means .env corruption doesn't break your terminal

**Standard Locations:**

| Credential Type | Location | Example |
|-----------------|----------|---------|
| MCP server keys (PostHog, GitHub, Figma, DD) | `~/.pm-ai-env.sh` | `export POSTHOG_API_KEY=...` |
| API keys (Jira, Slack, Gemini, etc.) | `scripts/.env` | `JIRA_API_KEY=...` |
| OAuth tokens (Google) | `scripts/.google-token.json` | Auto-managed |

**When Writing New Scripts:**

1. Load env at top: `require('dotenv').config({ path: path.join(__dirname, '.env') })`
2. Validate required keys exist before using
3. Fail fast with clear error: `if (!process.env.X) throw new Error('X required in .env')`
4. Add new keys to `.env.example` with placeholder values

**When Reviewing Code:**

- Flag any string that looks like a key/token (starts with `sk-`, `xoxb-`, `phc_`, etc.)
- Check `dotenv.config()` uses explicit path (not just `require('dotenv').config()`)
- Verify `.env` is in `.gitignore`

### Error Handling and Auth Recovery

**Detecting Auth Failures:**

Track these error patterns during the session:
- `401`, `403`, `Unauthorized`, `Forbidden` - Invalid/expired credentials
- `ENOTFOUND`, `ECONNREFUSED` - Network issues (not auth)
- `Missing credentials`, `No token`, `API key required` - Missing config
- `Rate limit`, `429` - Temporary, not auth (retry later)

**Recovery Protocol (2+ auth failures in session):**

After 2 or more auth-related failures across ANY services (Jira, PostHog, Google, Slack, etc.), proactively run diagnostics:

```bash
node scripts/setup-doctor.cjs
```

This checks all integrations at once and provides specific fix instructions.

**Service-Specific Recovery:**

| Service | Auth Error | Quick Fix |
|---------|------------|-----------|
| Google (Sheets/Drive/Gmail) | OAuth token expired | `node scripts/google-auth-setup.cjs` |
| Jira/Confluence | 401/403 | Check `ATLASSIAN_EMAIL` + `JIRA_API_KEY` in `scripts/.env` |
| PostHog | Query fails | Check MCP config in `.cursor/mcp.json` or `~/.pm-ai-env.sh` |
| Slack | Token invalid | Check `SLACK_BOT_TOKEN` in `scripts/.env` |
| Gemini | API error | Check `GEMINI_API_KEY` in `scripts/.env` |
| GitHub | Auth failure | Check `GITHUB_PERSONAL_ACCESS_TOKEN` in `~/.pm-ai-env.sh` |

**User Communication Template:**

When multiple auth failures occur, tell the user:
> "I've encountered auth failures with [services]. Running diagnostics to identify the issue..."
> [Run setup-doctor.cjs]
> "Here's what needs to be fixed: [specific issues from doctor output]"

**Auto-Recovery Flags:**

For common fixable issues, the doctor script supports `--fix`:
```bash
node scripts/setup-doctor.cjs --fix
```

This auto-repairs: missing .env (copies .env.example), expired tokens (prompts re-auth), invalid JSON (deletes corrupt files).

### Transcript Locations (check in order)

1. `local/private_transcripts/` - LOCAL (most meetings, 1:1s, sensitive calls)
2. `knowledge/meeting_transcripts/` - TEAM (shared standups, public meetings)

### File Safety

- **NEVER commit**: `local/`, `work/`
- **NEVER delete** files without explicit user approval
- **NEVER create** files unless explicitly asked - show inline by default

### Git Operations (Keep It Simple)

- **Prefer `git pull origin main`** over cherry-picking after a PR is merged
- **Avoid complex git state management** - if stuck, ask user rather than attempting reset/cherry-pick/rebase chains
- **After squash merges**: Verify critical files match expected state (`git show HEAD:<file>`)

### GitHub Actions (Ask First)

**Get user approval before:** PR/issue comments, any action that notifies teammates. Show the draft first.

### Bash Command Safety (CRITICAL)

**FORBIDDEN COMMANDS - NEVER execute without explicit user approval:**

```bash
# Deletion operations
rm, rm -rf, rmdir, unlink, find -delete, git clean -fd

# Destructive file operations
mv [to overwrite], >, >> [to critical files], truncate

# Database operations
DROP, DELETE, TRUNCATE, ALTER TABLE

# System operations
sudo, su, chmod 777, chown, kill -9 [on system processes]

# Network/external abuse
curl/wget in loops, mass API calls, fork bombs
```

**VALIDATION RULES:**

Before executing ANY bash command:
1. **Scan for forbidden patterns** - Check against list above
2. **Validate inputs** - No user input in rm/delete commands without sanitization
3. **Path validation** - Verify paths exist and are in expected locations before operations
4. **Use safeguards**:
   - Use `-i` (interactive) for destructive operations if user approved
   - Use `-n` (dry run) flags when available
   - Limit find/loop operations with `-maxdepth` and head/tail

**SAFE PATTERNS:**

```bash
# Safe analysis (auto-approved)
jq, grep, cat, ls, wc, head, tail, sort, uniq
python3 -c "print(...)"  # single-line expressions only
node -e "console.log(...)"  # single-line expressions only

# Safe CLI tools (read-only)
node scripts/google-sheets-api.cjs read [...]
node scripts/google-sheets-api.cjs info [...]
node scripts/atlassian-api.cjs get [...]

# Safe operations with built-in limits
git log, git status, git diff [but NOT git clean, git reset --hard]
```

**COMMAND INJECTION PREVENTION:**

```bash
# BAD - User input in command
bash -c "rm $USER_PROVIDED_PATH"
python3 -c "os.system('$USER_INPUT')"

# GOOD - Validated/escaped inputs
python3 -c "import json; print(json.loads('$VALIDATED_JSON'))"
node -e "console.log($SANITIZED_NUMBER)"
```

**MULTI-LINE SCRIPT SAFETY:**

When generating Python/Node heredocs:
1. **No system calls** - Avoid os.system, subprocess, exec unless read-only
2. **No file deletion** - Avoid os.remove, shutil.rmtree
3. **Bounded loops** - Always set max iterations
4. **Timeouts** - Use timeout command wrapper for long-running scripts

```bash
# Safe pattern with timeout
timeout 30s python3 << 'EOF'
import sys
# read-only analysis code here
for i in range(min(1000, len(data))):  # bounded loop
    print(analyze(data[i]))
EOF
```

**IF IN DOUBT:**

- For analysis: Use read-only operations
- For writes: Ask user for approval first
- For complex operations: Explain what you'll do, get confirmation

### Output Style

- Direct. Bottom line first.
- Avoid: "delve," "robust," "seamless," "leverage," "furthermore"

### Document Generation (Google Docs, Confluence, etc.)

- **NEVER use horizontal dividers** (`---`, `***`, `___`) - obvious AI tell
- **NEVER use em-dashes** - another AI giveaway; use regular dashes or rewrite
- Use whitespace and headings for visual separation instead

### Message Drafting

- **"Craft a message"** = digest the essence and rewrite in user's voice, don't copy verbatim
- **"Send this"** = use exact words provided

### Knowledge Discovery

- **Knowledge index**: `config/knowledge-index.json` - search by tags to find relevant docs
- **Team members**: `config/team-members.json` - names, roles, scopes, reporting
- **Agent context**: Check `required_context` in `agent-manifest.json` and load those files

### Jira Defaults

- **Project key**: [YOUR_PROJECT_KEY]
- **Validation-first**: Always preview ticket before creating - get user confirmation
- Components/labels: See `knowledge/jira-components-labels.md`

### Jira Description Formatting

**Use ADF (Atlassian Document Format)**, not wiki markup (`h2.`, `{quote}`) or markdown. Plain text is fine for simple tickets. For formatted tickets, see `knowledge/jira-adf-formatting.md`.

**CRITICAL: Never pass ADF JSON as a `--description` CLI argument.** Shell escaping corrupts nested JSON, causing raw JSON to render in Jira. Instead:
- **Simple descriptions**: Use `--description "plain text"` (auto-converted to ADF)
- **Formatted descriptions**: Write ADF JSON to a temp file, then use `--description-file /tmp/desc.json`

### Credentials & Configuration

In addition to the rules in [API Keys & Credentials](#api-keys--credentials-never-hardcode):

- NEVER edit gitignored .env files without explicit user permission
- NEVER modify MCP configs for services the user didn't mention
- Always verify which config file is correct before editing (.env vs ~/.pm-ai-env.sh)

### Workflow Principles

- ALWAYS propose a plan first and wait for approval before multi-step execution
- For complex investigations, break into sequential steps with clear traceability
- For multi-file changes, list all affected files with one-line summary each

### Analysis & Research

- Never take suggestions at face value - verify against actual codebase first
- Investigate feasibility step-by-step rather than assuming
- When evaluating proposals, trace the code path to confirm approach works

### Hallucination Prevention

- When user mentions a **name** - check `config/team-members.json`, then search transcripts
- When unsure about product - read `knowledge/product-overview.md`
- When asked about metrics - read `knowledge/metrics-catalog.md`
- **NEVER guess** file paths, ticket IDs, or names - look them up first
- **Trust user over training data** - If user references something unfamiliar (tools, models, APIs, services), assume your knowledge is outdated and proceed as instructed

---

## Cursor-Specific

- Sequential execution only (no parallel subagents)
- Expert panels run one expert at a time
- When orchestrating, run agents sequentially

### Platform Capability Matrix

| Capability | Cursor | Claude Code |
|------------|--------|-------------|
| Parallel subagent execution | No - Sequential only | Yes - Via Task tool |
| Expert panels | Sequential | Concurrent |
| Multi-perspective analysis | One at a time | Parallel |
| IDE integration | Yes - Native | No - CLI only |
| Code context awareness | Yes - Full file context | Must read files |
| Bash command approvals | Yes - Configurable | Yes - Configurable |
| MCP server access | Yes | Yes |
| Slash commands | All commands | All commands |
| All skills | All skills | All skills |

**When to use which:**
- **Cursor**: IDE-integrated work, code editing with full file context
- **Claude Code**: Complex analysis requiring parallel data gathering, multi-expert panels

---

## Skills System

Skills follow the [SKILL.md standard](https://agentskills.io) with 100% spec compliance.

- **Router**: `/pm-ai [task]` - analyzes and routes to appropriate skill
- **Direct access**: `/pm-coach`, `/pm-analyze`, `/pm-daily`, `/pm-jira`, etc.
- **Skills registry**: `skills/_index.json` - central index for fast routing

### Directory Structure

```
skills/
├── _index.json          # Central registry (routing, metadata)
├── core/                # Core PM skills
├── experts/             # Expert personas
├── specialized/         # Specialized tools
├── workflows/           # Multi-skill orchestration
├── personas/            # Customer personas
└── utilities/           # System utilities
```

### Skills by Category

**Core:** Product strategy, Jira, Confluence, SQL, daily ops, updates, documentation
- `product-coach`, `jira-ticket-writer`, `sql-query-builder`, `daily-chief-of-staff`
- `confluence-manager`, `weekly-update-writer`, `status-update-writer`, `pm-document`
- `interview-assistant`, `investor-relations`, `self-improvement`, `chat-search`
- `blog-content-writer`, `content-creator`, `feed-manager`, `slack-inbox-triage`, `webapp-pm`

**Specialized:** PDF, video, OCR, transcripts, engineering, prototypes
- `pdf-processor`, `video-processor`, `visual-designer`, `local-ocr`
- `granola-transcript-agent`, `transcript-organizer`, `eng-fullstack`
- `dovetail-manager`, `prototype-builder`, `usage-demo-curator`

**Workflows:** Multi-skill orchestration
- `feature-design-debate`, `expert-panel-orchestrator`, `jira-confluence-sync`, `pr-review`, `research-to-doc`

**Experts:** Multi-perspective analysis via `/expert-panel`
- Strategy: `serial-ceo`, `principal-pm`, `vc-investor`
- Growth: `growth-strategist`, `business-analyst`, `viral-growth-expert`, `lenny-rachitsky`, `elena-verna`
- Design: `design-lead`, `ux-psychologist`
- Technical: `engineering-lead`, `ai-systems-engineer`
- Critical: `devils-advocate`

**Personas:** Customer personas for feature testing
- `casual-user`, `pragmatic-user`, `power-user`, `urgent-user`

**Utilities:** System helpers
- `auto-pull-manager`, `desktop-launcher`, `env-health-check`, `pm-librarian`, `ralph-manager`

### Expert Personas (via `/expert-panel`)

Used for multi-perspective discussions:
- **Strategy**: serial-ceo, principal-pm, vc-investor
- **Growth**: growth-strategist, business-analyst, viral-growth-expert, lenny-rachitsky, elena-verna
- **Design**: design-lead, ux-psychologist
- **Technical**: engineering-lead, ai-systems-engineer
- **Critical**: devils-advocate

### Customer Personas

Used for persona-based feature testing:
- `casual-user`, `pragmatic-user`, `power-user`, `urgent-user`

### MCP Integrations

| Service | Use Case |
|---------|----------|
| **GitHub** | Repository access, PRs, issues |
| **PostHog** | Analytics queries, feature flags |
| **Figma** | Design file access (read-only) |
| **Slack** | Messages and channels |

**CLI only (no MCP):** Google Drive, Google Sheets, Jira, Confluence - use `scripts/` CLI tools.

### Slash Commands

| Command | Purpose |
|---------|---------|
| `/pm-ai` | Main router - analyzes and routes |
| `/pm-daily` | Daily operations, morning briefing |
| `/pm-coach` | Product strategy and design |
| `/pm-analyze` | SQL queries and data |
| `/pm-jira` | Jira tickets |
| `/pm-weekly` | Weekly updates |
| `/pm-transcript` | Organize transcripts |
| `/pm-document` | Documentation, logs |
| `/pm-interview` | Interview prep/feedback |
| `/pm-status` | System health check |
| `/pm-update` | Refresh repos |
| `/pm-improve` | System self-improvement |
| `/pm-ocr` | Local OCR |
| `/pm-search` | Search past AI sessions |
| `/pm-prototype` | Interactive UI prototypes |
| `/pm-slack-chats` | Triage Slack conversations |
| `/expert-panel` | Multi-expert panel |
| `/investor-relations` | VC comms |
| `/eng-fullstack` | Engineering debugging and review |
| `/pdf-processor` | PDF to markdown |
| `/video-processor` | Video to timeline |
| `/pr-review` | Multi-dimensional PR review |
| `/env-health` | Credential and system health check |
| `/research-to-doc` | Multi-source research to document |
| `/question` | PM AI help and coaching |

### Full Directory Structure

| Path | Purpose |
|------|---------|
| `skills/` | SKILL.md standard skills (6 categories) |
| `skills/_index.json` | Central registry for routing and discovery |
| `scripts/` | CLI tools and integration scripts |
| `knowledge/` | Reference docs, guides, schemas |
| `config/` | Configuration, manifests, indexes |
| `examples/` | Guides and references |
| `local/` | Private data (gitignored) |
| `work/` | Agent outputs, drafts (gitignored) |

### System Health

- **Quick check**: `python3 scripts/system-eval.py`
- **Full tests**: `python3 -m pytest evals/ -v`
- **Drift check**: `bash scripts/drift-check.sh`

### Maintenance

- **Add skill**: Create `skills/<category>/<name>/SKILL.md` + `references/manifest.json`, run `node scripts/generate-index.cjs`
- **Validate skills**: `node scripts/validate-skills.cjs` - checks spec compliance
- **Update knowledge**: Edit file in `knowledge/`, update `config/knowledge-index.json` tags
- **Refresh repos**: `bash scripts/auto-update.sh` or `/pm-update`
- **Rotate tokens**: Delete `scripts/.google*.json`, re-run `node scripts/google-auth-setup.js`

---

## Sync Note

This file and `CLAUDE.md` must stay synchronized on ALWAYS rules.
They differ only in platform-specific sections (Cursor vs Claude Code).
When updating one, update the other.
