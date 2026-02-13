---
name: cross-reference-mode
description: Resource file for pm-librarian agent - consistency and drift detection
type: resource
---

# Cross-Reference Mode - PM Librarian

Detect inconsistencies, drift, and conflicts across datasets. This mode compares multiple sources of truth and flags mismatches.

## Cross-Reference Checks

### 1. Knowledge Index vs File System

**What**: Verify `config/knowledge-index.json` matches actual files in `knowledge/`.

**How**:
```bash
# Files in index but not on disk
jq -r '.knowledge_files[].file' config/knowledge-index.json | while read f; do
  [ ! -f "knowledge/$f" ] && echo "MISSING: $f"
done

# Files on disk but not in index
find knowledge -type f -name "*.md" | sed 's|knowledge/||' | while read f; do
  jq -e --arg f "$f" '.knowledge_files[] | select(.file == $f)' config/knowledge-index.json > /dev/null 2>&1 || echo "UNINDEXED: $f"
done
```

**Fix**: Add missing entries to index, or remove stale index entries.

### 2. Skills Index vs Skill Directories

**What**: Verify `skills/_index.json` matches actual skill directories.

**How**:
```bash
node scripts/validate-skills.cjs
# Then compare:
diff <(jq -r '.skills | keys[]' skills/_index.json | sort) \
     <(find skills -name SKILL.md -exec dirname {} \; | sed 's|skills/[^/]*/||' | sort)
```

**Fix**: Run `node scripts/generate-index.cjs` to regenerate.

### 3. CLAUDE.md vs cursor-rules.md

**What**: These two files must stay synchronized on ALWAYS rules.

**How**: Diff the key sections:
- CLI commands table
- API keys section
- Bash command safety
- Knowledge discovery rules
- Jira defaults

**Fix**: Copy updated sections from the more recent file to the other.

### 4. Skill required_context vs Knowledge Files

**What**: Skills reference knowledge files in their manifest's `required_context`. Verify those files exist.

**How**:
```bash
find skills -name manifest.json -exec jq -r '.required_context[]?' {} \; | sort -u | while read f; do
  [ ! -f "knowledge/$f" ] && echo "MISSING CONTEXT: $f"
done
```

**Fix**: Either create the missing knowledge file or update the skill manifest.

### 5. Agent Manifest vs Skills

**What**: `config/agent-manifest.json` may reference archived agents that have been migrated to skills.

**How**: Check each agent entry's status field and verify path exists.

**Fix**: Update manifest entries to point to new skill locations, or mark as deprecated.

### 6. Team Members vs References

**What**: `config/team-members.json` should match references in transcripts and updates.

**How**: Extract names from recent transcripts and updates, compare against team-members.json entries.

**Fix**: Add missing team members, mark departed ones.

### 7. Confluence Sync Freshness

**What**: Confluence-synced files may be stale if not updated recently.

**How**:
```bash
node scripts/confluence-sync.cjs --check
```

**Fix**: Run sync for stale pages: `node scripts/confluence-sync.cjs --page <ID>`

### 8. Experiment Index vs Experiment Files

**What**: `knowledge/experiments/_index.json` should match actual experiment files.

**How**: Compare index entries against files in experiment category directories.

**Fix**: Regenerate experiment index or add missing experiments.

## Drift Detection Report

```markdown
## Cross-Reference Report - [Date]

### Index Drift
| Index | Expected | Actual | Drift |
|-------|----------|--------|-------|
| knowledge-index.json | N files | N files | +N/-N |
| skills/_index.json | N skills | N skills | +N/-N |
| agent-manifest.json | N agents | N active | N stale |
| experiments/_index.json | N exps | N files | +N/-N |

### Broken References
- [source file] references [target] which does not exist

### Stale Syncs
- [file]: last synced [date], source updated [date]

### Inconsistencies
- [file A] says X, [file B] says Y about the same topic

### Proposed Fixes
1. [specific fix with risk level]
```

## When to Run Cross-References

- After adding/removing knowledge files
- After creating/deleting skills
- After Confluence page updates
- After team changes (new hires, departures)
- Weekly as part of system maintenance
- Before major system changes (migration, restructure)
