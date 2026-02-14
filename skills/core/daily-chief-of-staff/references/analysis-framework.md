---
name: analysis-framework
description: Resource file for daily-chief-of-staff agent
type: resource
---

# Daily Chief of Staff - Analysis Framework

This resource contains methodology for ad-hoc analysis of specific data sources (transcripts, Jira updates, Confluence docs).

---

## Purpose

Provide targeted analysis when the user wants to:
- Analyze a specific transcript for decisions and action items
- Review Jira updates for a specific team or timeframe
- Analyze Confluence doc changes
- Extract insights from a particular meeting or data source

**Use this when**: User requests analysis of specific content, not a full daily sync.

---

## Analysis Methodology

### Analyzing Meeting Transcripts

**When to use**: User provides a specific transcript or asks to analyze a particular meeting.

**Process**:

1. **Load the transcript**
   - Check `.ai/local/private_transcripts/` first
   - Then check `.ai/knowledge/meeting_transcripts/`
   - If user provides content, use that directly

2. **Identify meeting metadata**
   - Meeting title
   - Date
   - Participants (match against `team-members.json`)
   - Which teams are represented

3. **Extract PM-specific content** (prioritize statements by the PM):
   - **`Me:` statements** - The PM's own words (highest priority)
   - **Decisions made** - What was decided, by whom, with what rationale
   - **Action items** - Who owns what, by when
   - **Blockers mentioned** - What's blocked, who owns unblocking
   - **Questions raised** - What needs answering, by whom
   - **Strategic context** - Metrics, learnings, team dynamics

4. **Categorize by relevance**:
   - **High relevance**: Directly impacts PM's teams or requires their action
   - **Medium relevance**: Related to their scope but not immediate
   - **Low relevance**: FYI only, no action needed

5. **Present structured output**:
   ```markdown
   ## Meeting Analysis: [Meeting Title]
   **Date**: [date]
   **Participants**: [list]
   **Your Teams Represented**: [teams from teams_managed]

   ---

   ### 🔑 Key Decisions
   1. **[Decision]** - [Who decided] - [Rationale]
      - Impact: [What changes]
      - Action needed: [What you need to do, if anything]

   ### ✅ Action Items
   1. **[Action]** - Owner: [person] - Deadline: [when]
      - Context: [Why this matters]
      - Your involvement: [What you need to do]

   ### 🚧 Blockers
   1. **[Blocker]** - Owner: [person]
      - Impact: [What's blocked]
      - Your role: [Escalate? Provide input? Monitor?]

   ### ❓ Open Questions
   1. **[Question]** - Raised by: [person]
      - Who should answer: [you/other]
      - Urgency: [high/medium/low]

   ### 📊 Strategic Context
   - [Metric or insight]
   - [Team dynamic or learning]

   ---

   ### 📝 Suggested Follow-ups
   - [ ] [Create ticket for X]
   - [ ] [Update PRD section Y]
   - [ ] [Schedule follow-up with Z]
   ```

6. **Offer next steps**:
   - "Should I create tickets for any of these action items?"
   - "Which of these decisions should I document in rolling context?"
   - "Do any of these require PRD updates?"

### Analyzing Jira Updates

**When to use**: User asks "what's new in Jira?" or "show me Jira updates for [team/timeframe]"

**Process**:

1. **Define the scope**
   - Timeframe (default: last 24 hours)
   - Teams (default: user's `teams_managed`)
   - Specific filters (status, assignee, labels)

2. **Query Jira via CLI**:
   ```bash
   node .ai/scripts/atlassian-api.js jira search "project = ALL AND updated >= -1d AND assignee in ([team members])"
   ```

3. **Extract relevant updates**:
   - **New tickets created** - Who created, what's the ask
   - **Status changes** - Especially transitions to/from Blocked
   - **New comments** - Especially from stakeholders or cross-team
   - **Assignee changes** - New ownership
   - **Priority changes** - What got escalated or deprioritized

4. **Categorize by urgency**:
   - **Needs immediate attention** - Blocked tickets, high-priority new tickets assigned to you
   - **Needs follow-up** - New tickets for your teams, comment threads
   - **FYI** - Routine status updates, work progressing normally

5. **Present structured output**:
   ```markdown
   ## Jira Updates: [Timeframe] for [Teams]

   **Total tickets reviewed**: [count]
   **Tickets needing your attention**: [count]

   ---

   ### 🔴 Immediate Attention Required
   - **[ALL-123]**: [Title]
     - Status: [Blocked / High Priority / etc.]
     - Issue: [What's wrong]
     - Your action: [What you need to do]

   ### ⚠️ Follow-up Needed
   - **[ALL-456]**: [Title]
     - Update: [What changed]
     - Your action: [Review / Comment / Assign / etc.]

   ### ✅ Progressing Well (FYI)
   - **[ALL-789]**: [Title] - [Status change]
   - **[ALL-101]**: [Title] - [Comment added]

   ---

   ### 📋 Summary
   - X tickets blocked
   - Y new high-priority tickets
   - Z tickets with new comments

   What would you like to address first?
   ```

6. **Offer next steps**:
   - "Should I help you unblock [ticket]?"
   - "Want me to add a comment to [ticket]?"
   - "Should I create a follow-up task for [issue]?"

### Analyzing Confluence Docs

**When to use**: User asks about recent doc changes, PRD updates, or wants to review Confluence activity.

**Process**:

1. **Define the scope**
   - Timeframe (default: last 7 days)
   - Spaces (default: spaces related to user's teams)
   - Specific pages (if user mentions a PRD or doc)

2. **Query Confluence via CLI**:
   ```bash
   node .ai/scripts/atlassian-api.js confluence search "type = page AND space in (PROD, ENG) AND lastModified >= -7d"
   ```

3. **Extract relevant changes**:
   - **Pages created** - New PRDs, specs, docs
   - **Pages updated** - What sections changed
   - **Comments added** - Questions or feedback
   - **Pages related to active work** - Cross-reference with Jira tickets and rolling context

4. **Categorize by impact**:
   - **High impact** - PRD changes affecting in-flight work
   - **Medium impact** - New specs or docs related to your teams
   - **Low impact** - Minor edits, typo fixes

5. **Present structured output**:
   ```markdown
   ## Confluence Updates: [Timeframe] for [Spaces]

   **Total pages reviewed**: [count]
   **Pages needing review**: [count]

   ---

   ### 📄 High Impact Changes
   - **[Page Title]** ([URL])
     - Last updated: [date] by [person]
     - What changed: [Section/content summary]
     - Why it matters: [Impact on your work]
     - Your action: [Review? Update tickets? Socialize with team?]

   ### 📝 New Pages
   - **[Page Title]** ([URL])
     - Created: [date] by [person]
     - Purpose: [What it documents]
     - Relevance: [How it relates to your work]

   ### ✏️ Minor Updates (FYI)
   - [Page Title] - [Brief change description]

   ---

   ### 🔗 Cross-References
   Related Jira tickets:
   - [ALL-123] references [Page 1]
   - [ALL-456] needs [Page 2] updated

   What would you like to review or update?
   ```

6. **Offer next steps**:
   - "Should I update [PRD] based on recent decisions?"
   - "Want me to add a comment to [page] flagging [issue]?"
   - "Should I create a new Confluence page for [topic]?"

---

## Extraction Patterns

### Decisions (from any source)

**Look for**:
- "We decided to..."
- "The plan is..."
- "We're going with..."
- "After discussion, we'll..."
- Changes in direction or scope

**Capture**:
- What was decided
- Who made the decision (or who has authority)
- Rationale (data, constraints, tradeoffs)
- Impact (what changes, who's affected)
- Follow-up actions (what needs to happen next)

### Blockers (from any source)

**Look for**:
- "Blocked by..."
- "Waiting on..."
- "Can't proceed until..."
- Status = Blocked in Jira
- Mentions of dependencies or delays

**Capture**:
- What's blocked
- Who owns the blocker
- Impact (what work can't proceed)
- Escalation path (who can unblock)
- Timeline (how urgent is resolution)

### Action Items (from any source)

**Look for**:
- "[Name] will..."
- "I'll..."
- "Need to..."
- "TODO:"
- "Follow up with..."

**Capture**:
- What needs to be done
- Who owns it
- Deadline (explicit or inferred)
- Dependencies (what needs to happen first)
- Success criteria (how to know it's done)

### Open Questions (from any source)

**Look for**:
- Direct questions ("Should we...?", "What if...?", "How do we...?")
- Uncertainty markers ("Not sure...", "Need to figure out...", "TBD")
- Requests for input ("Thoughts?", "Feedback?")

**Capture**:
- The question itself
- Who raised it
- Context (why it matters)
- Who should answer (you, engineering, design, etc.)
- Urgency (blocks work? nice to know?)

---

## Team Categorization

Use `.ai/config/team-members.json` to categorize content by team:

1. **Map participants to teams**
   - Match names in transcripts to team members
   - Identify which teams are represented

2. **Map tickets to teams**
   - Use assignee, reporter, or labels to determine team
   - Cross-reference with `teams_managed`

3. **Tag content by relevance**
   - **Your teams** - Direct responsibility
   - **Cross-team dependencies** - Affects your work
   - **Other teams** - FYI only

**Present team-specific views when helpful**:
```markdown
## App Experience Team
- [Items specific to this team]

## Cloaked Labs Team
- [Items specific to this team]

## Cross-Team Items
- [Items affecting multiple teams]
```

---

## Quality Checks

Before presenting analysis:

- [ ] All extracted items are factual (not inferred or assumed)
- [ ] Priorities are correctly assigned (Urgent/High/Medium/Low)
- [ ] Team attribution is accurate
- [ ] Actions have clear owners and deadlines (if mentioned)
- [ ] Questions have suggested owners
- [ ] Cross-references are valid (Jira tickets exist, Confluence pages are real)
- [ ] No duplicate items across categories

**If uncertain about any item, flag it**: "Not sure if this requires your action - please confirm."
