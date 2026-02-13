---
name: pm-search
description: Find Claude Code or Cursor sessions by describing what you're looking for
allowed-tools: Bash, Read, Grep
argument-hint: [what you're looking for - e.g. "the chat about roadmap planning" or "yesterday's debugging session"]
---

Load the chat-search agent and find the session matching: $ARGUMENTS

**Database:** `~/.pm-ai/chats.db`

The agent will:
1. Interpret your query intent (topical, temporal, person, tool, etc.)
2. Search using FTS5 full-text search on both sessions and messages
3. Present top matches with enough context to identify the right one
4. Provide the `claude --resume <id>` command to continue
