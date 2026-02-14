---
description: Interactive PM AI setup wizard
---

# PM AI Interactive Setup Wizard

You are guiding the user through PM AI system setup. This is a **hybrid approach**: you call the setup wizard script for each phase, interpret the JSON output, and help the user through any issues.

## Step 1: Check Current Status

Run this command to see where setup stands:

```bash
node .ai/scripts/setup-wizard.cjs status
```

Parse the JSON output. If `can_resume` is true, ask the user:
- "I see you have a setup in progress (X% complete). Continue from where you left off, or start fresh?"

## Step 2: Run Setup Phases

For each phase, follow this pattern:

1. **Explain** what the phase does (use the `description` from status)
2. **Run** the phase: `node .ai/scripts/setup-wizard.cjs next`
3. **Parse** the JSON result
4. **Handle** based on status:

| Status | Action |
|--------|--------|
| `completed` | Show success, move to next phase |
| `skipped` | Note it was skipped, move to next |
| `needs_input` | Show what's needed, help user provide it |
| `ready_to_validate` | Offer to run validators |
| `failed` | Show error and suggestion, offer retry or skip |

## Step 3: Handle Each Phase Type

### preflight
- Shows Node/Python/Git versions
- If failed, help user install missing tools

### system_packages
- Optional: tesseract, poppler, ffmpeg
- If missing, ask "Want to install these? They enable OCR, PDF processing, and media handling."
- User can skip

### env_file
- Creates `.env` template
- Show user what credentials they need
- Point them to SETUP.md for credential instructions

### credentials
- Checks if API keys are in `.env`
- If `ready_to_validate`, offer to test each one
- Help user fix any validation failures

### google_oauth
- Optional but recommended for Sheets/Drive
- If skipped, note that Sheets/Drive features won't work

### mcp_config
- Auto-generates from .env
- Show which MCP servers were configured

### slash_commands
- Installs /pm-ai, /pm-coach, etc.
- Show count of commands installed

### analytics, daemon
- Optional background services
- Can be skipped safely

### shell_alias
- Adds `pm-claude` function to shell config

### pm_shortcut
- Adds `pm` alias for quick launch
- This is the shortcut that lets user type `pm` from anywhere

## Step 4: Completion

When all phases are done (or skipped), show:

```
Setup complete!

To activate your shell aliases:
  source ~/.zshrc  (or restart terminal)

Quick launch commands:
  pm          - Launch Claude Code with /pm-ai ready
  pm-claude   - Launch Claude Code in PM directory

Available slash commands:
  /pm-ai      - Route to appropriate agent
  /pm-coach   - Product strategy help
  /pm-analyze - Data analysis
  /pm-daily   - Morning briefing
  /pm-jira    - Jira ticket management

Need help? Run /pm-setup-doctor
```

## Commands Reference

```bash
# Check status
node .ai/scripts/setup-wizard.cjs status

# Run next phase
node .ai/scripts/setup-wizard.cjs next

# Run specific phase
node .ai/scripts/setup-wizard.cjs run <phase>

# Skip a phase
node .ai/scripts/setup-wizard.cjs skip <phase>

# Mark phase complete (manual)
node .ai/scripts/setup-wizard.cjs complete <phase>

# Start over
node .ai/scripts/setup-wizard.cjs reset
```

## Phases (in order)

1. `preflight` - Check Node.js, Python, Git
2. `system_packages` - Install OCR/PDF/media tools
3. `env_file` - Create .env template
4. `credentials` - Validate API keys
5. `google_oauth` - Google Sheets/Drive access
6. `mcp_config` - Generate MCP configuration
7. `slash_commands` - Install slash commands
8. `analytics` - Initialize analytics database
9. `daemon` - Background enrichment service
10. `shell_alias` - Add pm-claude function
11. `pm_shortcut` - Add "pm" quick launch alias

---

Now check the current status and guide the user through setup.
