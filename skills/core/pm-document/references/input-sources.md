---
name: input-sources
description: Resource file for pm-document agent
type: resource
---

# PM Document - Input Sources

This resource contains detailed methodology for gathering documentation inputs from conversation, Jira, Confluence, and existing context files.

---

## Purpose

Define how to extract documentation content from various sources to ensure nothing falls through the cracks.

**Use this when**: You need to gather information to document but aren't sure where to look or what to extract.

---

## Source 1: Current Conversation Context

**What it contains**: Everything discussed in the current Claude session.

### Extraction Methodology

**1. Scan for explicit decisions**

Look for phrases like:
- "We decided to..."
- "The plan is to..."
- "We're going with..."
- "After discussion, we'll..."
- "We're prioritizing X over Y"

**Extract**:
- What was decided
- Why (rationale with data if available)
- Who owns the decision
- When it takes effect

**Example**:
```
User: "After looking at the experiment data, we decided to go with the urgent tasks CTA. It's showing 2x better conversion than scan again. Lucas will own the implementation."

Extract:
- Decision: Use urgent tasks CTA (not scan again)
- Rationale: 2x better conversion in experiment
- Owner: Lucas
- Timeline: Implied immediate (implementation phase)
```

**2. Scan for actions taken**

Look for past-tense statements:
- "I created..."
- "I updated..."
- "I reviewed..."
- "I scheduled..."
- "I reached out to..."

**Extract**:
- What was done
- Related tickets/docs (with links)
- Brief context

**Example**:
```
User: "I created ALL-1234 for the Feed urgent tasks feature and updated the PRD section 4.3"

Extract:
- Action 1: Created ALL-1234 (Feed urgent tasks)
- Action 2: Updated PRD section 4.3
- Links: ALL-1234, Feed PRD
```

**3. Scan for open questions**

Look for:
- Direct questions ("Should we...?", "What if...?")
- Uncertainty ("Not sure...", "Need to figure out...")
- Requests for input ("Thoughts?", "What do you think?")

**Extract**:
- The question itself
- Who raised it
- Context (why it matters)
- Who should answer

**Example**:
```
User: "I'm not sure if we should support offline mode for the Wallet tab. It adds a lot of complexity but Vincent mentioned some users might need it."

Extract:
- Question: Should Wallet tab support offline mode?
- Raised by: User (PM)
- Context: Adds complexity but some users may need it
- Likely owner: PM + Engineering (Vincent)
```

**4. Scan for commitments and follow-ups**

Look for:
- "I'll..." statements
- "By [date]..."
- "TODO..."
- "Need to..."
- "Follow up with..."

**Extract**:
- What needs to be done
- Who owns it
- Deadline (explicit or inferred)

**Example**:
```
User: "I'll schedule a technical assessment with Nate by Friday to evaluate the Wallet offline mode complexity"

Extract:
- Follow-up: Schedule technical assessment for Wallet offline mode
- Owner: User (PM)
- Deadline: Friday
- Participants: Nate
```

**5. Scan for learnings and insights**

Look for:
- Experiment results ("The A/B test showed...")
- User research findings ("Users told us...")
- Incident learnings ("We learned that...")
- Metric changes ("Usage went up/down...")

**Extract**:
- The learning (what we discovered)
- Source (experiment, research, incident, data)
- Implication (what we should do differently)

**Example**:
```
User: "The Health Meter experiment showed that the urgent tasks CTA gets 2x more engagement than scan again. This tells us users want task-focused actions, not generic prompts."

Extract:
- Learning: Urgent tasks CTA outperforms scan again by 2x
- Source: Health Meter A/B experiment
- Implication: Users prefer task-focused actions over generic prompts
```

---

## Source 2: Recent Jira Activity

**What it contains**: Tickets created, updated, commented on, or blocked in a given timeframe.

### Query Patterns

**For daily documentation** (last 24 hours):
```bash
node .ai/scripts/atlassian-api.js jira search "project = ALL AND updated >= -1d AND (reporter = currentUser() OR assignee = currentUser() OR comment ~ currentUser())"
```

**For weekly review** (last 7 days):
```bash
node .ai/scripts/atlassian-api.js jira search "project = ALL AND updated >= -7d AND (reporter = currentUser() OR assignee = currentUser() OR comment ~ currentUser())"
```

