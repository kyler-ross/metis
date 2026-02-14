---
name: templates
description: Resource file for pm-document agent
type: resource
---

# PM Document - Templates

This resource contains all output templates for daily logs, rolling context, decisions, and documentation formats.

---

## Daily Log Template

**File**: `.ai/context/daily-logs/YYYY-MM-DD-[pm_owner].md`

**Full structure** (for new files):

```markdown
# Daily Log - [Day of Week], [Month] [Day], [Year]

## What I Did Today
- [Action 1] - [Brief context, link to ticket/doc if relevant]
- [Action 2] - [Brief context]
- [Action 3] - [Brief context]

## Decisions Made
- **[Decision Title]**: [What was decided] - [Rationale/data] - Owner: [person]
- **[Decision Title]**: [What was decided] - [Rationale] - Owner: [person]

## Jira Activity

### Created
- [ALL-123](https://yourcompany.atlassian.net/browse/ALL-123) - [Ticket Title]
- [ALL-456](https://yourcompany.atlassian.net/browse/ALL-456) - [Ticket Title]

### Updated
- [ALL-789](https://yourcompany.atlassian.net/browse/ALL-789) - [What changed]
- [ALL-101](https://yourcompany.atlassian.net/browse/ALL-101) - [What changed]

### Blocked
- [ALL-202](https://yourcompany.atlassian.net/browse/ALL-202) - [Blocker description]

## Confluence Activity
- Updated: [Page Title](URL) - [What changed]
- Created: [Page Title](URL) - [Purpose]
- Commented on: [Page Title](URL) - [Topic]

## Follow-ups Created
- [ ] [Follow-up task] - Owner: [person] - Deadline: [when]
- [ ] [Follow-up task] - Owner: [person] - Deadline: [when]

## Open Questions
- [Question] - Raised by: [person], Context: [why it matters], Likely owner: [who should answer]
- [Question] - Raised by: [person], Context: [why it matters], Likely owner: [who should answer]

## Notes & Learnings
- [Strategic context, team dynamics, important realizations, metrics insights]
- [Experiment results or user feedback]
- [Aha moments or important discoveries]

---

_Generated at: [timestamp]_
_Based on: [X decisions, Y Jira tickets, Z Confluence pages, conversation with Chief of Staff]_
```

**Append template** (for existing files):

```markdown
[... existing content above ...]

## What I Did Today
[... existing actions ...]
- [NEW Action 1] - [context]
- [NEW Action 2] - [context]

## Decisions Made
[... existing decisions ...]
- **[NEW Decision]**: [details]

[... same pattern for other sections ...]

---

_Last updated: [timestamp]_
_Session 2: [X new decisions, Y new Jira tickets, Z new items]_
```

---

## Rolling Context Template

**File**: `.ai/context/rolling/[team_key]-context.md`

**Full structure**:

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
> - Complete Wallet tab Basic mode integration
> - Health Meter V2 design finalization

---

## Active Work

