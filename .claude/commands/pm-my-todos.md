---
name: pm-my-todos
description: Manage personal todo list with sections
---

Manage personal todos in `.ai/local/my-todos.md` (gitignored, per-user).

**File location**: `.ai/local/my-todos.md`

**If file doesn't exist**: Create it with the template below.

## Format

The file supports arbitrary markdown headers (#, ##, ###, etc.) as sections:

```markdown
# Work

- [ ] pending item
- [x] completed item
- [ ] item with status #waiting
- [ ] item with person @trung
- [ ] item with both @vincent @nathaniel #blocked
- [ ] item with due date !2026-01-20
- [ ] item with everything @trung #in-progress !2026-01-18

## Backend
- [ ] sub-section item !tomorrow

## Frontend
- [ ] another item @corinne #in-progress !friday

# Personal

- [ ] personal item !next-week

---

## Completed

- [x] 2026-01-15: archived item
```

**Rules:**
- Headers (`#` to `######`) create sections
- Todos (`- [ ]` or `- [x]`) belong to the nearest preceding header
- A section named "Completed", "Archived", or "Done" is treated as the archive
- The `---` separator before the archive section is preserved

### Inline Metadata (Optional)

Todos support optional inline tags at the end of the line:

| Syntax | Purpose | Examples |
|--------|---------|----------|
| `@name` | Person involved | `@trung`, `@vincent`, `@kyler` |
| `#status` | Status tag | `#blocked`, `#waiting`, `#in-progress` |
| `!date` | Due date | `!2026-01-20`, `!tomorrow`, `!friday` |

**Due date formats**:
- Absolute: `!2026-01-20` (YYYY-MM-DD)
- Relative: `!today`, `!tomorrow`, `!friday`, `!next-week`, `!next-monday`
- When displayed, dates show as relative when close ("today", "tomorrow", "in 3 days") or absolute when far

**People matching**: Names are fuzzy-matched against `.ai/config/team-members.json`. Use first name (lowercase) for convenience:
- `@trung` → Trung Phan
- `@vincent` → Vincent Toms
- `@kyler` → Kyler Ross
- `@abhijay` → Abhijay Bhatnagar

**Status values**: Any `#tag` works, but common ones are:
- `#blocked` - Waiting on external dependency
- `#waiting` - Waiting for response from someone
- `#in-progress` - Actively working on it
- `#review` - Needs review
- `#scheduled` - Has a scheduled time

## Commands

Parse the argument to determine action:

| Input | Action |
|-------|--------|
| (empty) | Show all todos organized by section |
| `add [section] [item]` | Add todo to a section (fuzzy match section name) |
| `add [item] @person #status !date` | Add todo with people, status, and/or due date |
| `done [#]` | Mark todo #N as complete (1-indexed, across all sections) |
| `done [text]` | Mark todo matching text as complete |
| `clear` | Move completed items to archive section with today's date |
| `section [name]` | Add a new section |
| `status [#] [status]` | Update status on todo #N (e.g., `status 3 blocked`) |
| `due [#] [date]` | Set due date on todo #N (e.g., `due 3 friday`, `due 3 2026-01-20`) |
| `with [name]` | Filter todos to show only those involving a person |
| `overdue` | Show only overdue todos |
| `today` | Show todos due today |
| `week` | Show todos due this week |

## Behavior

1. **Read first**: Always read the file before any operation
2. **Show list**: After any change, show the updated todo list grouped by section
3. **Numbering**: When showing todos, number them globally (1, 2, 3...) for easy reference
4. **Section matching**: When adding, fuzzy-match section names (e.g., "work" matches "Work" or "## Work Items")
5. **Archive**: When clearing, move `- [x]` items to the Completed section with date prefix
6. **People resolution**: When adding with `@name`, validate against team-members.json and use canonical first name
7. **Display tags**: Show `@name`, `#status`, and `!date` inline when displaying todos
8. **Due date display**: Show overdue items first with ⚠️, then today, then upcoming. Convert relative dates to absolute on save
9. **Due date parsing**: Convert natural language ("tomorrow", "friday", "next week") to YYYY-MM-DD format

## Examples

**User**: `/pm-my-todos`
**Response**:
```
Your todos:

# Work (2 pending)
⚠️ 1. [ ] Follow up: databroker alignment !2026-01-14 (overdue)
2. [ ] Follow up: Fauna PII @trung #waiting !2026-01-16 (tomorrow)

# Personal (1 pending)
3. [ ] Schedule dentist !2026-01-20

Archived: 5 items
```

**User**: `/pm-my-todos add work review PR #123 @vincent !friday`
**Response**:
```
Added to Work: review PR #123 @vincent !2026-01-17

# Work (3 pending)
⚠️ 1. [ ] Follow up: databroker alignment !2026-01-14 (overdue)
2. [ ] Follow up: Fauna PII @trung #waiting !2026-01-16 (tomorrow)
3. [ ] review PR #123 @vincent !2026-01-17 (Fri)
```

**User**: `/pm-my-todos status 3 blocked`
**Response**:
```
Updated: review PR #123 @vincent → #blocked

# Work (3 pending)
⚠️ 1. [ ] Follow up: databroker alignment !2026-01-14 (overdue)
2. [ ] Follow up: Fauna PII @trung #waiting !2026-01-16 (tomorrow)
3. [ ] review PR #123 @vincent #blocked !2026-01-17 (Fri)
```

**User**: `/pm-my-todos due 3 next-monday`
**Response**:
```
Updated: review PR #123 @vincent → !2026-01-20

# Work (3 pending)
⚠️ 1. [ ] Follow up: databroker alignment !2026-01-14 (overdue)
2. [ ] Follow up: Fauna PII @trung #waiting !2026-01-16 (tomorrow)
3. [ ] review PR #123 @vincent #blocked !2026-01-20 (Mon)
```

**User**: `/pm-my-todos overdue`
**Response**:
```
Overdue todos:

⚠️ 1. [ ] Follow up: databroker alignment !2026-01-14 (1 day overdue)
```

**User**: `/pm-my-todos with trung`
**Response**:
```
Todos with Trung Phan:

2. [ ] Follow up: Fauna PII @trung #waiting
```

**User**: `/pm-my-todos done 1`
**Response**:
```
Completed: Follow up: databroker alignment

# Work (2 pending, 1 done)
1. [x] Follow up: databroker alignment
2. [ ] Follow up: Fauna PII @trung #waiting
3. [ ] review PR #123 @vincent #blocked
```

**User**: `/pm-my-todos section Learning`
**Response**:
```
Added section: Learning

# Work (2 pending, 1 done)
...

# Learning (0 pending)
No items yet
```

**User**: `/pm-my-todos clear`
**Response**:
```
Archived 1 completed item.

# Work (2 pending)
1. [ ] Follow up: Fauna PII @trung #waiting
2. [ ] review PR #123 @vincent #blocked

Archived: 6 items
```

## Argument

$ARGUMENTS
