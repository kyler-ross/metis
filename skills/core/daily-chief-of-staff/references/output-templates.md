---
name: output-templates
description: Resource file for daily-chief-of-staff agent
type: resource
---

# Daily Chief of Staff - Output Templates

This resource contains templates for daily logs, rolling context, session summaries, and documentation formats.

---

## Purpose

Standardized formats for documenting daily work, maintaining rolling context, and presenting session summaries.

**Use this when**: User wants to document their day, update context, or you need to generate structured outputs.

---

## Daily Log Template

**File**: `context/daily-logs/YYYY-MM-DD-[pm_owner].md`

**Behavior**: Append to existing file (don't overwrite) or create new if first entry

**Structure**:

```markdown
# Daily Log - [Day of Week], [Month] [Day], [Year]

## What I Did Today
- [Action 1] - [Brief context, link to ticket/doc if relevant]
  - Example: "Created PROJ-XXX for [Feature Redesign] notification card"
  - Example: "Updated [Feature Name] CTA experiment to increase rollout to 50%"
- [Action 2] - [Brief context]
- [Action 3] - [Brief context]

## Decisions Made
- **[Decision Title]**: [What was decided] - [Rationale/data] - Owner: [person]
  - Example: "**Feed Urgent Tasks CTA**: Prioritize urgent tasks over scan again based on 2x conversion lift in experiment - Owner: Alice"
- **[Decision Title]**: [What was decided] - [Rationale] - Owner: [person]

## Jira Activity

### Created
- [PROJ-XXX](https://[your-domain].atlassian.net/browse/PROJ-XXX) - [Ticket Title]
- [PROJ-XXX](https://[your-domain].atlassian.net/browse/PROJ-XXX) - [Ticket Title]

### Updated
- [PROJ-XXX](https://[your-domain].atlassian.net/browse/PROJ-XXX) - [What changed]
  - Example: "Updated acceptance criteria to include offline support"

### Blocked
- [PROJ-XXX](https://[your-domain].atlassian.net/browse/PROJ-XXX) - [Blocker description]
  - Example: "Blocked pending design review from Carol"

## Confluence Activity
- Updated: [Page Title](URL) - [What changed]
- Created: [Page Title](URL) - [Purpose]
- Commented on: [Page Title](URL) - [Topic]

## Follow-ups Created
- [ ] [Follow-up task] - Owner: [person] - Deadline: [when]
  - Example: "[ ] Schedule technical assessment for [Feature Tab] with Dave - Owner: Alice - By Friday"
- [ ] [Follow-up task] - Owner: [person] - Deadline: [when]

## Open Questions
- [Question] - Raised by: [person], Context: [why it matters], Likely owner: [who should answer]
  - Example: "Should we support offline mode for [Feature Tab]? - Raised by: Bob, Context: Impacts architecture complexity, Likely owner: Engineering + Alice"

## Notes & Learnings
- [Strategic context, team dynamics, important realizations, metrics insights]
  - Example: "Health meter 'urgent tasks' CTA outperforms 'scan again' by 2x in early experiment data"
  - Example: "Team velocity dropped this sprint due to platform stability issues"

---

_Generated at: [timestamp]_
_Based on: [X decisions, Y Jira tickets, Z Confluence pages, conversation with Chief of Staff]_
```

**Append Logic**:
- If file exists for today, read it first
- Add new items to existing sections (don't duplicate)
- Update timestamp at bottom
- Preserve any manual notes user added

---

## Rolling Context Template

**File**: `context/rolling/[team_key]-context.md`

**Behavior**: Update specific sections (replace or append as needed)

**Structure**:

```markdown
# [Team Name] Rolling Context

**PM**: [name]
**Last Updated**: [timestamp]

---

## Current Sprint Focus

[High-level sprint goals, major initiatives]

Example:
> Sprint 47 (Dec 18 - Jan 8):
> - Launch Feed Urgent Tasks CTA experiment
> - Complete [Feature Tab] Basic mode integration
> - [Feature Name] V2 design finalization

---

## Active Work

### In Progress
- **[Initiative/Feature]** - Status: [In Development / In Review / Testing] - Owner: [person] - Timeline: [target date]
  - Context: [Why we're doing this, user impact, business goal]
  - Progress: [What's done, what's left]
  - Tickets: [PROJ-XXX, PROJ-XXX]
  - Blockers: [If any]

Example:
> - **Feed Urgent Tasks Integration** - Status: In Development - Owner: Alice - Timeline: Jan 15
>   - Context: Health meter experiment shows 2x lift for urgent tasks CTA vs scan again
>   - Progress: Designs complete, backend API in progress
>   - Tickets: [PROJ-XXX, PROJ-XXX]
>   - Blockers: None

### Recently Completed
- **[Feature]** - Shipped: [date] - Impact: [metric or outcome if known]
- **[Feature]** - Shipped: [date] - Impact: [metric or outcome]

Example:
> - **[Feature Name] V1** - Shipped: Dec 10 - Impact: 15% of users engaged in first week
> - **[Feature Tab] (Advanced mode)** - Shipped: Nov 28 - Impact: Pending analytics

---

## Recent Decisions (Last 2 Weeks)

- **[YYYY-MM-DD]**: [Decision] - [Rationale] - Impact: [What changes] - Owner: [person]

Example:
> - **2025-12-15**: Prioritize urgent tasks CTA over scan again - Experiment data shows 2x conversion lift - Impact: Changes Feed redesign scope - Owner: Alice
> - **2025-12-12**: Delay Wallet offline mode - Technical complexity too high for Q1 timeline - Impact: Removes from roadmap - Owner: Alice + Bob

---

## Open Questions

- **[Question]** - Asked by: [person], Date: [when]
  - Context: [Why this matters, what's blocked or affected]
  - Potential owners: [Who might answer]
  - Follow-up: [Ticket/thread if created]

Example:
> - **Should [Feature Tab] support offline mode?** - Asked by: Bob, Date: 2025-12-18
>   - Context: Impacts architecture complexity and Q1 timeline
>   - Potential owners: Engineering team + Alice
>   - Follow-up: Scheduled technical assessment for Dec 22

---

## Key Metrics

- **[Metric Name]**: [Value] ([trend indicator: ⬆️⬇️➡️]) - Last updated: [date]
  - Context: [What this means, why it matters, target if any]

Example:
> - **[Feature Name] Engagement**: 15% of users (⬆️ from 12% last week) - Last updated: 2025-12-18
>   - Context: Target is 20% by end of Q1; on track
> - **Feed Task Completion**: 8% (➡️ flat) - Last updated: 2025-12-18
>   - Context: Baseline before urgent tasks experiment launches

---

## Recent Learnings

- **[Learning]** - Date: [when]
  - From: [Experiment / User research / Incident / Retro]
  - Implication: [What we should do differently, what we learned]

Example:
> - **Urgent tasks CTA outperforms scan again by 2x** - Date: 2025-12-15
>   - From: [Feature Name] A/B experiment (n=500 users)
>   - Implication: Prioritize task-focused CTAs over generic actions in Feed redesign

---

## Blockers & Risks

- **[Blocker/Risk]** - Owner: [person] - Since: [when]
  - Impact: [What's blocked, what's at risk]
  - Plan: [How we're resolving it, escalation if needed]
  - Status: [Active / Resolving / Escalated]

Example:
> - **Design bandwidth for Feed V2** - Owner: Carol - Since: 2025-12-10
>   - Impact: Feed redesign timeline at risk; need mockups by Jan 5
>   - Plan: Escalated to Carol, reprioritizing Carol's roadmap
>   - Status: Resolving

---

## Archive (Decisions > 2 Weeks Old)

[Moved here automatically to keep main sections focused]

Example:
> - **2025-11-30**: Chose React Native over native iOS for [Feature Tab] - Faster development, shared codebase - Owner: Bob

---

_Auto-updated by /pm-document. Last manual edit: [if applicable]_
```

**Update Logic**:

1. **Add new content** from today:
   - New work items → Active Work (In Progress)
   - New decisions → Recent Decisions (with date)
   - New questions → Open Questions (with context)
   - New metrics → Key Metrics (with trends)
   - New learnings → Recent Learnings

2. **Update existing content**:
   - Work status changes (In Progress → Recently Completed)
   - Question answers (move to decisions or remove)
   - Metric updates (update values, add trend indicators)
   - Blocker status (resolved? add resolution)

3. **Prune old content**:
   - Decisions > 2 weeks old → Move to Archive section
   - Completed work > 1 week old → Remove from Recently Completed
   - Resolved questions → Remove (they're in daily logs)
   - Resolved blockers → Remove
   - Old learnings > 30 days → Consider archiving

4. **Update timestamp** at top of file

---

## Session Summary Template

**Use when**: User completes a Chief of Staff session and you need to summarize what was accomplished.

**Format**:

```markdown
## ✅ Session Summary

**Date**: [today's date]
**Duration**: [approximate time spent]
**Items Addressed**: [count of priorities tackled]

---

### What We Accomplished Today

**Decisions Made**:
- [Decision 1] - [Brief rationale]
- [Decision 2] - [Brief rationale]

**Actions Taken**:
- Created [X] Jira tickets: [list ticket keys]
- Updated [Y] PRDs/docs: [list doc names]
- Scheduled [Z] follow-ups: [list meeting/tasks]

**Documentation Updated**:
- ✅ Daily log: `context/daily-logs/[date]-[pm_owner].md`
- ✅ Rolling context: [list teams updated]

---

### Still Pending

**Open Questions**:
- [Question 1] - Owner: [person]
- [Question 2] - Owner: [person]

**Follow-ups**:
- [ ] [Task 1] - By: [date]
- [ ] [Task 2] - By: [date]

---

### Next Steps

**For Tomorrow**:
- Review [specific item]
- Follow up with [person] on [topic]
- Check experiment results for [feature]

**This Week**:
- [Strategic task or milestone]
- [Team sync or stakeholder update]

---

**Your context is now up to date. See you tomorrow!**
```

---

## Documentation Preview Template

**Use when**: Showing user what will be documented before writing files.

**Format**:

```markdown
## 📋 Documentation Preview

I've analyzed today's conversation and activity. Here's what I'll document:

---

### Daily Log Updates
**File:** `context/daily-logs/[date]-[pm_owner].md`

**Content to add/update:**
```
## What I Did Today
- [Item 1]
- [Item 2]

## Decisions Made
- **[Decision]**: [Details]

## Jira Activity
### Created
- [PROJ-XXX](URL) - [Title]
```

---

### Rolling Context Changes

**[Team Name]** (`context/rolling/[team]-context.md`):
```diff
## Active Work
+ ### [New Feature/Initiative]
+   - Status: [status]
+   - Context: [why we're doing this]
+   - Tickets: [PROJ-XXX]

## Recent Decisions (Last 2 Weeks)
+ - **[YYYY-MM-DD]**: [Decision text]
```

---

### Suggested PRD/Confluence Updates

**High Priority:**
- **[Doc Title]** - [Specific section to update] - [Why it needs updating]

**Medium Priority:**
- **[Doc Title]** - [Suggested change]

---

## ✅ Approval Required

Does this look correct? Please review and let me know if you'd like any adjustments.

Say "yes" or "looks good" to proceed with writing these updates.
Say "no" or "wait" if you want to make changes.
```

---

## Quality Standards

### Daily Log Standards

- **Actions**: Past tense, specific, with links
  - Good: "Created PROJ-XXX for [Feature Redesign] notification card"
  - Bad: "Worked on Feed stuff"

- **Decisions**: Bold title, clear rationale, owner
  - Good: "**Feed CTA**: Prioritize urgent tasks based on 2x experiment lift - Owner: Alice"
  - Bad: "Decided to do urgent tasks"

- **Jira links**: Always use full URLs with markdown
  - Format: `[PROJ-XXX](https://[your-domain].atlassian.net/browse/PROJ-XXX)`

- **Follow-ups**: Use checkboxes for easy tracking
  - Format: `- [ ] [Task] - Owner: [person] - Deadline: [when]`

### Rolling Context Standards

- **Dates**: YYYY-MM-DD format consistently
- **Trends**: Use emoji indicators (⬆️ up, ⬇️ down, ➡️ flat)
- **Tickets**: Link inline: `[PROJ-XXX]` when referencing
- **Status**: Clear indicators (In Progress, Blocked, Completed, etc.)
- **Pruning**: Auto-archive old content, don't delete (keep history)

### Session Summary Standards

- **Concise**: Summarize, don't repeat verbatim
- **Actionable**: Clear next steps
- **Honest**: Flag what's still pending
- **Appreciative**: End on positive note
