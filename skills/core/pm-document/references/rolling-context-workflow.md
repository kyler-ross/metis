---
name: rolling-context-workflow
description: Resource file for pm-document agent
type: resource
---

# PM Document - Rolling Context Workflow

This resource contains the workflow for updating rolling team context files.

---

## Purpose

Maintain up-to-date rolling context for each team you manage. Rolling context tracks:
- Current sprint focus and major initiatives
- Active work (in progress and recently completed)
- Recent decisions (last 2 weeks)
- Open questions that need answering
- Key metrics and trends
- Recent learnings from experiments/incidents
- Blockers and risks

**Use this when**: After major decisions, weekly context refresh, or when work status changes significantly.

---

## File Locations

**Rolling context path**: `.ai/context/rolling/[team_key]-context.md`

**Examples**:
- `.ai/context/rolling/app-experience-context.md`
- `.ai/context/rolling/cloaked-labs-context.md`
- `.ai/context/rolling/platform-context.md`

**One file per team** from user's `teams_managed` in their profile.

---

## Workflow: Update Rolling Context

### Step 1: Identify What Changed

**From conversation**, extract:
- New work items started
- Work items completed or status changed
- New decisions made
- New questions raised
- New metrics or metric changes
- New learnings (experiment results, user research, incidents)
- New blockers or resolved blockers

**From Jira** (past 7 days for context refresh):
```bash
node .ai/scripts/atlassian-api.js jira search "project = ALL AND updated >= -7d AND assignee in ([team members])"
```

Extract:
- New tickets for this team
- Status changes (To Do → In Progress → Done)
- Tickets marked as Blocked
- Completed work

**From Confluence** (past 7 days):
```bash
node .ai/scripts/atlassian-api.js confluence search "space in ([team spaces]) AND lastModified >= -7d"
```

Extract:
- New PRDs or specs
- Updates to existing docs
- Decisions documented in pages

### Step 2: Load Current Rolling Context

**Read existing file** for this team:
- `.ai/context/rolling/[team]-context.md`

**Understand current state**:
- What work is currently "In Progress"?
- What decisions are in "Recent Decisions"?
- What questions are in "Open Questions"?
- When was this last updated?

### Step 3: Determine Updates Needed

**Add new content**:
- New work items → Active Work (In Progress)
- New decisions → Recent Decisions (with date: YYYY-MM-DD)
- New questions → Open Questions
- New metrics → Key Metrics
- New learnings → Recent Learnings
- New blockers → Blockers & Risks

**Update existing content**:
- Work status changes:
  - In Progress → Recently Completed (if done)
  - Recently Completed → Remove (if >1 week old)
- Question answers:
  - Answered questions → Move to decisions or remove
- Metric updates:
  - Update values
  - Add trend indicators (⬆️ up, ⬇️ down, ➡️ flat)
- Blocker status:
  - Mark as Resolved if fixed
  - Remove if resolved >1 week ago

