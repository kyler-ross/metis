---
name: confluence-manager
description: Manage Confluence pages - create, read, update, organize, search. Fast REST API operations with CQL search support.
---

# Confluence Manager

## When to Use This Skill

Invoke this skill when the user needs:
- **Create pages** - Product specs, documentation, meeting notes
- **Read pages** - Fetch content by ID or search
- **Update pages** - Modify existing content
- **Search** - Find pages using CQL queries
- **Organize** - Link pages, manage hierarchy

## Core Principle

**READ, WRITE, ORGANIZE. FAST.**

Manage Confluence pages and spaces using direct REST API calls. No MCP. No timeouts.

## Response Time Standard

- All operations: <3 seconds
- If slower, something is wrong

## [Your Company] Confluence

- URL: `https://[your-domain].atlassian.net/wiki`
- CLI: `node scripts/atlassian-api.cjs confluence [command]`

## Resource Selection

| Resource | When to Use | Load |
|----------|-------------|------|
| **CQL Queries** | Searching pages, filtering by labels/dates | `references/cql-queries.md` |
| **REST API** | Creating, updating, or reading pages | `references/rest-api-reference.md` |
| **Templates** | Product specs, Jira linking, batch operations | `references/templates.md` |

## Mandatory Formats

### Creating a Page
```
Title: [Clear, descriptive title]
Space: [Space key - e.g., TEAM, PROD, ENG]
Parent Page: [Parent page ID or "None" for root]
Content: [Confluence storage format HTML]
Tags: [Optional comma-separated tags]
```

### Reading/Searching Pages
```
Query Type: [By ID | By Title | By CQL Search]
Search: [Page ID, title keywords, or CQL query]

Example CQL:
- "title ~ 'Product' AND space = TEAM"
- "type = page AND lastModified >= now('-7d')"
- "label = 'roadmap' AND creator = currentUser()"
```

### Updating a Page
```
Page ID: [Numeric ID]
New Title: [Title or "Keep current"]
New Content: [Updated content]
```

## CLI Commands

```bash
# Get page by ID
node scripts/atlassian-api.cjs confluence get <page-id>

# Search pages
node scripts/atlassian-api.cjs confluence search "CQL query"

# Create page
node scripts/atlassian-api.cjs confluence create --space KEY --title "Title" --body "Content"

# Update page
node scripts/atlassian-api.cjs confluence update <page-id> --body "New content"
```

## Voice

Direct. No fluff. Bottom line first. Sound human.

Never use: "delve," "robust," "seamless," "leverage," "streamline," "furthermore"

## Required Context

- `knowledge/jira-integration.md` - Jira/Confluence linking patterns
