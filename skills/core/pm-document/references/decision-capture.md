---
name: decision-capture
description: Resource file for pm-document agent
type: resource
---

# PM Document - Decision Capture

This resource contains the workflow for documenting specific decisions with full context and rationale.

---

## Purpose

Capture and document important product decisions with sufficient context so that:
- Future you remembers why this decision was made
- Team members understand the rationale
- Decisions can be traced back if questioned later
- Strategic context is preserved for learning

**Use this when**: A significant decision is made that affects product direction, scope, priorities, or team work.

---

## What Qualifies as a "Decision"?

### Document These Decisions

**Product direction**:
- "We're prioritizing Feature X over Feature Y for Q1"
- "We're pivoting from approach A to approach B"
- "We're launching this experiment before building the full feature"

**Scope changes**:
- "We're cutting offline support from the MVP"
- "We're adding analytics tracking to this feature"
- "We're delaying Feature X to Q2"

**Priority changes**:
- "Moving this from Medium to High priority based on customer feedback"
- "Deprioritizing this epic due to technical complexity"

**Design/UX choices**:
- "We're using a bottom sheet instead of a modal"
- "We're requiring email verification for this flow"
- "We're removing the onboarding step based on user research"

**Technical constraints**:
- "We'll support iOS 15+ only (dropping iOS 14)"
- "We're using the existing API instead of building a new endpoint"
- "We must ship this in 2 weeks, so we're cutting nice-to-haves"

### Don't Document These

**Routine execution**:
- "I'll create a Jira ticket for this" (action, not decision)
- "We'll discuss this in tomorrow's meeting" (logistics)
- "Sarah will handle the design" (assignment)

**Obvious choices**:
- "We should test this before shipping" (standard practice)
- "We'll use our standard ticket format" (process)

**Premature decisions**:
- "We might consider X in the future" (not a decision yet)
- "We could possibly do Y" (speculation)

**When in doubt**: If it changes what the team builds or how they build it, document it.

---

## Decision Documentation Workflow

### Step 1: Extract Decision Details

**Identify these elements from conversation**:

1. **What was decided** (the choice made)
   - Example: "Prioritize urgent tasks CTA over scan again CTA in Feed"

2. **Context** (why this decision was needed)
   - Example: "Health Meter A/B test running, need to choose which CTA to build into Feed redesign"

3. **Rationale** (why this choice, not alternatives)
   - Example: "Urgent tasks CTA shows 2x conversion lift vs scan again (8% vs 4% task completion)"

4. **Alternatives considered** (what was NOT chosen)
   - Example: "Considered: scan again CTA, no CTA (just passive feed), both CTAs"

5. **Owner** (who will action this decision)
   - Example: "Lucas (PM) and Vincent (Engineering lead)"

6. **Impact** (what changes as a result)
   - Example: "Changes Feed redesign scope; scan again CTA delayed to V2"

7. **Timeline** (when this takes effect)
   - Example: "Effective immediately; will be in Sprint 48"

8. **Related tickets/docs** (where this is tracked)
   - Example: "ALL-1234 (Feed Urgent Tasks), Feed PRD section 4.3"

### Step 2: Choose Documentation Target

**Where should this decision be documented?**

**Option 1: Daily Log** (most decisions)
- Quick to update
- Captures daily work
- Easy to review later

**Option 2: Rolling Context** (strategic decisions)
- Longer-term reference
- Affects multiple sprints
- Team needs ongoing awareness

**Option 3: Confluence** (major decisions)
- Requires formal documentation
- Affects roadmap or strategy
- Cross-team impact
- Needs stakeholder visibility

**Recommendation**:
- Default: Daily log + rolling context
- If major: Also create/update Confluence page
- If urgent: All three (log, context, Confluence)

### Step 3: Format Decision for Daily Log

**Template**:
```markdown
- **[Decision Title]**: [What was decided] - [Rationale with data] - Owner: [person]
```

**Example**:
```markdown
- **Feed Urgent Tasks CTA**: Prioritize urgent tasks over scan again in Feed redesign - A/B test shows 2x conversion lift (8% vs 4%) - Owner: Lucas
```

**For more complex decisions, expand**:
```markdown
- **[Decision Title]**: [What was decided]
  - Context: [Why this decision was needed]
  - Rationale: [Data/reasoning]
  - Alternatives considered: [What we didn't choose and why]
  - Impact: [What changes]
  - Owner: [person]
  - Related: [tickets/docs]
```

### Step 4: Format Decision for Rolling Context

**Template**:
```markdown
- **[YYYY-MM-DD]**: [Decision] - [Rationale] - Impact: [What changes] - Owner: [person]
```

**Example**:
```markdown
- **2026-01-01**: Prioritize urgent tasks CTA over scan again - Experiment data shows 2x conversion lift - Impact: Changes Feed redesign scope - Owner: Lucas
```

**Add to "Recent Decisions" section**, keeping last 2 weeks visible.

### Step 5: Format Decision for Confluence (if needed)

**When to create Confluence decision doc**:
- Major strategic pivot
- Cross-team coordination required
- Leadership approval needed
- Long-term reference needed
- Part of formal product spec

**Template for Confluence page**:

