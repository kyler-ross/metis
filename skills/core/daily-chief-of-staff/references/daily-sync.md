---
name: daily-sync
description: Resource file for daily-chief-of-staff agent
type: resource
---

# Daily Chief of Staff - Daily Sync Workflow

This resource contains the default morning sync workflow for reviewing priorities, blockers, and action items.

---

## Purpose

Help PMs start each day with clarity by:
- Ingesting last 24 hours of transcripts, Jira updates, and Confluence changes
- Extracting PM-specific priorities (decisions, blockers, questions, action items)
- Categorizing and prioritizing work
- Presenting a structured briefing
- Collaborating on execution
- Documenting outcomes

---

## Workflow: Run Daily Sync

### Phase 1: Ingest

1. **Check for recent daily logs (multi-session support):**
   - Look for daily logs from the **past 7 days**: `.ai/context/daily-logs/$(date-7d to today)-[pm_owner].md`
   - **If any exist:**
     - Read "What I Did Today" and "Jira Activity" sections from all found logs
     - Extract completed items and decisions already handled
     - Store in `completed_items` list for filtering in Phase 3
     - Show: "I found recent work logs. You've completed [X] items in the past week: [brief list]. I'll filter these out and focus on new/remaining work."
   - **If none exist:**
     - This is your first session this week
     - No filtering needed

   **Why 7 days:** Work from last week might still be in today's transcripts (meetings that happened days ago but you're processing now). This ensures you don't see duplicate priorities for work already completed.

2. Read `.ai/work/granola-input-TODAY.md`.
   - If empty or template only: ask you to paste today's Granola transcripts.

3. Query Jira via CLI: `node .ai/scripts/atlassian-api.cjs jira search "assignee = currentUser()"`

4. **Query Gmail for recent emails** via CLI: `node .ai/scripts/google-gmail-api.cjs week --limit 50`
   - Categorize by:
     - **Action Required**: Emails awaiting your response, approvals, document requests
     - **Calendar/Meeting**: Invites, rescheduling, acceptances/declines
     - **Jira Updates**: Ticket assignments, mentions, status changes
     - **FYI/Newsletters**: Low-priority informational emails
   - Extract action items from emails that need follow-up

5. Optionally query Confluence for PRDs/docs you own or in your spaces.

6. Load team context if present:
   - `.ai/context/rolling/app-experience-context.md`
   - `.ai/context/rolling/cloaked-labs-context.md`

### Phase 2: Analyze & Categorize

For each meeting in Granola transcripts:

1. **Identify PM-specific items** (PRIORITIZE `Me:` statements):
   - Highest priority: anything said by `Me:` – your own statements, commitments, decisions, or questions
   - Direct asks or references to you by name
   - Decisions that need documentation
   - Blockers requiring escalation
   - Questions posed to you
   - Commitments you made

2. **Prioritization by speaker**:
   - `Me:` statements → automatically High Priority
   - Others mentioning you → High/Medium based on urgency and impact
   - General decisions/blockers → Medium Priority

3. **Categorize by team**:
   - Map speakers and topics to teams using `team-members.json`
   - Tag items as one of your teams vs other teams

4. **Extract context**:
   - What's the decision and why?
   - What's the blocker and who owns it?
   - What's the question and its urgency?
   - What's the action and its timeline?
   - If from `Me:`, note that this is your own statement/commitment.

For Jira updates:

1. **Identify PM-relevant tickets**:
   - Assigned to you
   - Created by you today
   - Status changed to Blocked
   - Comments mentioning you or your teams

2. **Extract action needed**:
   - Do you need to update it?
   - Do you need to unblock it?
   - Do you need to review or comment?

For Confluence:

1. **Identify relevant docs**:
   - PRDs referenced in decisions or tickets
   - Docs you edited today
   - Docs in your spaces related to active work

2. **Infer documentation impact**:
   - Does this decision change a PRD's assumptions, scope, or acceptance criteria?
   - Does this work require a new section or page (e.g., new experiment, new flow)?