### In Progress
- **[Initiative/Feature]** - Status: [In Development / In Review / Testing] - Owner: [person] - Timeline: [target date]
  - Context: [Why we're doing this, user impact, business goal]
  - Progress: [What's done, what's left]
  - Tickets: [ALL-123, ALL-456]
  - Blockers: [If any, or "None"]

- **[Initiative/Feature]** - Status: [status] - Owner: [person] - Timeline: [date]
  - Context: [Why]
  - Progress: [Status]
  - Tickets: [links]

### Recently Completed
- **[Feature]** - Shipped: [date] - Impact: [metric or outcome if known]
- **[Feature]** - Shipped: [date] - Impact: [outcome]

---

## Recent Decisions (Last 2 Weeks)

- **[YYYY-MM-DD]**: [Decision] - [Rationale] - Impact: [What changes] - Owner: [person]
- **[YYYY-MM-DD]**: [Decision] - [Rationale] - Impact: [What changes] - Owner: [person]

---

## Open Questions

- **[Question]** - Asked by: [person], Date: [when]
  - Context: [Why this matters, what's blocked or affected]
  - Potential owners: [Who might answer]
  - Follow-up: [Ticket/thread if created, or "None yet"]

- **[Question]** - Asked by: [person], Date: [when]
  - Context: [Why this matters]
  - Potential owners: [Who might answer]
  - Follow-up: [link or "TBD"]

---

## Key Metrics

- **[Metric Name]**: [Value] ([⬆️⬇️➡️ trend indicator]) - Last updated: [date]
  - Context: [What this means, why it matters, target if any]

- **[Metric Name]**: [Value] ([trend]) - Last updated: [date]
  - Context: [Meaning and target]

---

## Recent Learnings

- **[Learning]** - Date: [when]
  - From: [Experiment / User research / Incident / Retrospective]
  - Implication: [What we should do differently, what we learned]

- **[Learning]** - Date: [when]
  - From: [Source]
  - Implication: [What to do differently]

---

## Blockers & Risks

- **[Blocker/Risk]** - Owner: [person] - Since: [when]
  - Impact: [What's blocked, what's at risk]
  - Plan: [How we're resolving it, escalation if needed]
  - Status: [Active / Resolving / Escalated]

- **[Blocker/Risk]** - Owner: [person] - Since: [when]
  - Impact: [What's affected]
  - Plan: [Resolution plan]
  - Status: [status]

---

## Archive (Decisions > 2 Weeks Old)

- **[YYYY-MM-DD]**: [Decision] - [Rationale] - Owner: [person]
- **[YYYY-MM-DD]**: [Decision] - [Rationale] - Owner: [person]

---

_Auto-updated by /pm-document. Last manual edit: [if applicable]_
```

---

## Decision Documentation Template (Confluence)

**Use when**: Major decision needs formal documentation in Confluence.

```markdown
# Decision: [Title]

**Date**: [YYYY-MM-DD]
**Owner**: [Name and role]
**Status**: [Decided | Under Review | Implemented]
**Teams Affected**: [List teams]

---

## Context

[Why was this decision needed? What problem are we solving? What led to this point?]

Example:
> We needed to choose between two CTA variants for the Feed redesign: "urgent tasks" vs "scan again". The Health Meter A/B experiment ran for 2 weeks with 500 users per variant to help inform this decision.

---

## Decision

[What did we decide to do? Be clear and specific.]

Example:
> We will implement the "urgent tasks" CTA in the Feed redesign and deprioritize the "scan again" CTA to V2.

---

## Rationale

[Why did we make this choice? What data supports it? What tradeoffs did we consider?]

Example:
> The A/B experiment showed clear results:
> - Urgent tasks CTA: 8% task completion rate
> - Scan again CTA: 4% task completion rate
> - 2x lift is statistically significant (p<0.05)
>
> User research also showed that users prefer actionable, specific CTAs over generic prompts. "Urgent tasks" tells users exactly what to do, while "scan again" is vague.

---

## Alternatives Considered

1. **[Alternative 1]**: [Description]
   - **Pros**: [Why this could work]
   - **Cons**: [Why we didn't choose this]

2. **[Alternative 2]**: [Description]
   - **Pros**: [Advantages]
   - **Cons**: [Why we rejected it]

3. **[Alternative 3]**: [Description]
   - **Pros**: [Benefits]
   - **Cons**: [Reasons against]

Example:
> 1. **Scan again CTA**: Re-run the privacy scan
>    - Pros: Familiar action, simple to implement
>    - Cons: Only 4% engagement, vague user value
>
> 2. **Both CTAs (A/B test permanently)**: Show different users different CTAs
>    - Pros: Could optimize per user segment
>    - Cons: Adds complexity, split focus, harder to measure success
>
> 3. **No CTA (passive feed only)**: Just show feed cards without prompts
>    - Pros: Simple, less UI clutter
>    - Cons: Misses opportunity to drive action, no engagement lever

---

## Impact

### Product
- [What changes for users]
- [What changes in product scope]

### Engineering
- [What changes for engineering team]
- [Technical implications]

### Timeline
- [When this takes effect]
- [Dependencies or milestones]

Example:
> **Product**:
> - Feed V1 will include urgent tasks CTA only
> - Scan again CTA delayed to V2 (post-launch iteration)
> - Changes Feed PRD section 4.3
>
> **Engineering**:
> - Reduces V1 scope by 1 CTA variant
> - Backend API needs urgent task prioritization logic
> - Frontend implementation simplified (one CTA instead of two)
>
> **Timeline**:
> - Effective immediately for Sprint 48 planning
> - Feed V1 ships Jan 20
> - Scan again CTA reconsidered for V2 (Feb/Mar)

---

## Related Work

**Jira Tickets**:
- [ALL-123](URL) - [Title and status]
- [ALL-456](URL) - [Title and status]

**PRDs/Specs**:
- [PRD Title](URL) - [Relevant section]
- [Spec Title](URL) - [How it relates]

**Experiments/Data**:
- [Experiment name/link] - [Key findings]
- [Data source/link] - [Insights]

**Previous Decisions**:
- [Related Decision](URL) - [How it relates]

Example:
> **Jira Tickets**:
> - [ALL-1234](https://...) - Feed Urgent Tasks Integration (In Progress)
> - [ALL-5678](https://...) - Feed Redesign Epic (Active)
>
> **PRDs/Specs**:
> - [Feed Redesign PRD](https://...) - Section 4.3 (CTA Strategy)
> - [Health Meter Spec](https://...) - Experiment Results
>
> **Experiments/Data**:
> - [Health Meter CTA A/B Test](PostHog link) - 2x lift for urgent tasks
>
> **Previous Decisions**:
> - [Decision: Feed V1 Scope](URL) - Set initial Feed features

---

## Open Questions

- [ ] [Question 1] - Owner: [who will answer] - Due: [when]
- [ ] [Question 2] - Owner: [who] - Due: [when]

Example:
> - [ ] Should V2 include scan again CTA or a different action? - Owner: Lucas - Due: Before V2 planning (Feb)
> - [ ] Do we need separate urgent task categories (data removal vs password reset)? - Owner: Lucas + Design - Due: Sprint 48

---

_Decision documented by [name] on [date]_
```

---

## Experiment Summary Template (Confluence)

**Use when**: Documenting A/B test or experiment results.

```markdown
# Experiment: [Name]

**Date Run**: [Start date] - [End date]
**Status**: [Complete | In Progress | Cancelled]
**Owner**: [Name]

---

## Hypothesis

[What did we expect to happen and why?]

Example:
> We hypothesized that a task-focused CTA ("urgent tasks") would drive higher engagement than a generic action CTA ("scan again") because users want specific, actionable guidance.

---

## Setup

**Variants**:
- **Control**: [Description]
- **Variant A**: [Description]
- **Variant B**: [Description (if applicable)]

**Metrics**:
- Primary: [Main success metric]
- Secondary: [Additional metrics]

**Audience**:
- Sample size: [N users per variant]
- Eligibility: [Who was included]
- Duration: [How long it ran]

Example:
> **Variants**:
> - Control: No CTA in Health Meter
> - Variant A: "Scan again" CTA
> - Variant B: "Urgent tasks" CTA
>
> **Metrics**:
> - Primary: CTA click-through rate
> - Secondary: Task completion rate, time to completion
>
> **Audience**:
> - 500 users per variant (1500 total)
> - Active users with Health Meter access
> - Ran for 2 weeks (Dec 1-14)

---

## Results

**Summary**:
[High-level findings]

**Data**:
| Variant | Primary Metric | Secondary Metric | Statistical Significance |
|---------|----------------|------------------|-------------------------|
| Control | [value] | [value] | - |
| Variant A | [value] | [value] | [p-value] |
| Variant B | [value] | [value] | [p-value] |

Example:
> **Summary**:
> Variant B (urgent tasks CTA) significantly outperformed both control and Variant A.
>
> **Data**:
> | Variant | CTR | Task Completion | Significance |
> |---------|-----|-----------------|--------------|
> | Control (no CTA) | 0% | 2% | - |
> | Variant A (scan again) | 10% | 4% | p=0.03 |
> | Variant B (urgent tasks) | 18% | 8% | p<0.01 |

---

## Insights

- [Key insight 1]
- [Key insight 2]
- [Surprising finding]

Example:
> - Users engage 2x more with specific task CTAs vs generic actions
> - Highest engagement for data removal tasks (most urgent user need)
> - Scan again CTA performed better than no CTA but still underperformed urgent tasks

---

## Decision

[What did we decide based on these results?]

Example:
> Based on these results, we decided to:
> 1. Implement urgent tasks CTA in Feed V1
> 2. Delay scan again CTA to V2
> 3. Explore additional task-focused CTAs for future iterations

**Link to decision doc**: [Decision: Feed CTA Choice](URL)

---

## Next Steps

- [ ] [Action item 1] - Owner: [who] - Due: [when]
- [ ] [Action item 2] - Owner: [who] - Due: [when]

Example:
> - [x] Update Feed PRD with urgent tasks CTA - Owner: Lucas - Due: Dec 15
> - [x] Create Jira ticket for implementation - Owner: Lucas - Due: Dec 15
> - [ ] Design urgent tasks UI - Owner: Sarah - Due: Dec 20
> - [ ] Implement backend task prioritization - Owner: Vincent - Due: Jan 5

---

_Experiment documented by [name] on [date]_
```

---

## Jira Ticket Link Template

**Use in daily logs** when referencing Jira tickets:

```markdown
[ALL-1234](https://yourcompany.atlassian.net/browse/ALL-1234)
```

**Always use full URLs**, never relative links.

---

## Confluence Page Link Template

**Use in daily logs** when referencing Confluence pages:

```markdown
[Page Title](https://yourcompany.atlassian.net/wiki/spaces/SPACE/pages/PAGEID)
```

**Always use full URLs**, never relative links.

---

## Follow-up Task Template

**Use in daily logs** for checkboxes:

```markdown
- [ ] [Specific actionable task] - Owner: [person] - Deadline: [when]
```

**Examples**:
```markdown
- [ ] Schedule technical assessment for Wallet tab with Nate - Owner: Lucas - By Friday
- [ ] Update Feed PRD section 4.3 with experiment results - Owner: Lucas - By EOW
- [ ] Review designs with Sarah before sprint planning - Owner: Lucas - By Thursday
```

---

## Trend Indicators

**Use in rolling context** for metrics:

- `⬆️` Trending up (positive or improving)
- `⬇️` Trending down (negative or declining)
- `➡️` Flat (no significant change)

**Example**:
```markdown
- **Health Meter Engagement**: 18% (⬆️ from 15%) - Last updated: 2026-01-01
- **Feed Task Completion**: 8% (➡️ flat from last week) - Last updated: 2026-01-01
- **Churn Rate**: 2.5% (⬇️ from 3.1%) - Last updated: 2026-01-01
```

---

## Date Format Standard

**Always use YYYY-MM-DD** format:

- ✅ "2026-01-01"
- ❌ "Jan 1, 2026"
- ❌ "1/1/26"
- ❌ "January 1st"

**Why**: Sortable, unambiguous, consistent across time zones.
