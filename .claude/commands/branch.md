---
description: Create named branches from this conversation
allowed-tools: Bash Read
---

# Branch This Conversation

The user wants to create named branches from the current conversation so they can explore different paths.

**Your task:**

1. Parse the branch names from the user's command (e.g., `/branch research prototype coaching`)

2. Run the branch manager CLI to create the branches:
   ```bash
   node /Users/kyler/Documents/code/cloaked/pm/.ai/scripts/claude-branch.js branch <names...>
   ```

3. Show the user the created branches and how to START them (not just resume):
   - Use `cb start <name>` - this launches Claude AND sets the terminal title/icon
   - Example: `cb start research`

4. Remind them that this current session continues as "main"

**IMPORTANT:** Tell users to use `cb start <name>` NOT `cb resume`. The `start` command actually launches Claude with a nice terminal title and icon.

**If no branch names provided**, ask the user what they want to name their branches.

**Example output format:**
```
Created 3 branches:
  • research        → cb start research
  • prototype       → cb start prototype  
  • coaching        → cb start coaching

This session continues as main.
```

$ARGUMENTS

