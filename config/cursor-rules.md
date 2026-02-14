# Cloaked PM AI System Rules

## ALWAYS (Non-Negotiable)

### Tool Priority

1. **CLI scripts over browser navigation** - NEVER open browser when `.ai/scripts/` CLI exists
2. **CLI scripts over MCP tools** - NEVER use MCP for Jira/Confluence (always 404s)
3. **Local sources first** - Check `.ai/local/` before external services

### External Service CLI Commands

| Service | Command |
|---------|---------|
| Jira/Confluence | `node .ai/scripts/atlassian-api.cjs jira search "JQL"` (or shorthand: `... search "query"`, `... ALL-123`) |
| Confluence Sync | `node .ai/scripts/confluence-sync.cjs [--check\|--page ID]` |
| Google Drive | `node .ai/scripts/google-drive-api.js ...` |
| Google Sheets | `node .ai/scripts/google-sheets-api.cjs ...` |
| Google Docs | `node .ai/scripts/google-docs-creator.cjs [create\|read\|update\|append] ...` |
| Gmail | `node .ai/scripts/google-gmail-api.cjs [today\|list\|read\|thread\|send\|draft] ...` |
| Google Calendar | `node .ai/scripts/google-calendar-api.js [today\|events\|search\|freebusy\|find-slot\|create\|quick] ...` |
| Slack | `node .ai/scripts/slack-api.cjs ...` |
| Granola Transcripts | `python3 .ai/scripts/granola-auto-extract-all.py --since YYYY-MM-DD` (NEVER use `--all`) |
| Git Worktree Manager | `python3 .ai/scripts/git-wt.py [new|checkout|prune] ...` |
| Daily Report | `node .ai/scripts/daily-report-dm.cjs [--dry-run] [--user=<id>]` |
| Granola Auth | `node .ai/scripts/granola-auth.cjs [login\|refresh\|status\|push-gha] [--user=<id>]` |
| User Setup | `node .ai/scripts/setup-user.cjs` |
| Env Restore | `node .ai/scripts/env-restore.cjs [--latest\|--file NAME\|--help]` |

For detailed CLI syntax: `.ai/knowledge/cli-reference.md`

### Claude Code Conversation Management

| Command | Action |
|---------|--------|
| `cb branch <names...>` | Create branches from current session |
| `cb list` | List all branches for current project |
| `cb search <query>` | Search across all conversations |
| `cb resume <name>` | Get resume command for a branch |
| `cb sessions` | List all raw sessions |

Install with: `bash .ai/setup/install-claude-branch.sh`

### API Keys & Credentials (NEVER Hardcode)

**The Rule:** All secrets go in their designated location, never in code or ~/.zshrc.

```javascript
// NEVER - hardcoded key
const API_KEY = 'sk-abc123...';

// ALWAYS - env var
const API_KEY = process.env.MY_API_KEY;
```

**Two credential files, two purposes:**

| File | Purpose | Used By |
|------|---------|---------|
| `~/.cloaked-env.sh` | MCP + shell env vars (PostHog, GitHub, Figma, Datadog) | Sourced by ~/.zshrc, inherited by MCP servers |
| `.ai/scripts/.env` | Node script credentials (Google OAuth, Jira, Slack, Dovetail) | Loaded via dotenv in each script |

**Why two files?**
- MCP servers inherit env vars from the shell - they need `~/.cloaked-env.sh` sourced in zshrc
- Node scripts use `dotenv` to load `.ai/scripts/.env` - they don't need shell exports
- Keeping them separate means .env corruption doesn't break your terminal

**Credential Safety:** All `.env` operations go through `env-guard.cjs` - every read normalizes CRLF, every write creates a timestamped backup, and writes are refused if they would reduce the credential count (unless explicitly forced).

**Setup/Repair:**
```bash
node .ai/scripts/setup-shell-env.cjs          # Create ~/.cloaked-env.sh
node .ai/scripts/setup-shell-env.cjs --check  # Validate current state
node .ai/scripts/setup-shell-env.cjs --fix    # Fix zshrc + create shell env
```

**Standard Locations:**

| Credential Type | Location | Example |
|-----------------|----------|---------|
| MCP server keys (PostHog, GitHub, Figma, DD) | `~/.cloaked-env.sh` | `export POSTHOG_API_KEY=...` |
| Node script keys (Jira, Slack, Gemini, etc.) | `.ai/scripts/.env` | `JIRA_API_KEY=...` |
| OAuth tokens (Google) | `.ai/scripts/.google-token.json` | Auto-managed |