**Prune old content**:
- Decisions > 2 weeks old → Move to Archive section
- Completed work > 1 week old → Remove from Recently Completed
- Resolved questions → Remove (they're in daily logs)
- Resolved blockers → Remove (if >1 week ago)
- Old learnings > 30 days → Consider archiving

### Step 4: Prepare Rolling Context Updates

**DO NOT WRITE YET. Prepare the changes internally first.**

**Structure to maintain**:

```markdown
# [Team Name] Rolling Context

**PM**: [name]
**Last Updated**: [NEW timestamp]

---

## Current Sprint Focus

[High-level sprint goals - UPDATE if sprint changed or focus shifted]

---

## Active Work

### In Progress
[KEEP existing + ADD new work items]
- **[Initiative/Feature]** - Status: [status] - Owner: [person] - Timeline: [date]
  - Context: [Why we're doing this]
  - Progress: [What's done, what's left]
  - Tickets: [ALL-123, ALL-456]
  - Blockers: [If any]

### Recently Completed
[MOVE completed items from "In Progress" here]
[REMOVE items >1 week old]
- **[Feature]** - Shipped: [date] - Impact: [outcome if known]

---

## Recent Decisions (Last 2 Weeks)

[KEEP decisions from last 2 weeks]
[ADD new decisions from today]
[MOVE old decisions (>2 weeks) to Archive]

- **[YYYY-MM-DD]**: [Decision] - [Rationale] - Impact: [what changes] - Owner: [person]

---

## Open Questions

[KEEP unanswered questions]
[ADD new questions from today]
[REMOVE answered questions (move to decisions or archive)]

- **[Question]** - Asked by: [person], Date: [when]
  - Context: [Why this matters]
  - Potential owners: [Who might answer]
  - Follow-up: [Ticket/thread if created]

---

## Key Metrics

[UPDATE metrics with latest values]
[ADD trend indicators]

- **[Metric Name]**: [NEW value] ([⬆️⬇️➡️ trend vs last update]) - Last updated: [NEW date]
  - Context: [What this means, target if any]

---

## Recent Learnings

[ADD new learnings from today]
[KEEP learnings from last 30 days]
[CONSIDER ARCHIVING learnings >30 days old]

- **[Learning]** - Date: [when]
  - From: [Experiment / User research / Incident]
  - Implication: [What we should do differently]

---

## Blockers & Risks

[UPDATE blocker status]
[ADD new blockers]
[REMOVE resolved blockers >1 week old]

- **[Blocker/Risk]** - Owner: [person] - Since: [when]
  - Impact: [What's blocked/at risk]
  - Plan: [How we're resolving it]
  - Status: [Active / Resolving / Escalated]

---

## Archive (Decisions > 2 Weeks Old)

[MOVE old decisions here instead of deleting]
[Maintains history without cluttering main sections]

---

_Auto-updated by /pm-document. Last manual edit: [if applicable]_
```

### Step 5: Format Changes as Diff (Preview)

**Show what will change** using diff-style formatting:

```markdown
## Rolling Context Update Preview

**Team**: [Team Name]
**File**: `.ai/context/rolling/[team]-context.md`

---

### Changes to Active Work

```diff
## Active Work

### In Progress
+ - **Feed Urgent Tasks Integration** - Status: In Development - Owner: Lucas - Timeline: Jan 15
+   - Context: Experiment shows 2x lift for urgent tasks CTA
+   - Progress: Designs complete, backend API in progress
+   - Tickets: [ALL-1234, ALL-1235]

- - **Wallet Tab Basic Mode** - Status: In Development - Owner: Vincent - Timeline: Dec 20
+ - **Wallet Tab Basic Mode** - Moved to Recently Completed

### Recently Completed
+ - **Wallet Tab Basic Mode** - Shipped: Dec 18 - Impact: Pending analytics
- - **Health Meter V1** - Shipped: Nov 10 - [REMOVED: >1 week old]
```

### Changes to Recent Decisions

```diff
## Recent Decisions (Last 2 Weeks)

+ - **2026-01-01**: Prioritize urgent tasks CTA over scan again - Experiment data shows 2x conversion lift - Owner: Lucas
- - **2025-12-10**: [OLD DECISION >2 weeks] - [MOVED TO ARCHIVE]
```

### Changes to Key Metrics

```diff
## Key Metrics

- - **Health Meter Engagement**: 15% (⬆️ from 12%) - Last updated: 2025-12-18
+ - **Health Meter Engagement**: 18% (⬆️ from 15%) - Last updated: 2026-01-01
+   - Context: Target is 20% by end of Q1; on track
```
---

Does this look correct? Should I update the rolling context file?
```

### Step 6: Get Approval

**🚨 CRITICAL: Wait for explicit approval before writing.**

```
Say "yes" or "looks good" to proceed with these updates.
Say "no" or "wait" if you want changes.
```

### Step 7: Write Rolling Context (Only After Approval)

**Only execute after user approves.**

1. **Update file**: Apply all changes to `.ai/context/rolling/[team]-context.md`
2. **Update timestamp**: Set "Last Updated" at top of file
3. **Preserve manual edits**: Don't overwrite user's custom additions
4. **Confirm to user**:
   ```
   ✅ Rolling context updated!

   Team: [Team Name]
   File: .ai/context/rolling/[team]-context.md

   Changes:
   - Added 2 new work items
   - Added 1 decision
   - Updated 2 metrics
   - Archived 1 old decision
   - Removed 1 completed item (>1 week old)

   Context is current as of [timestamp]
   ```

---

## Update Strategies

### Weekly Refresh (Comprehensive)

**Frequency**: Once per week (e.g., Friday afternoon)

**Process**:
- Review all sections
- Update all metrics
- Move completed work
- Archive old decisions
- Remove resolved items
- Ensure sprint focus is current

### After Major Decisions (Targeted)

**Frequency**: As needed

**Process**:
- Add decision to Recent Decisions
- Update affected work items
- Add related questions if any
- Update metrics if decision impacts them

### After Sprint Changes (Sprint Focus)

**Frequency**: Start of each sprint

**Process**:
- Update "Current Sprint Focus"
- Move completed items to "Recently Completed"
- Add new sprint work to "In Progress"
- Archive sprint-end retrospective learnings

---

## Quality Standards

### Dates

- **Always YYYY-MM-DD format**: "2026-01-01" not "Jan 1" or "1/1/26"
- **Include dates for decisions**: So we know when to archive them
- **Include "Since" date for blockers**: Track how long they've been blocked

### Trends

- **Use emoji indicators**:
  - ⬆️ Trending up (positive or improving)
  - ⬇️ Trending down (negative or declining)
  - ➡️ Flat (no significant change)

### Tickets

- **Link inline**: `[ALL-123]` when referencing
- **Group in work items**: List all related tickets under a work item

### Status Indicators

- **Be specific**: "In Development", "In Review", "Testing", not just "In Progress"
- **Use standard terms**: So it's clear across teams

### Pruning

- **Archive, don't delete**: Move old content to Archive section
- **Keep history**: Useful for retrospectives and learning

---

## Multi-Team Support

**If user manages multiple teams**:

1. **Process each team separately**:
   - Load context for Team A
   - Prepare updates for Team A
   - Get approval for Team A
   - Write updates for Team A
   - Repeat for Team B, C, etc.

2. **Show team-by-team previews**:
   ```
   I'll update rolling context for 2 teams:

   ---
   ## Team 1: App Experience
   [Preview changes]

   ---
   ## Team 2: Cloaked Labs
   [Preview changes]

   ---
   Should I proceed with both updates?
   ```

3. **Confirm each team**:
   ```
   ✅ Updated rolling context for:
   - App Experience
   - Cloaked Labs

   Both files are current as of [timestamp]
   ```

---

## Error Handling

**If rolling context file doesn't exist**:
- "Rolling context file for [team] doesn't exist. Should I create it?"
- If yes, use initialization process (see daily-chief-of-staff initialization.md)

**If uncertain about changes**:
- "I'm not sure if [item] should be archived or kept. What do you think?"
- Always ask when in doubt

**If file write fails**:
- "Couldn't write to rolling context file. Please check file permissions."
- Show changes to user so they can apply manually
