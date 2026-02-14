---
name: database-schema
description: SQLite schema reference for chat session database
---

# Chat Search Database Schema

Reference for the `~/.pm-ai/chats.db` SQLite database.

## sessions table

```sql
id TEXT PRIMARY KEY,              -- "claude:<project>:<uuid>" or "cursor:<workspace>:<uuid>"
source TEXT,                      -- "claude-code" | "cursor"
enriched_title TEXT,              -- AI-generated title (prefer this)
enriched_summary TEXT,            -- AI-generated summary
one_sentence TEXT,                -- One-sentence summary
enriched_category TEXT,           -- AI-classified category
outcome TEXT,                     -- success, partial, failure, unclear
complexity TEXT,                  -- trivial, simple, moderate, complex
created_at TEXT,                  -- ISO timestamp
last_active_at TEXT,              -- ISO timestamp
turn_count INTEGER,               -- Back-and-forth exchanges (magnitude signal)
tool_use_count INTEGER,           -- Tool calls (magnitude signal)
git_branch TEXT,                  -- Branch name (identity/artifact signal)
cwd TEXT,                         -- Working directory (identity signal)
agents_invoked TEXT,              -- JSON array of agents used
is_subagent INTEGER,              -- 1 if this is a subagent session, 0 otherwise
parent_session_id TEXT,           -- For subagents: ID of session that spawned this
subagent_summaries TEXT           -- JSON array of subagent one_sentence values (searchable)
```

## messages table

```sql
id INTEGER PRIMARY KEY,
session_id TEXT,                  -- FK to sessions.id
message_index INTEGER,            -- Order within session
type TEXT,                        -- "user" | "assistant" | "tool_use" | "tool_result"
content TEXT,                     -- Message content
timestamp TEXT,                   -- ISO timestamp
tool_name TEXT                    -- For tool_use/tool_result types
```

## FTS Indexes

### Session Search (via LIKE)
There is no `sessions_fts` table. Use LIKE queries on enriched columns for session-level search:

```sql
-- Search session metadata (fast, for topics)
SELECT id, enriched_title, one_sentence, date(last_active_at) as date
FROM sessions
WHERE enriched_title LIKE '%search terms%'
   OR one_sentence LIKE '%search terms%'
   OR enriched_summary LIKE '%search terms%'
ORDER BY last_active_at DESC LIMIT 10
```

### messages_fts
Full-text search on message `content`. Use for deep content searches.

```sql
-- Join pattern for message FTS search
SELECT DISTINCT s.id, s.enriched_title, s.one_sentence, date(s.last_active_at) as date
FROM messages_fts f JOIN messages m ON f.rowid = m.id JOIN sessions s ON m.session_id = s.id
WHERE messages_fts MATCH 'search terms'
ORDER BY s.last_active_at DESC LIMIT 10
```

## Field Usage by Dimension

| Field | Dimension | Usage |
|-------|-----------|-------|
| `turn_count` | Magnitude | `WHERE turn_count > 100` |
| `tool_use_count` | Magnitude | `WHERE tool_use_count > 200` |
| `git_branch` | Identity, Artifact | `WHERE git_branch LIKE '%branch%'` |
| `cwd` | Identity | `WHERE cwd LIKE '%project%'` |
| `outcome` | Outcome | `WHERE outcome = 'success'` |
| `created_at` | Temporal | `WHERE date(created_at) = date('now', '-1 day')` |
| `agents_invoked` | Identity | `WHERE agents_invoked LIKE '%agent%'` |
| `enriched_title`, `one_sentence`, `enriched_summary`, `subagent_summaries` | Content | Via LIKE queries |