Record all of this into internal lists:
- `decisions`
- `unanswered_questions`
- `doc_update_candidates`

### Phase 3: Prioritize & Present

**Before generating output:**
- If `completed_items` list exists from Phase 1 (continuing from earlier session):
  - Filter out any priorities that match completed items
  - Remove tickets already created/updated
  - Remove decisions already documented
  - Remove questions already answered
  - Keep only net-new or still-pending items

Generate structured output with **ALL** priority levels:

```markdown
## 📊 Today's Activity Summary
- X meetings analyzed (list meeting names)
- Y Jira tickets reviewed
- E emails reviewed (A action required, B unread)
- Z decisions requiring follow-up
- Q unanswered questions identified
- N action items extracted

---

## 🔥 URGENT - Do Today (Immediate Action Required)

1. **[Action Title]** - [Team] ⭐ [If from `Me:` statement]
   - Context: [Why this matters and why it's urgent]
   - Next step: [What you need to do]
   - Source: [Meeting name or Jira ticket]
   - Deadline: [Specific time if mentioned]

---

## ⚠️ HIGH PRIORITY - Do Today

2. **[Action Title]** - [Team] ⭐ [If from `Me:` statement]
   - Context: [Why this matters]
   - Next step: [What you need to do]
   - Source: [Meeting name or Jira ticket]
   - Note: [If from `Me:`, mention "You said this in the meeting"]

---

## 📋 MEDIUM PRIORITY - This Week

5. **[Action Title]** - [Team]
   - Context: [Why this matters]
   - Next step: [What you need to do]
   - Source: [Meeting name or Jira ticket]
   - Timeline: [By when, if mentioned]

---

## 📌 LOW PRIORITY - Nice to Have

8. **[Action Title]** - [Team]
   - Context: [Why this matters]
   - Next step: [What you need to do]
   - Source: [Meeting name or Jira ticket]

---

## ❓ Open Questions (Unanswered)

Priority order (urgent questions first):
- **[HIGH]** [Question] – Raised by [person], likely owner: [you/other], urgency: [why this matters now]
- **[MEDIUM]** [Question] – Raised by [person], likely owner: [you/other], suggested follow-up: [ticket, Slack ping, meeting]
- **[LOW]** [Question] – Context: [why this might matter eventually]

---

## 📄 Potential Documentation Updates

### High Priority
- [Doc or PRD]: [Reason it needs updating] - [Impact if not updated]

### Medium Priority
- [Doc or PRD]: [Reason it might need updating]

### Nice to Have
- [Rolling context section]: [Why it should change]

---

## ℹ️ FYI - For Your Awareness (No Action Needed)

- [Completed work item] - [Brief context]
- [Team handling item independently] - [Status]
- [Background info] - [Why you should know]

---

## 🎯 Let's Get Started

**Total actionable items: [count Urgent + High + Medium + Low]**

Which would you like to tackle first?

Options:
- Start with urgent items (recommended if any exist)
- Pick a specific item by number
- Say "show me everything" to see expanded details on all items
- Say "let's do a sweep" to go through them all systematically

**Note:** I'll help you work through as many as you'd like. We can tackle them all or stop whenever you need to.
```

**Note:** Do NOT automatically start working on items. Wait for the user to tell you what to work on.

### Phase 4: Collaborate & Execute

**🚨 CRITICAL: Every single action requires explicit user approval before execution.**

Interactive loop:

1. **User selects a priority item** (wait for user to tell you which one)
2. **Analyze the item** and decide which approach/agent to use:
   - PRD update → `product-coach` or `/pm-ai`
   - Create Jira ticket → `jira-ticket-writer` or `/pm-ai`
   - Strategic question → `/pm-ai` (routes to pm-router for orchestration)
   - Complex multi-step work → `/pm-ai` to coordinate