**When Writing New Scripts:**

1. Load env at top: `require('dotenv').config({ path: path.join(__dirname, '.env') })`
2. Validate required keys exist before using
3. Fail fast with clear error: `if (!process.env.X) throw new Error('X required in .env')`
4. If your key is needed by MCP, add to `setup-shell-env.cjs` MCP_VARS instead

**When Reviewing Code:**

- Flag any string that looks like a key/token (starts with `sk-`, `xoxb-`, `phc_`, etc.)
- Check `dotenv.config()` uses explicit path (not just `require('dotenv').config()`)
- Verify `.env` is in `.gitignore`
- Never put `export` statements with real keys in `~/.zshrc` directly

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
node .ai/scripts/setup-doctor.cjs
```

This checks ALL 9 integrations at once and provides specific fix instructions.

**Service-Specific Recovery:**

| Service | Auth Error | Quick Fix |
|---------|------------|-----------|
| Google (Sheets/Drive/Gmail) | OAuth token expired | `node .ai/scripts/google-auth-setup.cjs` |
| Jira/Confluence | 401/403 | Check `ATLASSIAN_EMAIL` + `JIRA_API_KEY` in `.ai/scripts/.env` |
| PostHog | Query fails | Check `POSTHOG_API_KEY` in `~/.cloaked-env.sh` |
| Slack | Token invalid | Check `SLACK_BOT_TOKEN` in `.ai/scripts/.env` |
| Gemini | API error | Check `GEMINI_API_KEY` in `.ai/scripts/.env` |
| GitHub | Auth failure | Check `GITHUB_PERSONAL_ACCESS_TOKEN` in `~/.cloaked-env.sh` |

**User Communication Template:**

When multiple auth failures occur, tell the user:
> "I've encountered auth failures with [services]. Running diagnostics to identify the issue..."
> [Run setup-doctor.cjs]
> "Here's what needs to be fixed: [specific issues from doctor output]"

**Auto-Recovery Flags:**

For common fixable issues, the doctor script supports `--fix`:
```bash
node .ai/scripts/setup-doctor.cjs --fix
```

This auto-repairs: missing .env (restores from backup if available, otherwise copies .env.example), CRLF line endings, expired tokens (prompts re-auth), invalid JSON (deletes corrupt files). All .env repairs create a backup first.

For credential-specific recovery (when .env was wiped or corrupted):
```bash
node .ai/scripts/env-restore.cjs              # List backups with credential counts
node .ai/scripts/env-restore.cjs --latest     # Restore most recent backup that beats current credential count
```

**Session-Start Credential Warnings:**

On startup, the system checks `.env` health and warns (never blocks) if:
- `.env` file is missing (suggests restore from backup if available)
- CRLF line endings detected (corrupts token values)
- Required credentials are missing or contain placeholder values

These warnings appear in the session greeting. To resolve, run the suggested commands or use `node .ai/scripts/env-restore.cjs --latest` to restore from backup.

### Transcript Locations (check in order)

1. `.ai/local/private_transcripts/` - LOCAL via Granola (1:1s, investor calls, sensitive meetings)
2. `.ai/knowledge/meeting_transcripts/` - TEAM via Zoom+Zapier (standups, public meetings)

### Chat/Conversation Search (Claude Code & Cursor)

When user asks to "find a chat", "find a conversation", or "search my sessions" - they mean **AI coding sessions**, NOT meeting transcripts.

**Disambiguation:**
| User says | Type | Search with |
|-----------|------|-------------|
| "find the chat where I..." | AI sessions | `chat-analytics.js` |
| "find our conversation about..." | AI sessions | `chat-analytics.js` |
| "find the meeting where..." | Transcripts | Transcript files |
| "what did [person] say about..." | Transcripts | Transcript files |

**Search AI Sessions:**
```bash
# Search the conversation index
python3 -c "
import json
with open('.ai/local/conversations/index.json') as f:
    data = json.load(f)
