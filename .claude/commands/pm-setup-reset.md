---
description: Reset setup wizard state
---

# PM AI Setup Reset

Reset the setup wizard state to start fresh. This is useful if:
- Setup is stuck or corrupted
- You want to reconfigure from scratch
- Migration failed and you want to retry

## What It Does

1. Backs up current setup state
2. Deletes `.ai/config/setup-state.json`
3. Preserves all actual data:
   - `.env` file (credentials)
   - MCP configuration
   - Analytics database
   - OAuth tokens
   - Background daemon

## Running Reset

```bash
# Reset state but keep data
node pm/.ai/scripts/lib/state-manager.js clear
```

## After Reset

Re-run the wizard:
```bash
node pm/.ai/scripts/setup-wizard.cjs
```

The wizard will detect existing configurations and offer to:
- Keep existing credentials
- Merge with current MCP config
- Skip already-installed components

## Full Cleanup (Nuclear Option)

⚠️ **Warning**: This removes EVERYTHING

```bash
# Backup first!
cp .ai/scripts/.env .env.backup

# Remove all setup artifacts
rm -f .ai/scripts/.env
rm -f .ai/config/setup-state.json
rm -f ../.claude/mcp.json
rm -rf ~/.pm-ai-analytics

# Re-run setup from scratch
node .ai/scripts/setup-wizard.js
```

## Troubleshooting

If you encounter issues during reset:

1. Check current state:
   ```bash
   node .ai/scripts/lib/state-manager.js show
   ```

2. Run setup doctor:
   ```bash
   node .ai/scripts/setup-doctor.js
   ```

3. Manual state file removal:
   ```bash
   rm .ai/config/setup-state.json
   ```
