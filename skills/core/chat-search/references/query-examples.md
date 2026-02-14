---
name: query-examples
description: SQL and bash query patterns for dimensional chat search
---

# Chat Search Query Examples

Reference queries for each dimension. See main agent for dimension classification.

## Content Dimension (LIKE + FTS)

**Always filter out subagent sessions** - they're internal Task tool spawns that users never see directly.

**Include subagent_summaries** - This field contains summaries of work done by subagents, making parent sessions findable by subagent content.

```bash
# Session metadata via LIKE (fast, good for topics)
# Includes subagent_summaries so parent sessions are findable by subagent work
sqlite3 ~/.pm-ai/chats.db "
SELECT id, enriched_title, one_sentence, date(last_active_at) as date
FROM sessions
WHERE (enriched_title LIKE '%search terms%'
   OR one_sentence LIKE '%search terms%'
   OR enriched_summary LIKE '%search terms%'
   OR subagent_summaries LIKE '%search terms%')
  AND is_subagent = 0
ORDER BY last_active_at DESC LIMIT 10"

# Message content via FTS (deep, comprehensive)
sqlite3 ~/.pm-ai/chats.db "
SELECT DISTINCT s.id, s.enriched_title, s.one_sentence, date(s.last_active_at) as date
FROM messages_fts f JOIN messages m ON f.rowid = m.id JOIN sessions s ON m.session_id = s.id
WHERE messages_fts MATCH 'search terms'
  AND s.is_subagent = 0
ORDER BY s.last_active_at DESC LIMIT 10"
```

## Temporal Dimension (Date Filters)

```bash
# Yesterday
sqlite3 ~/.pm-ai/chats.db "SELECT id, enriched_title, one_sentence, date(created_at)
FROM sessions WHERE date(created_at) = date('now', '-1 day')
  AND is_subagent = 0 AND id NOT LIKE 'claude:%:agent-%'
ORDER BY created_at DESC"

# Last 7 days
sqlite3 ~/.pm-ai/chats.db "SELECT id, enriched_title, one_sentence, date(created_at)
FROM sessions WHERE date(created_at) >= date('now', '-7 days')
  AND is_subagent = 0 AND id NOT LIKE 'claude:%:agent-%'
ORDER BY created_at DESC"

# Specific date
sqlite3 ~/.pm-ai/chats.db "SELECT id, enriched_title, one_sentence, date(created_at)
FROM sessions WHERE date(created_at) = '2026-01-15'
  AND is_subagent = 0 AND id NOT LIKE 'claude:%:agent-%'
ORDER BY created_at DESC"
```

## Magnitude Dimension (Stats)

```bash
# Large PRs (by deletions or additions)
gh pr list --repo your-org/your-repo --state all --limit 50 \
  --json number,title,deletions,additions,createdAt \
  | jq -r 'sort_by(-.deletions) | .[:10][] | "\(.deletions) deleted | \(.additions) added | PR #\(.number): \(.title)"'

# Long sessions (by turn count)
sqlite3 ~/.pm-ai/chats.db "
SELECT id, enriched_title, turn_count, date(created_at)
FROM sessions WHERE turn_count > 100
ORDER BY turn_count DESC LIMIT 10"

# High tool usage sessions
sqlite3 ~/.pm-ai/chats.db "
SELECT id, enriched_title, tool_use_count, turn_count, date(created_at)
FROM sessions WHERE tool_use_count > 200
ORDER BY tool_use_count DESC LIMIT 10"
```

## Artifact Dimension (GitHub + External URLs)

```bash
# Find PRs by title/content
gh pr list --repo your-org/your-repo --state all --search "menubar removal" --limit 20 \
  --json number,title,createdAt,url

# Find PRs by branch
gh pr list --repo your-org/your-repo --state all --limit 50 \
  --json number,title,headRefName,createdAt \
  | jq -r '.[] | select(.headRefName | contains("cleanup")) | "\(.number): \(.title) (\(.headRefName))"'

# Then find session by branch
sqlite3 ~/.pm-ai/chats.db "
SELECT id, enriched_title, git_branch, date(created_at)
FROM sessions WHERE git_branch LIKE '%cleanup%'
ORDER BY created_at DESC"

# Find sessions that created Google Docs
grep -l "docs.google.com/document" ~/.claude/projects/-Users-kyler-Documents-code-cloaked-pm/*.jsonl 2>/dev/null

# Find sessions that created Jira tickets
grep -l "atlassian.net/browse" ~/.claude/projects/-Users-kyler-Documents-code-cloaked-pm/*.jsonl 2>/dev/null

# Find sessions that created Confluence pages
grep -l "atlassian.net/wiki" ~/.claude/projects/-Users-kyler-Documents-code-cloaked-pm/*.jsonl 2>/dev/null

# Generic pattern for finding sessions with created artifacts
grep -l "docs.google.com\|atlassian.net\|figma.com" ~/.claude/projects/-Users-kyler-Documents-code-cloaked-pm/*.jsonl 2>/dev/null
```

## Identity Dimension (Metadata)

```bash
# By git branch
sqlite3 ~/.pm-ai/chats.db "
SELECT id, enriched_title, git_branch, date(created_at)
FROM sessions WHERE git_branch LIKE '%electron%'
ORDER BY created_at DESC LIMIT 10"

# By working directory
sqlite3 ~/.pm-ai/chats.db "
SELECT id, enriched_title, cwd, date(created_at)
FROM sessions WHERE cwd LIKE '%backend-core%'
ORDER BY created_at DESC LIMIT 10"

# By agents used
sqlite3 ~/.pm-ai/chats.db "
SELECT id, enriched_title, agents_invoked, date(created_at)
FROM sessions WHERE agents_invoked LIKE '%jira%'
ORDER BY created_at DESC LIMIT 10"
```

## Outcome Dimension

```bash
# Successful sessions
sqlite3 ~/.pm-ai/chats.db "
SELECT id, enriched_title, outcome, one_sentence, date(created_at)
FROM sessions WHERE outcome = 'success'
ORDER BY created_at DESC LIMIT 10"

# Failed/partial sessions
sqlite3 ~/.pm-ai/chats.db "
SELECT id, enriched_title, outcome, one_sentence, date(created_at)
FROM sessions WHERE outcome IN ('failure', 'partial')
ORDER BY created_at DESC LIMIT 10"
```

## Raw JSONL Fallback

Use when FTS returns no results (session may not be indexed yet):

```bash
# Search recent JSONL files for content
grep -l "search term" ~/.claude/projects/-Users-kyler-Documents-code-cloaked-pm/*.jsonl 2>/dev/null | head -10

# Get session metadata from matching file
head -1 /path/to/session.jsonl | jq -r '.summary // "No summary"'

# Check file modification times to find recent sessions
ls -lt ~/.claude/projects/-Users-kyler-Documents-code-cloaked-pm/*.jsonl | head -10

# Find files containing both topic AND artifact pattern
for f in ~/.claude/projects/-Users-kyler-Documents-code-cloaked-pm/*.jsonl; do
  if grep -q "topic" "$f" && grep -q "docs.google.com" "$f"; then
    echo "$(basename "$f" .jsonl)"
  fi
done
```