3. **Propose the action and show preview:**
   ```
   For this item, I suggest creating a Jira ticket with these details:

   Title: [proposed title]
   Summary: [proposed summary]
   Acceptance Criteria:
   - [criterion 1]
   - [criterion 2]

   Should I proceed to create this ticket?
   ```
   Or:
   ```
   I can help update the Feed PRD sections 3.2 and 4.1. Here's what I'd change:
   [show proposed changes]

   Should I draft these changes?
   ```
4. **Wait for explicit approval:**
   - "yes" / "go ahead" / "do it" / "proceed" → Execute
   - "no" / "wait" / "hold on" → Stop, don't execute
   - Modifications requested → Adjust and show new preview
5. **Only after approval**, execute the action:
   - "Great! Loading jira-ticket-writer to create the ticket..."
   - Work with you and the helper agent to finish the task
   - Confirm when complete: "✅ Ticket ALL-123 created"
6. **Ask what's next:**
   - "Item complete! What would you like to work on next?"
   - Optionally remind: "We have [X] items remaining: [Y] high priority, [Z] medium priority"
7. Repeat until you say "done" or "that's all for today"

**Comprehensive Coverage Mode:**

If user says "let's do a sweep" or "let's do them all":
- Work through items systematically by priority
- After each item, immediately suggest: "Next up: [item title]. Ready?"
- Keep momentum but still require approval for each action
- Track progress: "Completed 3 of 8 items. 5 remaining."

While doing this, **log substantial changes** to an internal `changes`/`actions_taken` list:
- Tickets created/updated
- Decisions finalized
- PRDs/docs edited
- Major context changes agreed on

After each substantial change, the agent should **suggest next-step documentation/context updates**, for example:
- "We just created ALL-123 for Feed Redesign. Should we add this to the App Experience rolling context and update the Feed PRD?"

### Phase 4.5: Final Sweep - Catch Anything Missed

**Before moving to documentation, ensure comprehensive coverage.**

After working through priority items (or when user says "I think we're done"), ask:

```markdown
## 🔍 Final Check - Did We Miss Anything?

We've completed [X] items today:
- [List what was done]

Before we wrap up, let me do a final sweep to make sure nothing fell through the cracks:

**Meetings I analyzed:**
- [Meeting 1] - [Items extracted from this meeting]
- [Meeting 2] - [Items extracted from this meeting]

**Items we haven't addressed yet:**
- [Medium/Low priority items still on the list, if any]
- [Open questions we didn't resolve]

**Sanity checks:**
- Any commitments you made that we didn't capture? ✓
- Any blockers mentioned that we didn't address? ✓
- Any decisions that need documentation we missed? ✓
- Any questions asked to you that we didn't follow up on? ✓

Would you like to:
1. Address any of the remaining items?
2. Review any meeting again for missed details?
3. Move on to documentation (I'll capture everything we did today)?

Say "I think we got everything" to proceed to documentation, or let me know if you want to revisit anything.
```

**Purpose:** This safety net ensures nothing slips through, especially items that might have been deprioritized but are still important.

### Phase 5: Document & Update

This phase is triggered:
- Automatically at the end of a substantial working session
- On demand when you say "update context" or "checkpoint my progress"
- When you're about to hit context limits and need to start fresh

#### Automatic End-of-Session Behavior

After completing priority items in Phase 4, transition to documentation:

```markdown
## Time to Document

We've completed [X] priority items today:
- [List major actions taken]
- [List decisions made]
- [List tickets created/updated]

Let me update your context files to ensure nothing falls through the cracks.

Running `/pm-document` to:
- Create/update today's daily log
- Update rolling context for your teams
- Suggest PRD/Confluence updates
- Link related Jira tickets

One moment...
```

**Then, delegate to the pm-document agent:**

```
**LOAD SUBAGENT: pm-document**

Context to pass:
- Today's date: [date]
- User profile: [pm_owner, teams_managed]
- Decisions made: [list from internal tracking]
- Actions taken: [list from Phase 4]
- Unanswered questions: [list from Phase 2]
- Documentation candidates: [list of PRDs/docs that may need updates]
- Jira tickets touched: [list with links]
- Confluence pages referenced: [list with links]

Task: Document everything from today's session, update daily log and rolling context, suggest PRD updates.
```

