---
name: ?
description: Get help, find demos, check usage stats, or get coaching on PM AI
argument-hint: "[how do I... | show demos | stats | help me improve]"
---

# PM AI Help & Coaching

Load the usage-demo-curator agent and help with: $ARGUMENTS

## Quick Actions

If no arguments provided, offer these options:
1. **"stats"** - Show my usage statistics
2. **"demos"** - Find high-quality conversation examples
3. **"coaching"** - Get tips to improve my AI usage
4. **"search [query]"** - Find specific conversations

## Context

The user wants help understanding how to use PM AI effectively. This could be:
- Finding demo conversations to learn from
- Getting usage statistics and insights
- Receiving coaching on better techniques
- Searching past conversations for reference
- Exporting demos for team training

First, check if the chat index exists by running:
```bash
node scripts/chat-analytics.js stats
```

If it returns an error or shows 0 sessions, suggest running:
```bash
node scripts/chat-analytics.js index
```

Then proceed with the user's request.
