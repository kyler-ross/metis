---
name: daily-log-workflow
description: Resource file for pm-document agent
type: resource
---

# PM Document - Daily Log Workflow

This resource contains the workflow for creating and updating daily logs.

---

## Purpose

Document what you accomplished today in a structured daily log file. This captures:
- Actions taken (tickets created, PRDs updated, meetings)
- Decisions made (with rationale and owners)
- Jira and Confluence activity
- Follow-ups created
- Open questions that need answering
- Notes and learnings

**Use this when**: End of day, or when you want to checkpoint your progress mid-day.

---

## File Location

**Daily log path**: `.ai/context/daily-logs/YYYY-MM-DD-[pm_owner].md`

**Example**: `.ai/context/daily-logs/2026-01-01-kyler.md`

**Behavior**:
- If file exists for today → **Append** new content to existing sections
- If file doesn't exist → **Create** new file with template structure

---

## Workflow: Update Daily Log

### Step 1: Gather Context

**From current conversation**:
- What actions did you take? (created tickets, updated docs, had meetings)
- What decisions were made? (what was decided, why, who owns it)
- What questions were raised? (unanswered items)
- What commitments did you make? (follow-ups, deadlines)
- What did you learn? (experiment results, user feedback, insights)

**From Jira (last 24 hours)**:
```bash
node .ai/scripts/atlassian-api.js jira search "project = ALL AND (reporter = currentUser() OR assignee = currentUser() OR comment ~ currentUser()) AND updated >= -1d"
```

Extract:
- Tickets created today (with links)
- Tickets updated today (what changed)
- Tickets blocked (blocker description)
- Comments you added

**From Confluence (last 24 hours)**:
```bash
node .ai/scripts/atlassian-api.js confluence search "type = page AND (creator = currentUser() OR contributor = currentUser()) AND lastModified >= -1d"
```

Extract:
- Pages created (with URLs)
- Pages updated (what changed)
- Comments added

### Step 2: Check Existing Daily Log

**Load today's log** (if it exists):
- Read: `.ai/context/daily-logs/[YYYY-MM-DD]-[pm_owner].md`
- Extract what's already documented:
  - Existing actions
  - Existing decisions
  - Existing Jira activity
  - Existing follow-ups

**Purpose**: Avoid duplicating content that's already logged from an earlier session today.

### Step 3: Prepare Daily Log Content

**DO NOT WRITE YET. Prepare the content internally first.**

**If file doesn't exist**, prepare full structure:

```markdown
# Daily Log - [Day of Week], [Month] [Day], [Year]

## What I Did Today
- [Action 1] - [Brief context, link to ticket/doc if relevant]
- [Action 2] - [Brief context]

## Decisions Made
- **[Decision Title]**: [What was decided] - [Rationale/data] - Owner: [person]

## Jira Activity

### Created
- [ALL-123](https://yourcompany.atlassian.net/browse/ALL-123) - [Ticket Title]

### Updated
- [ALL-456](https://yourcompany.atlassian.net/browse/ALL-456) - [What changed]

### Blocked
- [ALL-789](https://yourcompany.atlassian.net/browse/ALL-789) - [Blocker description]

## Confluence Activity
- Updated: [Page Title](URL) - [What changed]
- Created: [Page Title](URL) - [Purpose]

## Follow-ups Created
- [ ] [Follow-up task] - Owner: [person] - Deadline: [when]

## Open Questions
- [Question] - Raised by: [person], Context: [why it matters], Likely owner: [who should answer]

## Notes & Learnings
- [Strategic context, team dynamics, important realizations, metrics insights]

---

_Generated at: [timestamp]_
_Based on: [X decisions, Y Jira tickets, Z Confluence pages, conversation]_
```

**If file exists**, prepare content to append:

```markdown
[existing content above]

## What I Did Today
[existing items]
- [NEW Action 1] - [context]
- [NEW Action 2] - [context]

## Decisions Made
[existing decisions]
- **[NEW Decision]**: [details]

[... same pattern for other sections ...]

---

_Last updated: [timestamp]_
_Session 2: [X new decisions, Y new Jira tickets, Z new items]_
```

### Step 4: Extract and Format Content

**Actions** (What I Did Today):
- Past tense, specific, actionable
- Include links to tickets/docs
- Brief context (why it matters)

**Good examples**:
- "Created ALL-1234 for Feed Redesign notification card"
- "Updated Health Meter CTA experiment rollout to 50%"
- "Reviewed Wallet tab mockups with Sarah, approved for implementation"

**Bad examples**:
- "Worked on Feed stuff" (too vague)
- "Had meetings" (not specific)
- "Thought about priorities" (not an action)

**Decisions** (Decisions Made):
- Bold title summarizing the decision
- What was decided (the choice made)
- Rationale or data (why this choice)
- Owner (who will action it)

**Good examples**:
- "**Feed Urgent Tasks CTA**: Prioritize urgent tasks over scan again - 2x conversion lift in experiment - Owner: Lucas"
- "**Wallet Offline Mode**: Delay to Q2 - Technical complexity too high for Q1 timeline - Owner: Vincent"