for s in data['sessions']:
    if 'q1 planning' in json.dumps(s).lower():
        print(f\"{s.get('id', 'unknown')}: {s.get('summary', s.get('title', 'no title'))[:100]}\")
"

# Or grep the raw JSONL files
grep -l "q1 planning" ~/.claude/projects/-Users-kyler-Documents-code-cloaked-work/*.jsonl
```

**Session Index:** `.ai/local/conversations/index.json`

**To resume a session:** `claude --resume <session-id>`

### Scheduling and Availability

When the user asks about scheduling, availability, "which time works", or meeting conflicts:

1. **Check their calendar first** using `node .ai/scripts/google-calendar-api.js today` or `events`
2. **Convert timezones** - User is in EST. Convert proposed times and check for conflicts.
3. **Check free/busy** for group scheduling: `node .ai/scripts/google-calendar-api.js freebusy`
4. **Find open slots**: `node .ai/scripts/google-calendar-api.js find-slot`

Never just convert timezones without checking the calendar for conflicts.

### Cloaked Contact Types (Disambiguation)

Cloaked has MULTIPLE contact systems - always clarify which one:

| Type | Purpose | Codebase Location |
|------|---------|-------------------|
| **Call Guard Contacts** | Device contacts synced to Heimdall for call screening | `heimdall/`, `cloaked-ios/.../CallGuard*` |
| **Identity Contacts** | Contacts associated with Cloaked identities | `backend-core/`, `cloaked-ios/.../Contacts*` |
| **Phone Book Sync** | Syncing Cloaked numbers TO device phonebook | `cloaked-android/.../ContactSync*` |

When user asks about "contact sync" - ASK which type before searching.

### File Safety

- **NEVER commit**: `.ai/local/`, `.ai/work/`, `businessContext/`
- **NEVER delete** files without explicit user approval
- **NEVER create** files unless explicitly asked - show inline by default

### Fix-It-First Workflow

When you encounter a broken tool, script, or bug while working on a task:

1. **Stop the current task**
2. **Fix the problem** - create a branch, make the fix
3. **Create a PR** - push and open PR
4. **Wait for merge or pull main** - don't cherry-pick; just `git pull origin main`
5. **Resume original task**

This prevents accumulating tech debt and ensures tools stay working.

### Git Operations (Keep It Simple)

- **Prefer `git pull origin main`** over cherry-picking after a PR is merged
- **Avoid complex git state management** - if stuck, ask user rather than attempting reset/cherry-pick/rebase chains
- **When in worktrees**: Always verify `pwd` and use absolute paths for scripts
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
node .ai/scripts/google-sheets-api.cjs read [...]
node .ai/scripts/google-sheets-api.cjs read-range [...]
node .ai/scripts/google-sheets-api.cjs read-cell [...]
node .ai/scripts/google-sheets-api.cjs read-rows [...]
node .ai/scripts/google-sheets-api.cjs info [...]
node .ai/scripts/google-sheets-api.cjs write [...]
node .ai/scripts/google-sheets-api.cjs update [...]
node .ai/scripts/google-sheets-api.cjs write-table [...]
node .ai/scripts/google-sheets-api.cjs create-tab [...]
node .ai/scripts/google-sheets-api.cjs append [...]
node .ai/scripts/atlassian-api.cjs get [...]

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
- **NEVER use em-dashes** (`—`) - another AI giveaway; use regular dashes or rewrite
- Use whitespace and headings for visual separation instead

### Message Drafting

- **"Craft a message"** = digest the essence and rewrite in user's voice, don't copy verbatim
- **"Send this"** = use exact words provided

### Knowledge Discovery

- **Knowledge index**: `.ai/config/knowledge-index.json` - search by tags to find relevant docs
- **Team members**: `.ai/config/team-members.json` - names, roles, scopes, reporting
- **Skill context**: Check `required_context` in skill `references/manifest.json` and load those files

### Repository Locations

All Cloaked repos are siblings of `work/` at `../`:

| Repo | Path | Purpose |
|------|------|---------|
| Backend | `../backend-core/` | Backend services |
| iOS | `../cloaked-ios/` | iOS app |
| Android | `../cloaked-android/` | Android app |
| Dashboard | `../dashboard/` | Admin dashboard |
| Investor Data | `../businessContext/` | NEVER commit or reference in tickets |

### Jira Defaults

- **Project key**: `ALL`
- **Validation-first**: Always preview ticket before creating - get user confirmation
- Components/labels: See `.ai/knowledge/jira-components-labels.md`

### Jira Description Formatting

**Use ADF (Atlassian Document Format)**, not wiki markup (`h2.`, `{quote}`) or markdown. Plain text is fine for simple tickets. For formatted tickets, see `.ai/knowledge/jira-adf-formatting.md`.

**CRITICAL: Never pass ADF JSON as a `--description` CLI argument.** Shell escaping corrupts nested JSON, causing raw JSON to render in Jira. Instead:
- **Simple descriptions**: Use `--description "plain text"` (auto-converted to ADF)
- **Formatted descriptions**: Write ADF JSON to a temp file, then use `--description-file /tmp/desc.json`

### Credentials & Configuration

In addition to the rules in [API Keys & Credentials](#api-keys--credentials-never-hardcode):

- NEVER edit gitignored .env files without explicit user permission
- NEVER modify MCP configs for services the user didn't mention
- Always verify which config file is correct before editing (.env vs ~/.cloaked-env.sh)

### Workflow Principles

- ALWAYS propose a plan first and wait for approval before multi-step execution
- For complex investigations, break into sequential steps with clear traceability
- For multi-file changes, list all affected files with one-line summary each

### Analysis & Research

- Never take suggestions at face value - verify against actual codebase first
- Investigate feasibility step-by-step rather than assuming
- When evaluating proposals, trace the code path to confirm approach works

### Primary Interface

**PM AI Desktop App** (`PMDesktop/`) - Native Swift/SwiftUI macOS app

The native macOS app is the primary interface for PM AI, providing:
- Dashboard with system status and quick stats
- Session browser (your Claude Code/Cursor history with full-text search)
- Agent browser with launch capabilities
- Todo management with persistent storage
- Knowledge base browser
- Settings and configuration

**Build**:
```bash
cd PMDesktop
make run
```

**Technology**: Swift, SwiftUI, macOS 26+ (Tahoe), Swift Testing

**Documentation**: See `.ai/knowledge/pm-ai-system-architecture.md` for full system overview.

### Hallucination Prevention

- When user mentions a **name** → check `team-members.json`, then search transcripts
- When unsure about product → read `.ai/knowledge/cloaked-product-overview.md`
- When asked about metrics → read `.ai/knowledge/metrics-catalog.md` (authoritative) or `.ai/knowledge/business-metrics-and-logic.md`
- When asked about Cloaked Pay schema → read `.ai/knowledge/schemas/cloaked-pay-schema-notes.md`
- **NEVER guess** file paths, ticket IDs, or names - look them up first
- **Trust user over training data** - If user references something unfamiliar (tools, models, APIs, services), assume your knowledge is outdated and proceed as instructed

### Auto-Generated Context Files

These files are maintained by the context enrichment system from meeting transcripts and chat sessions:
- `.ai/knowledge/about-me.md` - Personal profile (gitignored - contains private data from transcripts). Incrementally curated via v2 schema - sections are patched individually, not rewritten.
- `.ai/knowledge/about-cloaked.md` - Company profile (tracked in git). Fully rewritten from insights.
- See `.ai/knowledge/context-enrichment-system.md` for the 4-layer pipeline and v2 schema details
- Check worker status: `node .ai/scripts/local-worker-manager.cjs status`
- Run curator: `node .ai/scripts/context-enrichment.cjs curate [--dry-run]`
- Regenerate from existing facts: `node .ai/scripts/context-enrichment.cjs regenerate`
- View stats: `node .ai/scripts/context-enrichment.cjs stats`
- Trace lineage: `node .ai/scripts/context-enrichment.cjs trace <element_id>`

### Confluence-Sourced Files

Some knowledge files are synced from Confluence and may become stale:
- `metrics-catalog.md` - Authoritative metrics definitions (from Confluence)
- `schemas/cloaked-pay-schema-notes.md` - Cloaked Pay schema notes (from Confluence)
- `churned-users-guide.md` - Churn definitions, scenarios, and SQL queries (from Confluence)

Check staleness: `node .ai/scripts/confluence-sync.cjs --check`
Refresh: `node .ai/scripts/confluence-sync.cjs`

### Experiment Knowledge Base

The experiment system catalogs all A/B tests with deep analysis:

**Location**: `.ai/knowledge/experiments/` (34+ experiments)

**Key Files**:
- `_index.json` - Fast lookup by feature flag, status, category
- `_learnings.json` - Synthesized insights by category
- `README.md` - Schema documentation (v1.1.0)
- `{category}/{experiment_id}.json` - Individual experiment files

**When to check experiments**:
- User asks "why did X fail/win?"
- Designing new experiments (check learnings for patterns)
- Analyzing conversion/retention metrics (see related experiments)
- Product strategy questions (what have we learned?)
- Before running a new experiment (check for similar past experiments)

**Commands**:
- Deep analysis: `/pm-experiment-analyze <feature-flag-key>`
- Sync all sources: `/pm-experiment-sync`
- Quick lookup: `cat .ai/knowledge/experiments/_index.json | jq '.experiments[] | select(.status == "concluded_won")'`

**Confluence Integration**:
- Experiments auto-publish to Confluence after deep analysis
- Catalog page: [link to be added after first publish]
- Each experiment has its own Confluence page

**Schema**: v1.1.0 with deep analysis sections:
- `code_evidence`, `funnel_analysis`, `external_research`
- `unexplored_metrics`, `cohort_analysis`, `root_cause`
- `recommendations`, `learnings`, `lineage`

---

## Cursor-Specific

- Sequential execution only (no parallel subagents)
- Expert panels run one expert at a time
- When orchestrating, run agents sequentially

### Platform Capability Matrix

| Capability | Cursor | Claude Code |
|------------|--------|-------------|
| Parallel subagent execution | ❌ Sequential only | ✅ Via Task tool |
| Expert panels | ⚠️ Sequential | ✅ Concurrent |
| Multi-perspective analysis | ⚠️ One at a time | ✅ Parallel |
| IDE integration | ✅ Native | ❌ CLI only |
| Code context awareness | ✅ Full file context | ⚠️ Must read files |
| Bash command approvals | ✅ Configurable | ✅ Configurable |
| MCP server access | ✅ 4 servers | ✅ 4 servers |
| Slash commands | ✅ All 41 commands | ✅ All 41 commands |
| All skills | ✅ All 54 skills | ✅ All 54 skills |

**When to use which:**
- **Cursor**: IDE-integrated work, code editing with full file context
- **Claude Code**: Complex analysis requiring parallel data gathering, multi-expert panels

---

## Skills System

Skills follow the SKILL.md standard (agentskills.io) with 100% spec compliance.

- **Router**: `/pm-ai [task]` - analyzes and routes to appropriate skill
- **Direct access**: `/pm-coach`, `/pm-analyze`, `/pm-daily`, `/pm-jira`, etc.
- **Skills registry**: `skills/_index.json` - central index for fast routing
- **Marketplace config**: `.claude-plugin/marketplace.json` - 6 installable plugins

### Skills Directory Structure

```
skills/
├── _index.json          # Central registry (routing, metadata)
├── core/                # Core PM skills (17)
│   ├── product-coach/
│   │   ├── SKILL.md     # Main instructions
│   │   └── references/  # manifest.json + supporting docs
│   └── ...
├── experts/             # Expert personas (13)
├── specialized/         # Specialized tools (10)
├── workflows/           # Multi-skill orchestration (5)
├── personas/            # Customer personas (4)
└── utilities/           # System utilities (5)
```

### Skills by Category (54 total)

**Core (17):** Product strategy, Jira, Confluence, SQL, daily ops, updates, documentation
- `product-coach`, `jira-ticket-writer`, `sql-query-builder`, `daily-chief-of-staff`
- `confluence-manager`, `weekly-update-writer`, `status-update-writer`, `pm-document`
- `interview-assistant`, `investor-relations`, `self-improvement`, `chat-search`
- `blog-content-writer`, `content-creator`, `feed-manager`, `slack-inbox-triage`, `webapp-pm`

**Specialized (10):** PDF, video, OCR, transcripts, engineering, prototypes
- `pdf-processor`, `video-processor`, `visual-designer`, `local-ocr`
- `granola-transcript-agent`, `transcript-organizer`, `eng-fullstack`
- `dovetail-manager`, `prototype-builder`, `usage-demo-curator`

**Workflows (5):** Multi-skill orchestration
- `feature-design-debate`, `expert-panel-orchestrator`, `jira-confluence-sync`, `pr-review`, `research-to-doc`

**Experts (13):** Multi-perspective analysis via `/expert-panel`
- Strategy: `serial-ceo`, `principal-pm`, `vc-investor`
- Growth: `growth-strategist`, `business-analyst`, `viral-growth-expert`, `lenny-rachitsky`, `elena-verna`
- Design: `design-lead`, `ux-psychologist`
- Technical: `engineering-lead`, `ai-systems-engineer`
- Critical: `devils-advocate`

**Personas (4):** Customer personas for feature testing
- `casual-user`, `pragmatic-user`, `privacy-advocate`, `urgent-user`

**Utilities (5):** System helpers
- `auto-pull-manager`, `desktop-launcher`, `env-health-check`, `pm-librarian`, `ralph-manager`

### MCP Integrations

| Service | Use Case |
|---------|----------|
| **GitHub** | Repository access, PRs, issues |
| **PostHog** | Analytics queries, feature flags |
| **Figma** | Design file access (read-only) |
| **Slack** | Messages and channels |

**CLI only (no MCP):** Google Drive, Google Sheets, Jira, Confluence - use `.ai/scripts/` CLI tools.

### Slash Commands (41)

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
| `/pm-career` | Career development coaching |
| `/pm-data` | Conversation data management |
| `/pm-dovetail` | Dovetail research insights |
| `/pm-experiment-analyze` | Deep experiment analysis |
| `/pm-experiment-sync` | Experiment sync pipeline |
| `/pm-feedback-insights` | Customer feedback analysis |
| `/pm-librarian` | File system audit and cleanup |
| `/pm-my-todos` | Personal todo management |
| `/pm-prototype` | Interactive UI prototypes |
| `/pm-ralph` | Ralph autonomous agent sessions |
| `/pm-search` | Search Claude/Cursor sessions |
| `/pm-setup` | Interactive setup wizard |
| `/pm-setup-doctor` | Diagnose setup issues |
| `/pm-setup-reset` | Reset setup wizard state |
| `/pm-slack-chats` | Triage Slack conversations |
| `/pm-webapp` | PM AI web app management |
| `/expert-panel` | Multi-expert panel |
| `/investor-relations` | VC comms |
| `/eng-fullstack` | Engineering debugging and review |
| `/pdf-processor` | PDF to markdown |
| `/video-processor` | Video to timeline |
| `/visual-designer` | Batch image editing |
| `/pr-review` | Multi-dimensional PR review |
| `/env-health` | Credential and system health check |
| `/research-to-doc` | Multi-source research to document |
| `/branch` | Create named conversation branches |
| `/cb` | Claude Branch Manager |
| `/question` | PM AI help and coaching |

### Full Directory Structure

| Path | Purpose |
|------|---------|
| `skills/` | SKILL.md standard skills (54 skills, 6 categories) |
| `skills/_index.json` | Central registry for routing and discovery |
| `.claude-plugin/` | Marketplace configuration |
| `PMDesktop/` | Native Swift macOS desktop app |
| `.ai/agents/` | Legacy agent definitions (archived) |
| `.ai/knowledge/` | Reference docs, guides, schemas |
| `.ai/config/` | Manifests, indexes, team data |
| `.ai/scripts/` | CLI entry points |
| `.ai/tools/lib/` | JavaScript client libraries |
| `.ai/evals/` | Pytest test suite |
| `.ai/reports/` | Automated system reports |
| `.ai/work/` | Agent outputs, drafts (gitignored) |
| `.ai/local/` | Private data (gitignored) |

### System Health

- **Quick check**: `python3 .ai/scripts/system-eval.py`
- **Full tests**: `python3 -m pytest .ai/evals/ -v`
- **Drift check**: `bash .ai/scripts/drift-check.sh`

### Maintenance

- **Add skill**: Create `skills/<category>/<name>/SKILL.md` + `references/manifest.json`, run `node scripts/generate-index.cjs`
- **Validate skills**: `node scripts/validate-skills.cjs` - checks spec compliance
- **Update knowledge**: Edit file in `.ai/knowledge/`, update `knowledge-index.json` tags
- **Refresh repos**: `bash .ai/scripts/auto-update.sh` or `/pm-update`
- **Rotate tokens**: Delete `.ai/scripts/.google*.json`, re-run `node .ai/scripts/google-auth-setup.js`

---

## Sync Note

This file and `CLAUDE.md` must stay synchronized on ALWAYS rules.
They differ only in platform-specific sections (Cursor vs Claude Code).
When updating one, update the other.
