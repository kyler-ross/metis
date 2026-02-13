# Mimir
Pronounced MEE-mere.

A structured system for AI-assisted product management. Skills, scripts, slash commands, and knowledge files that give any AI coding agent persistent context about your product and direct access to your tools.



Works with [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Cursor](https://cursor.sh), [Codex](https://openai.com/index/codex/), [Antigravity](https://antigravity.build), or any agent that can read markdown files and run shell commands. The core is just structured markdown and Node.js scripts -- no vendor lock-in.

## What's Inside

| Category | Count | Examples |
|----------|-------|---------|
| **Core Skills** | 17 | Daily ops, Jira, Confluence, SQL, coaching, weekly updates, Slack triage, interview prep |
| **Expert Personas** | 13 | Serial CEO, Principal PM, VC Investor, Growth Strategist, UX Psychologist, Devil's Advocate |
| **Specialized Tools** | 10 | PDF processing, video analysis, OCR, prototyping, transcript organization |
| **Workflows** | 5 | Expert panels, feature design debates, PR reviews, Jira-Confluence sync, research-to-doc |
| **Customer Personas** | 4 | Test features from realistic user perspectives |
| **Utilities** | 6 | Health checks, file management, system maintenance |
| **Slash Commands** | 24 | `/pm-daily`, `/pm-coach`, `/pm-jira`, `/expert-panel`, etc. |
| **Integration Scripts** | 34 | Google Workspace, Jira, Confluence, Slack, Dovetail, Granola, and more |

## Quick Start

```bash
# 1. Clone
git clone https://github.com/kyler-ross/mimir.git
cd mimir

# 2. Set up your AI instructions
cp CLAUDE.md.example CLAUDE.md
# Edit CLAUDE.md -- fill in the [bracketed] sections with your product details

# 3. Install script dependencies
cd scripts && npm install && cd ..

# 4. Add your credentials
cp scripts/.env.example scripts/.env
# Edit scripts/.env -- add your API keys

# 5. Add your product context
cp knowledge/product-overview.md.example knowledge/product-overview.md
cp knowledge/metrics-catalog.md.example knowledge/metrics-catalog.md
cp knowledge/team-members.json.example knowledge/team-members.json
# Edit each file with your real product info

# 6. Launch with your preferred tool
claude .                # Claude Code
cursor .                # Cursor
codex .                 # Codex
# Or point any AI agent at this directory
```

## Connect Your Tools

Each integration is optional. Start with what you use and add more later.

### Google Workspace (Calendar, Gmail, Sheets, Drive, Docs)

Requires a Google Cloud project with OAuth 2.0 credentials. One-time setup, then tokens auto-refresh.

```bash
node scripts/google-auth-setup.cjs
```

### Jira + Confluence

```env
# In scripts/.env
ATLASSIAN_EMAIL=you@company.com
JIRA_API_KEY=your-api-token
JIRA_BASE_URL=https://yourcompany.atlassian.net
CONFLUENCE_BASE_URL=https://yourcompany.atlassian.net/wiki
```

Get an API token at https://id.atlassian.com/manage-profile/security/api-tokens

### Slack

```env
# In scripts/.env
SLACK_BOT_TOKEN=xoxb-your-token
```

### MCP Servers (PostHog, Figma, GitHub)

Copy and configure the MCP examples:

```bash
cp .claude/mcp.json.example .claude/mcp.json   # For Claude Code
cp .cursor/mcp.json.example .cursor/mcp.json   # For Cursor
```

See `docs/mcp-setup.md` for details on each server.

## How It Works

**Instruction files** (`CLAUDE.md`, `config/cursor-rules.md`) set the rules -- tool priorities, safety constraints, output style, and references to skills and knowledge files. Most AI coding tools read these automatically from the repo root.

**Skills** (`skills/`) are structured instruction files following the [SKILL.md standard](https://agentskills.io). Each one tells the agent how to perform a specific task with real methodology. Any tool that can read markdown can use them.

**Slash commands** (`.claude/commands/`) are shortcuts that load skills. Tools that support custom commands (Claude Code, Cursor) pick these up automatically. For other tools, you can reference skills directly by path.

**Scripts** (`scripts/`) connect your agent to your tools via CLI. Calendar, Jira, Slack, Sheets -- all accessible from the terminal. Any agent that can run shell commands can use these.

**Knowledge files** (`knowledge/`) give your agent persistent context about your product, team, and metrics so you don't re-explain your business every conversation.

```
You: /pm-daily
        |
        v
Slash command loads --> Daily Chief of Staff skill
        |
        v
Skill instructs Claude to:
  1. Check calendar (scripts/google-calendar-api.js)
  2. Review Jira board (scripts/atlassian-api.cjs)
  3. Check Slack (scripts/slack-api.cjs)
  4. Cross-reference with product context (knowledge/)
        |
        v
Agent delivers: prioritized briefing with action items
```

## Tool Compatibility

The repo includes config for multiple tools out of the box:

| Tool | Instruction File | Commands | MCP Config |
|------|-----------------|----------|------------|
| **Claude Code** | `CLAUDE.md` | `.claude/commands/` | `.claude/mcp.json` |
| **Cursor** | `.cursorrules` (symlink) | `.cursor/commands/` (symlink) | `.cursor/mcp.json` |
| **Codex / Others** | Read `CLAUDE.md` or `config/cursor-rules.md` directly | Reference skills by path | N/A |

The skills, scripts, and knowledge files are plain markdown and Node.js -- they work with anything that can read files and run commands.

## Hooks (Claude Code)

The `.claude/hooks/` directory includes pre-built hooks for Claude Code:

- **CLI validation** -- catches credential leaks, validates script arguments, detects wrong markup formats
- **PR scope enforcement** -- blocks multi-scope PRs and suggests how to split them
- **Agent activation** -- auto-suggests relevant skills based on your prompt
- **MCP telemetry** -- tracks tool usage for analytics
- **Session startup** -- health checks and personalized greeting

Copy `.claude/settings.json.example` to `.claude/settings.json` to enable them.

## Customize It

### Add Skills

```bash
mkdir -p skills/core/my-skill/references
# Write skills/core/my-skill/SKILL.md
# Write skills/core/my-skill/references/manifest.json
node scripts/generate-index.cjs
```

### Add Slash Commands

Create `.claude/commands/my-command.md`:

```markdown
Load and follow the skill at skills/core/my-skill/SKILL.md

User's request: $ARGUMENTS
```

### Add Knowledge

Drop markdown files into `knowledge/` and reference them in your CLAUDE.md.

## Architecture

```
mimir/
├── CLAUDE.md.example          # AI instruction template (copy to CLAUDE.md)
├── config/cursor-rules.md     # Cursor-specific rules (symlinked from .cursorrules)
├── skills/                    # 55 skills across 6 categories
│   ├── _index.json            # Auto-generated routing index
│   ├── core/                  # Core PM skills (17)
│   ├── experts/               # Expert personas (13)
│   ├── specialized/           # Specialized tools (10)
│   ├── workflows/             # Multi-skill workflows (5)
│   ├── personas/              # Customer personas (4)
│   └── utilities/             # System utilities (6)
├── .claude/
│   ├── commands/              # 24 slash commands
│   ├── hooks/                 # CLI validation, PR enforcement, agent activation
│   ├── agents/                # Agent routing rules
│   ├── mcp.json.example       # MCP server config template
│   └── settings.json.example  # Hook configuration template
├── .cursor/
│   ├── commands -> ../.claude/commands
│   └── mcp.json.example
├── scripts/                   # 34 integration scripts + 15 client libraries
│   ├── lib/                   # Shared client libraries
│   ├── .env.example           # Credential template
│   └── package.json
├── knowledge/                 # Product context templates
├── docs/                      # Setup guides
└── examples/                  # Reference material
```

## Requirements

- Any AI coding agent that can read files and run shell commands
- Node.js 18+
- Python 3.9+ (for OCR and transcript tools)
- API keys for the integrations you want to use

## License

MIT