The pm-document agent will:
1. Create/update daily log
2. Update rolling context files for each team
3. Suggest PRD/Confluence updates (with previews)
4. Propose Jira ticket links/updates
5. Provide summary of what was documented

**On-demand behavior (when you say "update context" or "document this")**:

Immediately delegate to pm-document:

```
User requested documentation update. Passing current conversation context to /pm-document...

**LOAD SUBAGENT: pm-document**
[Same context passing as above]
```

**After pm-document completes:**

```markdown
✅ Documentation complete!

Your daily log and rolling context are updated. See `/pm-document` output above for details.

Is there anything else you'd like to work on today?
```

**Note:** The Chief of Staff no longer directly updates context files. All documentation work is handled by the dedicated `/pm-document` agent, which ensures consistency and allows for standalone documentation updates outside of Chief of Staff sessions.

---

## Analysis Logic: What Needs Your Attention?

### 🔥 URGENT - Do Today
- **Time-critical**: Decisions/actions needed by EOD today or someone is blocked
- Commitments you explicitly made with today's deadline
- Escalations that can't wait
- Questions blocking team progress right now

### ⚠️ HIGH PRIORITY - Do Today
- Decisions requiring documentation (PRD updates, ticket creation)
- Blockers requiring escalation (cross-team, leadership)
- Questions needing answer soon (team waiting on you, but not immediately blocked)
- Commitments you made (promised by EOD/tomorrow)
- Time-sensitive follow-ups (engineering starting tomorrow)

### 📋 MEDIUM PRIORITY - This Week
- Non-urgent decisions to document
- Questions that can wait 2-3 days
- Follow-ups with flexible timelines
- Strategic planning tasks
- PRD updates that aren't blocking work

### 📌 LOW PRIORITY - Nice to Have
- Documentation cleanup
- Non-blocking questions to follow up on
- Strategic thinking items with no immediate deadline
- Process improvements
- Team culture/morale items that aren't urgent

### ℹ️ FYI - For Awareness
- Work progressing well without your input
- Team handling blockers independently
- Routine progress updates
- Completed work
- Background context that doesn't require action

### Decision & Question Tracking

While analyzing Granola, Jira, and Confluence, track:

- **Decisions**:
  - Decision text
  - Rationale/data
  - Owner(s)
  - Affected systems/PRDs/tickets
  - Whether it has been documented (Jira, PRD, context) or not

- **Unanswered Questions**:
  - Questions raised with no clear answer in the transcripts
  - Who raised them
  - Who likely should answer (you vs someone else)
  - Whether follow-up already exists (ticket, doc comment, Slack thread if available)

- **Documentation Candidates**:
  - For each decision or change, infer:
    - Which PRDs or Confluence pages are impacted
    - Which rolling context sections should be updated
    - Whether a new doc should be created

Store these in internal lists for later use in Phases 3–5.

---

## Prioritization Framework

When analyzing items, ask:

1. **Is this from `Me:`?** → **AUTOMATIC High Priority** (your own words/commitments)
2. **Urgency**: Does this need to happen today? Is someone blocked waiting?
3. **Only the PM**: Can only you do this, or is it delegated?
4. **Impact**: What breaks if you don't handle this?
5. **Commitment**: Did you promise to do this?

**Priority Rules:**
- **`Me:` statements** → Always Urgent or High Priority (your own commitments/decisions)
- If deadline is TODAY and someone blocked → **Urgent**
- If YES to urgency + only you + high impact → **High Priority**
- If YES to only you but not urgent → **Medium Priority**
- If nice to have but low impact → **Low Priority**
- If team handling independently → **FYI**

**Error-checking:**
- Did I miss any `Me:` statements? (Search for "Me:" in transcripts)
- Did I miss any direct questions asked to the user?
- Did I miss any commitments with deadlines?
- Did I miss any blockers that need escalation?
- Are there decisions mentioned that don't have follow-up actions?
