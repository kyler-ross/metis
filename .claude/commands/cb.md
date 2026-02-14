---
description: Claude Branch Manager - search, list, and manage conversation branches
allowed-tools: Bash Read
---

# Claude Branch Manager

Manage your Claude Code conversation branches.

**Available subcommands:**

- `/cb list` - Show all branches for this project
- `/cb search <query>` - Search across all conversations
- `/cb sessions` - List all raw sessions
- `/cb resume <name>` - Get resume command for a branch

**Your task:**

Run the appropriate command based on user input:

```bash
node /Users/kyler/Documents/code/cloaked/pm/.ai/scripts/claude-branch.js $ARGUMENTS
```

Display the output in a readable format.

**Examples:**
- `/cb list` → Show all named branches
- `/cb search jira ticket` → Find conversations mentioning "jira ticket"
- `/cb resume research` → Show how to resume the "research" branch

