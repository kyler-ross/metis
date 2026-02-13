---
name: organize-mode
description: Resource file for pm-librarian agent - file placement and organization
type: resource
---

# Organize Mode - PM Librarian

Handle file placement, naming conventions, and index maintenance. Use when new information needs to be stored or existing information needs better organization.

## File Placement Rules

### Where Does This File Go?

```
Is it a knowledge document (reference, guide, schema)?
  → knowledge/ (and add to knowledge-index.json)

Is it a meeting transcript?
  → knowledge/meeting_transcripts/ (if team/public)
  → local/private_transcripts/ (if sensitive/1:1)

Is it experiment data?
  → knowledge/experiments/<category>/

Is it a temporary work product (draft, analysis, report)?
  → work/<project-name>/

Is it a system configuration?
  → config/

Is it a CLI script or tool?
  → scripts/ (entry point)
  → scripts/lib/ (shared library)

Is it private user data?
  → local/

Is it a status update?
  → updates/YYYY/MM/
```

### Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Knowledge docs | `kebab-case.md` | `product-features.md` |
| Meeting transcripts | `YYYY-MM-DD-title.md` | `2026-02-11-standup.md` |
| Experiment files | `<experiment-id>.json` | `remove-paywall-gate.json` |
| Config files | `kebab-case.json` | `knowledge-index.json` |
| Status updates | `YYYY-MM-DD-author.md` | `2026-02-11-your-name.md` |
| Work drafts | descriptive name | `prd-freemium-q1-2026.md` |
| Backup files | `<name>-<timestamp>.backup.<ext>` | `temporal-db-v2-1234.backup.json` |

### Forbidden Names

- Spaces in filenames (use hyphens)
- " 2" suffix (Mac copy artifact - resolve immediately)
- Generic names: `temp.md`, `test.json`, `draft.md`
- Names with special characters: `&`, `(`, `)`, `#`

## Knowledge Index Maintenance

When adding a file to `knowledge/`, ALWAYS update `config/knowledge-index.json`:

```json
{
  "file": "new-file-name.md",
  "tags": ["relevant", "semantic", "tags"],
  "agents": ["skills-that-use-this"],
  "priority": "normal",
  "size_lines": 150,
  "description": "Brief description of what this file contains"
}
```

**Tag guidelines**:
- Use existing tags when possible (check `tag_to_documents` section)
- Add new tags only when no existing tag fits
- Every file needs at least 2 tags
- Include the content domain: "product", "engineering", "metrics", "jira", etc.

## Storing Random Information

When the user says "remember this" or "store this somewhere":

1. **Determine the type** - Is it knowledge, a decision, a data point, a preference?
2. **Check for existing home** - Does a file already cover this topic?
3. **Append or create**:
   - If existing file covers the topic: append to it with a date header
   - If new topic: create appropriately named file in knowledge/
4. **Update index** - Add/update entry in knowledge-index.json
5. **Confirm** - Tell user where it was stored and how to find it

## Directory Creation Rules

- Only create subdirectories when a topic has 3+ files
- Keep nesting to max 2 levels under knowledge/
- Group by domain, not by date (dates go in filenames)

## Reorganization Protocol

When reorganizing existing files:

1. **Map current state** - List all files being moved
2. **Propose new structure** - Show before/after
3. **Check for references** - Grep for old paths in:
   - CLAUDE.md and cursor-rules.md
   - knowledge-index.json
   - Agent manifest
   - Skill required_context
   - Script imports
4. **Get approval** - Never reorganize without confirmation
5. **Execute moves** - Move files, update all references
6. **Verify** - Confirm no broken references remain
