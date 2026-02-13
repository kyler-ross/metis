---
name: clean-mode
description: Resource file for pm-librarian agent - cleanup proposals
type: resource
---

# Clean Mode - PM Librarian

Propose and execute cleanup operations. Every action requires user approval. Group proposals by risk level.

## Cleanup Categories

### 1. Duplicate Files (Safe)

**Pattern**: Mac creates " 2.md" copies when files conflict during sync.

**Detection**:
```bash
find . -name "* 2.*" -o -name "* 2"
```

**Action**: For each duplicate:
1. Diff the original and copy: are they identical?
2. If identical: propose deleting the " 2" copy
3. If different: show the diff and ask which to keep
4. If the " 2" version is newer/better: propose renaming it to replace original

**Known locations** (from audit):
- `knowledge/` - 11+ " 2.md" files
- `config/` - 3 duplicate sync configs
- `knowledge/meeting_transcripts/` - 5 scrum duplicates

### 2. Backup Pruning (local/)

**Policy**: Keep the 2 most recent backups per type. Archive or delete older ones.

**Detection**:
```bash
ls -lt local/context-enrichment.db*.json
ls -lt local/temporal-db*.json
```

**Action**:
1. List all backup files sorted by date
2. Identify the 2 most recent per category
3. Calculate space savings from removing the rest
4. Propose deletion with space recovery estimate

**Categories**:
- `context-enrichment.db-*.backup.json` - Context enrichment backups
- `temporal-db-v2-*.backup.json` - Temporal database backups
- `temporal-db-v2-backup-*.json` - Legacy temporal backups

### 3. Log Rotation

**Policy**: Truncate logs over 100KB. Keep last 500 lines.

**Detection**:
```bash
find local/ -name "*.log" -size +100k
```

**Action**:
1. Report log file sizes
2. Propose truncating to last 500 lines
3. For completed/old logs, propose archival or deletion

### 4. Work Directory Archival (work/)

**Policy**: Work items older than 30 days should be reviewed for archival.

**Detection**:
```bash
find work/ -maxdepth 1 -mtime +30 -type f -o -mtime +30 -type d
```

**Action**:
1. List items older than 30 days with sizes
2. Categorize: still relevant vs. safely archivable
3. Propose moving to `work/_archive/` or deletion
4. For project directories, check if they have active references

### 5. Script Archive Compression

**Pattern**: `scripts/_archive/` accumulates old scripts.

**Action**:
1. Count and size the archive directory
2. If >30 files or >1MB: propose compressing to a tar.gz
3. Keep the tar.gz, remove individual files

### 6. Stale Knowledge Files

**Detection**: Files not referenced by any agent or index, or not modified in 6+ months.

**Action**:
1. Cross-reference against knowledge-index.json tags
2. Check if any skill references the file in required_context
3. If unreferenced: flag for review (don't auto-delete knowledge)
4. If referenced but stale: flag for content review

## Execution Protocol

```
1. ALWAYS show the full list of proposed changes first
2. Group by risk: Safe / Needs Review / Destructive
3. Ask for blanket approval on "Safe" items, individual approval on others
4. Execute approved changes
5. Generate summary of what was done
6. Update any affected indexes (knowledge-index.json, _index.json)
```

## What NOT to Clean

- `local/private_transcripts/` - Never touch content
- `local/granola-tokens.json` - Active OAuth tokens
- `scripts/.env` - Credentials file
- `~/.pm-ai-env.sh` - Shell environment
- Any file with active git modifications (check `git status` first)
