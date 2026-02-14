---
name: audit-mode
description: Resource file for pm-librarian agent - full system audit
type: resource
---

# Audit Mode - PM Librarian

Run a comprehensive health check across the entire file system. This is the default mode and should be the first step before any cleanup or organization work.

## Audit Checklist

### 1. Knowledge Files (.ai/knowledge/)

- [ ] Count files and compare against knowledge-index.json entries
- [ ] Identify files present on disk but missing from index
- [ ] Identify index entries pointing to files that don't exist
- [ ] Flag " 2.md" duplicate files (Mac copy artifacts)
- [ ] Check for .bak files that should be cleaned
- [ ] Identify compressed/variant copies (e.g., about-me-compact.md alongside about-me.md)
- [ ] Check Confluence-synced files for staleness: `node .ai/scripts/confluence-sync.cjs --check`
- [ ] Report files not modified in 90+ days (potential staleness)

### 2. Configuration (.ai/config/)

- [ ] Validate all JSON files parse correctly
- [ ] Flag duplicate config files (e.g., "confluence-sync-config 2.json")
- [ ] Check agent-manifest.json references still resolve
- [ ] Verify CLAUDE.md and cursor-rules.md are in sync (diff key sections)

### 3. Local Data (.ai/local/)

- [ ] Report total size and breakdown by category
- [ ] Count backup files and calculate wasted space (keep 2 most recent per type)
- [ ] Check log file sizes (auto-pull.log, etc.) - flag if >100KB
- [ ] Report private_transcripts/ count and date range
- [ ] Check for orphaned temp files

### 4. Work Directory (.ai/work/)

- [ ] Count total files and subdirectories
- [ ] Identify work items older than 30 days
- [ ] Flag large files (>500KB)
- [ ] Report on project directories and their last-modified dates

### 5. Skills

- [ ] Run `node scripts/validate-skills.cjs` and report results
- [ ] Compare skills/_index.json against actual skill directories
- [ ] Check marketplace.json references all valid skill paths

### 6. Scripts (.ai/scripts/)

- [ ] Count files in _archive/ (candidates for compression)
- [ ] Check for duplicate node_modules nesting
- [ ] Verify .env.example exists alongside .env

### 7. Git Status

- [ ] Report untracked files in repo root (potential clutter)
- [ ] Check for files that should be in .gitignore
- [ ] Flag any tracked files that contain potential secrets

## Report Template

```markdown
## System Audit Report - [Date]

### Summary
| Category | Files | Issues | Health |
|----------|-------|--------|--------|
| Knowledge | N | N | OK/WARN/CRIT |
| Config | N | N | OK/WARN/CRIT |
| Local Data | N MB | N | OK/WARN/CRIT |
| Work | N files | N | OK/WARN/CRIT |
| Skills | N | N | OK/WARN/CRIT |
| Scripts | N | N | OK/WARN/CRIT |
| Git | - | N | OK/WARN/CRIT |

### Critical Issues (fix now)
1. ...

### Warnings (fix soon)
1. ...

### Suggestions (nice to have)
1. ...

### Space Recovery Opportunities
- [category]: [size] recoverable by [action]
- Total: N MB recoverable
```
