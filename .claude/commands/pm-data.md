---
description: Manage PM AI conversation data system
---

Manage the PM AI conversation backup and data system.

**User input:** $ARGUMENTS

## Available Commands

Based on the user's request, execute the appropriate command using the conversation-data CLI:

### Data Operations
- `sync` - One-time sync from Claude Code source to backup
- `index` - Rebuild unified index from backup files
- `migrate` - Migrate from legacy ~/.pm-ai-analytics
- `copy-to-webapp` - Copy index to webapp public directory

### Watcher Control
- `watcher enable` - Enable background sync (disabled by default)
- `watcher disable` - Disable background sync
- `watcher status` - Check if watcher is enabled/running
- `watcher start` - Start watcher in foreground

### Query Operations
- `stats` - Show data statistics
- `query <pattern>` - Search sessions by text
- `top [limit]` - Show top quality sessions
- `session <id>` - Get details for a specific session

## Execution

Run the CLI script:
```bash
node .ai/scripts/conversation-data.js <command>
```

## Examples

User says "sync my conversations":
```bash
node .ai/scripts/conversation-data.js sync
```

User says "enable watcher":
```bash
node .ai/scripts/conversation-data.js watcher enable
```

User says "show stats":
```bash
node .ai/scripts/conversation-data.js stats
```

User says "find sessions about jira":
```bash
node .ai/scripts/conversation-data.js query "jira"
```

User says "show top 10":
```bash
node .ai/scripts/conversation-data.js top 10
```

## Data Location

All conversation data is stored in `.ai/local/conversations/`:
- `manifest.json` - File tracking registry
- `index.json` - Unified search index
- `config.json` - Watcher enable/disable state
- `claude/` - Raw JSONL conversation backups

## Agent Access

Agents can programmatically query data:
```javascript
const data = require('.ai/tools/lib/conversation-data');

// Get all sessions
const sessions = data.query.all();

// Filter sessions
const debugging = data.query.filter({ category: 'debugging', minQuality: 70 });

// Get single session
const session = data.query.session('claude:...:abc123');

// Get conversation messages
const messages = data.query.getConversation('claude:...:abc123');

// System status
const status = data.query.status();
```