**Bad examples**:
- "Decided to do urgent tasks" (missing rationale)
- "Changed the Feed" (too vague, no owner)

**Jira Activity**:
- Always use full markdown links: `[ALL-123](https://yourcompany.atlassian.net/browse/ALL-123)`
- Group by: Created, Updated, Blocked
- For Updated: briefly explain what changed
- For Blocked: explain the blocker

**Confluence Activity**:
- Use full markdown links: `[Page Title](full URL)`
- Explain what changed or why page was created

**Follow-ups**:
- Use checkboxes: `- [ ] [Task]`
- Include owner and deadline (if known)
- Be specific about the action

**Good examples**:
- "[ ] Schedule technical assessment for Wallet tab with Nate - Owner: Lucas - By Friday"
- "[ ] Update Feed PRD section 4.2 with experiment results - Owner: Lucas - By EOW"

**Open Questions**:
- The question itself (clear and complete)
- Who raised it
- Context (why it matters, what's affected)
- Likely owner (who should answer)

**Notes & Learnings**:
- Strategic insights (metrics, trends, patterns)
- Team dynamics (what worked, what didn't)
- Important realizations (aha moments)
- Experiment results or user feedback

**Good examples**:
- "Health meter 'urgent tasks' CTA outperforms 'scan again' by 2x in early experiment data"
- "Team velocity dropped this sprint due to platform stability issues"

### Step 5: Preview for Approval

**🚨 CRITICAL: Show complete preview before writing.**

Present to user:

```markdown
## 📋 Daily Log Preview

**File**: `.ai/context/daily-logs/2026-01-01-kyler.md`

**Action**: [Creating new file / Appending to existing file]

---

[SHOW COMPLETE CONTENT THAT WILL BE WRITTEN]

If appending, show:
- What's already in the file (brief summary)
- What will be added (full content)

---

Does this look correct? Should I write this to the daily log?

Say "yes" or "looks good" to proceed.
Say "no" or "wait" if you want changes.
```

**Wait for explicit approval before Step 6.**

### Step 6: Write Daily Log (Only After Approval)

**Only execute after user says "yes" / "looks good" / "go ahead".**

1. **Write or append to file**:
   - If new file: Write complete structure
   - If existing: Append new content to sections

2. **Preserve user edits**:
   - Don't overwrite manual notes user added
   - Keep existing formatting

3. **Update timestamp**:
   - Add/update "Generated at" or "Last updated" timestamp

4. **Confirm to user**:
   ```
   ✅ Daily log updated!

   File: .ai/context/daily-logs/2026-01-01-kyler.md

   Added:
   - 3 actions
   - 2 decisions
   - 4 Jira tickets
   - 1 Confluence page
   - 2 follow-ups

   Your work is now documented. See you tomorrow!
   ```

---

## Content Quality Standards

### Actions Format

- **Past tense**: "Created", "Updated", "Reviewed" (not "Create", "Update")
- **Specific**: Include ticket/doc names, not generic terms
- **Linked**: Always link Jira tickets and Confluence pages
- **Brief**: 1 line per action, not paragraphs

### Decisions Format

- **Bold title**: Summarizes the decision in 3-5 words
- **What**: Clear statement of what was decided
- **Why**: Rationale or data supporting it
- **Who**: Owner who will action it

### Jira/Confluence Format

- **Full URLs**: Never use relative links
- **Markdown links**: `[KEY](URL)` format
- **Grouped logically**: Created, Updated, Blocked

### Follow-ups Format

- **Checkboxes**: `- [ ]` for tracking
- **Actionable**: Clear what needs to be done
- **Owner**: Who owns it
- **Timeline**: Deadline or target date

### Notes Format

- **Strategic focus**: Insights that matter for future decisions
- **Concise**: Bullet points, not essays
- **Forward-looking**: What did we learn? What should we do differently?

---

## Multi-Session Support

**If user runs multiple Chief of Staff sessions in one day**:

1. **First session**: Creates daily log with initial content
2. **Second session**: Appends new content to same file
3. **Third session**: Continues appending

**Avoid duplication**:
- Check if ticket was already logged
- Check if decision was already captured
- Merge similar items (don't list the same ticket twice)

**Timestamp tracking**:
- Initial file: "Generated at: [timestamp]"
- Subsequent appends: "Last updated: [timestamp]"
- Optional: "Session 2: [what was added]"

---

## Error Handling

**If user profile doesn't exist**:
- "I don't have your user profile. Please run `/pm-daily` first to initialize."

**If can't access Jira/Confluence**:
- "I couldn't access Jira/Confluence. I'll document based on conversation context only."
- Continue with conversation-based content

**If file write fails**:
- "I couldn't write to the daily log file. Please check file permissions."
- Show content to user so they can manually save it

---

## Tips

- **Run at end of day**: Captures full day's work
- **Run mid-day if needed**: Checkpoint progress before context window fills
- **Review before approving**: Catch any inaccuracies before writing
- **Edit manually**: You can always edit the file directly after it's created
