---
name: research-to-doc
description: Gather data from multiple sources and synthesize into a structured document
---

# Research to Document

## When to Use This Skill

- User asks to "research and document", "gather and write", or "research brief"
- Creating PRDs, competitive analyses, or strategy documents that need multi-source data
- When user needs a document backed by actual data rather than opinions

## Process

### 1. Clarify Scope

Before gathering data, confirm:
- **Topic**: What exactly are we researching?
- **Audience**: Who will read this? (leadership, engineering, external)
- **Format**: Google Doc, Confluence page, or inline?
- **Depth**: Quick summary (30 min) or deep dive (thorough)?

### 2. Parallel Gathering (Claude Code)

Launch 5 gathering subagents simultaneously using the Task tool:

**Transcript Gatherer** (subagent_type: "general-purpose"):
- Search `local/private_transcripts/` and `knowledge/meeting_transcripts/`
- Extract relevant quotes, decisions, and action items
- Note speaker attributions and dates

**Jira Gatherer** (subagent_type: "general-purpose"):
- Search tickets related to the topic: `node scripts/atlassian-api.cjs jira search "text ~ 'topic'"`
- Get ticket details, comments, status, and linked issues
- Extract requirements, decisions, and blockers

**Analytics Gatherer** (subagent_type: "general-purpose"):
- Check PostHog for relevant metrics and experiments
- Check relevant Google Sheets: `node scripts/google-sheets-api.cjs read <spreadsheet_id> <range>`
- Look for relevant dashboards and reports

**Knowledge Base Gatherer** (subagent_type: "general-purpose"):
- Search Confluence: `node scripts/atlassian-api.cjs confluence search "query"`
- Check `knowledge/` for relevant docs
- Look for prior research on the topic

**Slack Gatherer** (subagent_type: "general-purpose"):
- Search relevant channels for discussions: `node scripts/slack-api.cjs search "topic"`
- Extract key threads and decisions
- Note unresolved questions

### 3. Sequential Gathering (Cursor)

When parallel execution isn't available, run each gatherer sequentially. Start with the most likely data-rich source for the topic.

### 4. Synthesis

After all gathering completes:

1. **Deduplicate**: Remove redundant information across sources
2. **Cross-reference**: Verify claims with multiple sources where possible
3. **Identify gaps**: Note what data is missing or uncertain
4. **Structure**: Organize findings into the document outline

### 5. Self-Review

Before presenting the document:

- **Accuracy check**: Are all quotes attributed correctly?
- **Completeness check**: Does it cover the user's question fully?
- **Hallucination check**: Is every claim backed by a source?
- **Recency check**: Is any data stale? Flag if older than 2 weeks.

### 6. Export

Based on user preference:

**Google Docs**:
```bash
node scripts/google-docs-creator.cjs create "Document Title" "<content>"
```

**Confluence**:
```bash
node scripts/atlassian-api.cjs confluence create-page --space TEAM --title "Title" --content "<content>"
```

**Inline**: Present directly in the conversation.

## Output Format

```
## [Document Title]

### Summary
<2-3 sentence executive summary>

### Key Findings
1. <finding with source attribution>
2. <finding with source attribution>
...

### Details
<organized by theme/topic>

### Open Questions
- <unanswered questions discovered during research>

### Sources
- [Transcript] Meeting name - Date
- [Jira] ALL-XXXX - Title
- [Confluence] Page title
- [Slack] #channel - Thread link
- [PostHog] Dashboard/Experiment name
```

## Rules

1. Every claim must have a source - no unsourced assertions
2. Flag uncertainty explicitly ("Based on limited data..." or "Only one source confirms...")
3. If first search returns nothing, try alternative keywords and date ranges before giving up
4. Present what was found even if partial - ask if user wants to broaden the search
5. Never fabricate sources or quotes
