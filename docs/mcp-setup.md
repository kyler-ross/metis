# MCP Server Configuration

MCP (Model Context Protocol) lets AI coding tools connect to external services like GitHub, PostHog, and Figma through standardized server interfaces. Each server runs as a local process and provides tools the AI agent can call.

## Config Formats

There are two JSON formats depending on where the config lives:

### Flat format (root `.mcp.json`)

Used by headless/CLI mode (`claude -p --mcp-config .mcp.json`) and git worktrees. Server names are top-level keys.

```json
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}" }
  }
}
```

### Wrapped format (`.claude/mcp.json`)

Used by Claude Code's interactive mode. Servers are nested under an `mcpServers` key and support a `description` field.

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}" },
      "description": "GitHub repos, PRs, issues access"
    }
  }
}
```

### Which file goes where

| File | Format | Used By |
|------|--------|---------|
| `.mcp.json` | Flat | Headless mode (`claude -p`), git worktrees |
| `.claude/mcp.json` | Wrapped | Claude Code interactive sessions |
| `.cursor/mcp.json` | Wrapped | Cursor IDE |

## Setting Up

Copy the example files and fill in your credentials:

```bash
cp .mcp.json.example .mcp.json
cp .claude/mcp.json.example .claude/mcp.json
```

Both files are gitignored so your real credentials stay local. The `.example` files are tracked and safe to commit.

## Environment Variable Substitution

Both formats support `${VAR_NAME}` syntax in `env` blocks. The variable is resolved from your shell environment at server startup time. Set these in your shell profile (`~/.zshrc`, `~/.bashrc`) or in a sourced env file:

```bash
# In ~/.zshrc or a sourced file like ~/.pm-ai-env.sh
export GITHUB_PERSONAL_ACCESS_TOKEN="ghp_..."
export POSTHOG_API_KEY="phx_..."
export FIGMA_PERSONAL_ACCESS_TOKEN="figd_..."
export SLACK_BOT_TOKEN="xoxb-..."
```

## Server-by-Server Setup

### GitHub

**Package:** `@modelcontextprotocol/server-github`

**Get your token:** GitHub > Settings > Developer settings > Personal access tokens > Fine-grained tokens. Grant `repo` scope for the orgs/repos you need.

**Env var:** `GITHUB_PERSONAL_ACCESS_TOKEN`

### PostHog

**Package:** `mcp-remote@latest` (proxies to PostHog's hosted MCP endpoint)

**Get your key:** PostHog > Project Settings > Personal API Keys > Create key. Scope it to the project you want to query.

**Env var:** `POSTHOG_API_KEY`

Note: The PostHog MCP server uses `mcp-remote` to connect to PostHog's hosted SSE endpoint. The API key is passed as a Bearer token in the `Authorization` header.

### Figma

**Package:** `figma-mcp`

**Get your token:** Figma > Settings > Personal access tokens > Generate new token. Grant read access to the files/projects you need.

**Env var:** `FIGMA_PERSONAL_ACCESS_TOKEN`

### Slack

**Package:** `markov-slack-mcp`

**Get your token:** Create a Slack app at api.slack.com/apps, add Bot Token Scopes (channels:read, channels:history, chat:write, users:read at minimum), install to your workspace, and copy the Bot User OAuth Token.

**Env var:** `SLACK_BOT_TOKEN`

### Granola

**Package:** `granola-mcp-plus`

**Auth:** Granola MCP authenticates via the Granola desktop app. Make sure Granola is installed and you are logged in. No env var needed.

## GitHub Actions Gotcha

When using `claude -p --mcp-config` in CI, the `--mcp-config` flag expects the **wrapped** format (`{"mcpServers": {...}}`), not the flat format. If your repo only has a flat `.mcp.json`, transform it before passing:

```bash
jq '{mcpServers: .}' .mcp.json > /tmp/mcp-config.json
claude -p --mcp-config /tmp/mcp-config.json "your prompt"
```

Also note: GitHub Actions silently drops any env var with the `GITHUB_` prefix (it is a reserved namespace). Use a different name in the workflow `env:` block and re-export inside the bash step:

```yaml
env:
  GH_PAT: ${{ secrets.GITHUB_PERSONAL_ACCESS_TOKEN }}
steps:
  - run: |
      export GITHUB_PERSONAL_ACCESS_TOKEN="$GH_PAT"
      claude -p --mcp-config /tmp/mcp-config.json "your prompt"
```

## Verifying MCP Servers

After setting up, launch Claude Code and check that servers are connected:

```
claude
> /mcp
```

This lists all configured MCP servers and their connection status. If a server fails to start, check that:
1. The env var is exported in your current shell session
2. The npm package can be found (`npx -y <package>` should work)
3. The API key/token is valid