```markdown
# Decision: [Title]

**Date**: [YYYY-MM-DD]
**Owner**: [Name]
**Status**: [Decided | Under Review | Implemented]

---

## Context

[Why was this decision needed? What problem are we solving?]

## Decision

[What did we decide to do?]

## Rationale

[Why did we make this choice? What data supports it?]

## Alternatives Considered

1. **[Alternative 1]**: [Why we didn't choose this]
2. **[Alternative 2]**: [Why we didn't choose this]

## Impact

**Product**:
- [What changes for users]
- [What changes in product scope]

**Engineering**:
- [What changes for engineering team]
- [Technical implications]

**Timeline**:
- [When this takes effect]
- [Dependencies or milestones]

## Related Work

**Jira Tickets**:
- [ALL-123](URL) - [Title]

**PRDs/Specs**:
- [PRD Title](URL) - [Relevant section]

**Experiments/Data**:
- [Experiment name/link] - [Key findings]

---

_Decision documented by [name] on [date]_
```

### Step 6: Preview and Confirm

**Show user where decision will be documented**:

```markdown
## 📝 Decision Documentation Preview

I'll document this decision in:

### Daily Log (`.ai/context/daily-logs/2026-01-01-kyler.md`)
```
## Decisions Made
- **Feed Urgent Tasks CTA**: Prioritize urgent tasks over scan again - A/B test shows 2x conversion lift - Owner: Lucas
```

### Rolling Context (`.ai/context/rolling/app-experience-context.md`)
```diff
## Recent Decisions (Last 2 Weeks)
+ - **2026-01-01**: Prioritize urgent tasks CTA over scan again - Experiment data shows 2x conversion lift - Impact: Changes Feed redesign scope - Owner: Lucas
```

### Confluence (Recommended)
I recommend also creating a decision page in Confluence because:
- This is a major Feed redesign scope change
- Engineering needs formal documentation
- Experiment results should be preserved

Should I:
1. Document in daily log and rolling context only (quick)
2. Also create Confluence decision page (comprehensive)
3. Wait, let me review the decision first

Choose option (1, 2, or 3):
```

### Step 7: Write Documentation (After Approval)

**Only execute after user approves.**

1. **Update daily log** (if approved)
2. **Update rolling context** (if approved)
3. **Create Confluence page** (if approved)
4. **Link them together**:
   - Add Confluence URL to daily log
   - Add Confluence URL to rolling context
   - Add Jira tickets to Confluence page

5. **Confirm to user**:
   ```
   ✅ Decision documented!

   Where:
   - Daily log: .ai/context/daily-logs/2026-01-01-kyler.md
   - Rolling context: app-experience-context.md
   - Confluence: [Page Title](URL)

   Related:
   - ALL-1234 (updated with decision link)
   - Feed PRD (section 4.3 flagged for update)

   This decision is now part of the permanent record.
   ```

---

## Decision Quality Checklist

Before documenting, ensure:

- [ ] **What** is clear (no ambiguity about what was decided)
- [ ] **Why** is explained (rationale with data/reasoning)
- [ ] **Who** owns it (clear accountability)
- [ ] **When** it takes effect (timeline is explicit)
- [ ] **Impact** is described (what changes as a result)
- [ ] **Alternatives** were considered (not just one option)
- [ ] **Reversibility** is noted (if decision can be revisited later)

**If any of these are unclear, ask user for clarification before documenting.**

---

## Special Cases

### Temporary Decisions

**Example**: "We'll try this for 2 weeks and reassess"

**Document with**:
- Explicit timeline: "Trial period: Jan 1 - Jan 15"
- Success criteria: "If metric X improves, keep; otherwise revert"
- Review date: "Reassess on Jan 16"

### Conditional Decisions

**Example**: "If experiment succeeds, build feature X; otherwise build Y"

**Document with**:
- Condition: "If conversion >10%, proceed with X"
- Fallback: "If conversion <10%, proceed with Y"
- Decision date: "Will decide after 2 weeks of experiment data"

### Delayed Decisions

**Example**: "We're postponing this decision until we have more data"

**Document with**:
- What we're NOT deciding yet: "Not choosing CTA variant"
- Why: "Need 2 more weeks of experiment data for statistical significance"
- When decision will be made: "Decision by Jan 15"
- Who will decide: "Lucas based on experiment results"

---

## Linking Decisions to Work

### Update Affected Tickets

**After documenting decision**, suggest updating related Jira tickets:

```
This decision affects these tickets:
- ALL-1234 (Feed Urgent Tasks) - Should I add decision link?
- ALL-1235 (Feed Redesign V2) - Should I update scope in description?

Say "yes" to update both, or specify which ones.
```

### Update Affected PRDs

**After documenting decision**, suggest updating PRDs:

```
This decision impacts these docs:
- Feed PRD section 4.3 (CTA strategy) - Needs scope update
- Q1 Roadmap (Feed milestone) - Needs timeline adjustment

Should I:
1. Flag these for manual update (add comment)
2. Draft proposed changes for your review
3. Skip for now

Choose option (1, 2, or 3):
```

---

## Decision Archive

**In rolling context**, old decisions (>2 weeks) move to Archive section automatically.

**Why archive instead of delete**:
- Maintains history for retrospectives
- Helps onboard new team members
- Useful for understanding product evolution
- Prevents repeating past mistakes

**Archive format**:
```markdown
## Archive (Decisions > 2 Weeks Old)

- **2025-12-15**: [Decision] - [Rationale] - Owner: [person]
- **2025-12-10**: [Decision] - [Rationale] - Owner: [person]
```

**Search archived decisions**:
- Grep through rolling context files
- Search Confluence decision pages
- Review daily logs from that timeframe