**For specific team** (filter by team members):
```bash
node .ai/scripts/atlassian-api.js jira search "project = ALL AND updated >= -1d AND assignee IN ([team member emails])"
```

### Extraction Methodology

**1. Tickets created**

Extract:
- Ticket key (e.g., ALL-1234)
- Title/summary
- Type (Bug, Task, Story, Epic)
- Who created it (usually currentUser)
- When it was created

**Document as**:
```markdown
### Jira Activity

#### Created
- [ALL-1234](https://yourcompany.atlassian.net/browse/ALL-1234) - Feed Urgent Tasks Integration
```

**2. Tickets updated**

Extract:
- What changed (status, assignee, description, comments)
- Why it changed (if evident from comments)

**Document as**:
```markdown
#### Updated
- [ALL-1234](https://yourcompany.atlassian.net/browse/ALL-1234) - Updated acceptance criteria to include analytics tracking
- [ALL-5678](https://yourcompany.atlassian.net/browse/ALL-5678) - Status changed: To Do → In Progress
```

**3. Tickets blocked**

Extract:
- What's blocked
- Why (blocker description if in comments)
- Who's responsible for unblocking

**Document as**:
```markdown
#### Blocked
- [ALL-9999](https://yourcompany.atlassian.net/browse/ALL-9999) - Blocked pending design review from Sarah
```

**4. Comments added**

Extract:
- Which tickets you commented on
- Nature of comment (status update, question, decision)

**Document as**:
```markdown
#### Commented
- [ALL-1111](https://yourcompany.atlassian.net/browse/ALL-1111) - Asked Vincent about API timeline
```

### Team Attribution

Use `.ai/config/team-members.json` to:
- Map assignees to teams
- Filter tickets by your managed teams
- Categorize work by team

**Example**:
```javascript
const teamMembers = require('.ai/config/team-members.json');
const appExperienceTeam = teamMembers.managed_by_lucas.app_experience;

// Filter tickets assigned to App Experience team
const appExTickets = allTickets.filter(ticket =>
  appExperienceTeam.some(member =>
    ticket.fields.assignee?.emailAddress === member.email
  )
);
```

---

## Source 3: Recent Confluence Changes

**What it contains**: Pages created, updated, or commented on in a given timeframe.

### Query Patterns

**For daily documentation** (last 24 hours):
```bash
node .ai/scripts/atlassian-api.js confluence search "type = page AND (creator = currentUser() OR contributor = currentUser()) AND lastModified >= -1d"
```

**For weekly review** (last 7 days):
```bash
node .ai/scripts/atlassian-api.js confluence search "type = page AND (creator = currentUser() OR contributor = currentUser()) AND lastModified >= -7d"
```

**For specific spaces** (filter by team spaces):
```bash
node .ai/scripts/atlassian-api.js confluence search "type = page AND space IN (PROD, ENG) AND lastModified >= -1d"
```

### Extraction Methodology

**1. Pages created**

Extract:
- Page title
- Page URL
- Space (which Confluence space)
- Purpose (from page content or title)

**Document as**:
```markdown
## Confluence Activity

- Created: [Feature X Product Spec](https://yourcompany.atlassian.net/wiki/spaces/PROD/pages/123456) - Product spec for Feature X initiative
```

**2. Pages updated**

Extract:
- What changed (which sections)
- Why (if evident from page history or comments)

**Document as**:
```markdown
- Updated: [Feed Redesign PRD](URL) - Updated section 4.3 with experiment results and new CTA choice
```

**3. Comments added**

Extract:
- Which pages you commented on
- Nature of comment (question, feedback, approval)

**Document as**:
```markdown
- Commented on: [Wallet Tab Spec](URL) - Asked about offline mode requirements
```

### PRD/Spec Identification

**Identify which docs are PRDs vs other pages**:
- Look for "PRD", "Spec", "Product Spec" in title
- Check if page is in PROD space
- Look for standard PRD sections (Overview, User Stories, Acceptance Criteria)

**Prioritize PRDs** in documentation (more important than general pages).

---

## Source 4: Existing Context Files

**What it contains**: Previously documented work, decisions, and context for your teams.

### Files to Check

**Daily logs** (recent):
- `.ai/context/daily-logs/[recent dates]-[pm_owner].md`
- Check last 7 days to avoid duplicate documentation

**Rolling context** (per team):
- `.ai/context/rolling/[team]-context.md`
- Check current state to understand what needs updating

### Extraction Methodology

**1. From recent daily logs**

**Purpose**: Avoid documenting the same item twice.

**Extract**:
- Actions already logged
- Decisions already captured
- Tickets already mentioned
- Questions already raised

**Use this to filter**:
```
If conversation mentions "Created ALL-1234"
AND daily log from today already has "ALL-1234"
THEN skip adding it again
```

**2. From rolling context**

**Purpose**: Understand current state to determine what to update.

**Extract**:
- Current "In Progress" work
- Current "Recent Decisions"
- Current "Open Questions"
- Current metrics and their last values

**Use this to prepare updates**:
```
Rolling context shows:
- "Feed Redesign" is "In Progress"
- Last metric: "Health Meter Engagement: 15%"

Conversation shows:
- "Feed Redesign shipped today"
- New metric: "Health Meter Engagement: 18%"

Update:
- Move "Feed Redesign" from "In Progress" to "Recently Completed"
- Update metric: 15% → 18% (⬆️ trend)
```

---

## Cross-Referencing Sources

**Combine information from multiple sources** for complete picture:

### Example: Document a Decision

**From conversation**:
- Decision: "Prioritize urgent tasks CTA"
- Rationale: "2x conversion lift"
- Owner: "Lucas"

**From Jira**:
- Created ALL-1234 for implementation
- Updated ALL-5678 (Feed PRD epic) with new scope

**From Confluence**:
- Updated Feed PRD section 4.3 with decision

**From rolling context**:
- Current decisions don't yet include this

**Complete documentation**:
```markdown
## Decisions Made
- **Feed Urgent Tasks CTA**: Prioritize urgent tasks over scan again - A/B test shows 2x conversion lift - Owner: Lucas
  - Implementation: ALL-1234
  - PRD updated: Feed PRD section 4.3
  - Added to rolling context: App Experience team
```

### Example: Document Completed Work

**From conversation**:
- "Shipped Wallet tab today"

**From Jira**:
- ALL-9999 (Wallet Tab) status: In Progress → Done
- Closed on 2026-01-01

**From Confluence**:
- Wallet Tab Spec shows "Status: Launched"

**From rolling context**:
- "Wallet Tab" currently listed as "In Progress"

**Complete documentation**:
```markdown
## What I Did Today
- Shipped Wallet Tab Basic Mode ([ALL-9999](URL))

## Jira Activity
### Completed
- [ALL-9999](URL) - Wallet Tab Basic Mode - Status: Done

Rolling Context Update:
- Move Wallet Tab from "In Progress" to "Recently Completed"
- Date: 2026-01-01
```

---

## Extraction Checklist

Before finalizing documentation, ensure you've checked:

**From conversation**:
- [ ] All decisions identified
- [ ] All actions taken captured
- [ ] All questions raised documented
- [ ] All commitments/follow-ups noted
- [ ] All learnings extracted

**From Jira**:
- [ ] Created tickets documented
- [ ] Updated tickets noted
- [ ] Blocked tickets flagged
- [ ] Comments reviewed

**From Confluence**:
- [ ] Created pages documented
- [ ] Updated pages noted
- [ ] Comments reviewed

**From existing context**:
- [ ] Duplicate items filtered out
- [ ] Current state understood
- [ ] Updates prepared (not replacements)

**If any checklist item is unclear, ask user for clarification.**

---

## Priority of Sources

**When sources conflict**, use this priority:

1. **User's explicit statement** (highest trust)
   - "I created ALL-1234" → Document it even if Jira doesn't show it yet

2. **Jira/Confluence data** (source of truth for tickets/docs)
   - If Jira shows ticket exists, it exists
   - If Confluence shows page updated, it's updated

3. **Existing context files** (may be outdated)
   - Check timestamp to see when last updated
   - If older than conversation/Jira data, trust newer sources

**If truly conflicting** (e.g., user says created ticket but Jira doesn't show it):
- Flag the discrepancy to user
- "I don't see ALL-1234 in Jira yet. Should I document it anyway?"
