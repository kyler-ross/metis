---
name: gap-analysis
description: Resource file for pm-document agent
type: resource
---

# PM Document - Gap Analysis

This resource contains methodology for identifying what needs formal documentation (PRDs, specs, Confluence pages).

---

## Purpose

Identify documentation gaps where decisions, features, or work lack proper documentation. This helps ensure:
- Important decisions don't get lost
- Features have proper specs before engineering starts
- Cross-team work is clearly documented
- Knowledge is captured for future reference

**Use this when**: After a series of decisions, when planning a new feature, or during documentation reviews.

---

## Types of Documentation Gaps

### Gap 1: Undocumented Decisions

**Symptom**: Decisions made in meetings or conversations but not written down formally.

**Example**:
- "We decided to delay offline mode" → Where is this documented?
- "We're prioritizing iOS over Android for Q1" → Is this in the roadmap?

**Solution**: Create decision doc in Confluence or update rolling context.

### Gap 2: Missing PRDs

**Symptom**: Engineering is ready to build but there's no product spec.

**Example**:
- ALL-1234 (Build Wallet tab) exists but no PRD
- Feature in roadmap but no acceptance criteria defined

**Solution**: Create PRD before work starts.

### Gap 3: Outdated Documentation

**Symptom**: Existing docs don't reflect current decisions or scope.

**Example**:
- PRD says "support offline mode" but we decided to delay it
- Roadmap shows Feature X in Q1 but it's been moved to Q2

**Solution**: Update existing docs to match current state.

### Gap 4: Scattered Information

**Symptom**: Information exists but spread across Slack, Jira comments, meeting notes.

**Example**:
- Acceptance criteria in Jira ticket + Slack thread + meeting notes
- Decision rationale only in Slack, not in formal docs

**Solution**: Consolidate into single source of truth (PRD or Confluence page).

### Gap 5: Implicit Knowledge

**Symptom**: Team knows something but it's never been written down.

**Example**:
- "Everyone knows we prioritize data removal over new features" → Where is this documented?
- "We always test on iOS first, then Android" → Is this in our process docs?

**Solution**: Document tribal knowledge in team wiki or product principles.

---

## Gap Analysis Workflow

### Step 1: Review Recent Work

**From conversation**, identify:
- Decisions made recently
- Features discussed or planned
- Experiments launched
- User research conducted

**From Jira**, check:
- Tickets created in last 2 weeks
- Epics without linked PRDs
- High-priority tickets without clear acceptance criteria

**From Confluence**, check:
- Pages not updated in >30 days but related to active work
- PRDs marked "Draft" for >2 weeks
- Missing pages mentioned in tickets

### Step 2: Categorize Gaps by Priority

**High Priority** (blocks work or creates risk):
- PRD missing for feature starting next sprint
- Decision affecting multiple teams not documented
- Acceptance criteria unclear for in-progress ticket
- Outdated PRD contradicting recent decisions

**Medium Priority** (should document but not urgent):
- Decision from last week not in rolling context
- Experiment results not documented
- Process improvement idea not captured
- User research findings not formalized

**Low Priority** (nice to have):
- Old tribal knowledge to document
- Historical context to preserve
- Process refinements to write up

### Step 3: Assess Documentation Need

**For each gap, ask**:

1. **Who needs this documentation?**
   - Just the PM? → Daily log or rolling context sufficient
   - Engineering team? → Need PRD or spec
   - Multiple teams? → Need Confluence page
   - Leadership? → Need formal doc + presentation

2. **When is it needed?**
   - Before next sprint? → High priority, create now
   - Next month? → Medium priority, add to backlog
   - Someday? → Low priority, nice to have

3. **What format is best?**
   - Quick reference? → Rolling context or wiki page
   - Detailed spec? → PRD with acceptance criteria
   - Decision record? → Decision page or ADR
   - Process documentation? → Team wiki or handbook

4. **Does it already exist partially?**
   - Yes, update existing → Faster than creating new
   - No, create new → Ensure proper structure and location

### Step 4: Generate Gap Analysis Report

**Prepare report** (DO NOT WRITE YET - show to user first):

```markdown
## 📄 Documentation Gap Analysis

**Analysis Date**: [YYYY-MM-DD]
**Scope**: [Last 2 weeks / Current sprint / Specific feature]

---

### High Priority Gaps (Do This Week)

1. **Missing PRD: Wallet Tab Feature**
   - **Why needed**: Engineering starting implementation next sprint
   - **Who needs it**: Vincent (Eng Lead), Mobile team
   - **Format**: PRD with acceptance criteria, designs, success metrics
   - **Action**: Create new PRD in Confluence PROD space
   - **Owner**: Lucas
   - **Timeline**: By Friday (before sprint planning)

2. **Outdated PRD: Feed Redesign**
   - **What's wrong**: Section 4.3 says "scan again CTA" but we decided on "urgent tasks CTA"
   - **Impact**: Engineering might build wrong feature
   - **Format**: Update existing PRD section 4.3
   - **Action**: Update Confluence page, notify engineering in Slack
   - **Owner**: Lucas
   - **Timeline**: Today

---

### Medium Priority Gaps (Do This Month)

3. **Undocumented Decision: Q1 iOS Priority**
   - **What**: We decided to prioritize iOS over Android for Q1
   - **Where discussed**: Monday team meeting, not written down
   - **Who needs to know**: Android team, leadership
   - **Format**: Decision page in Confluence
   - **Action**: Create decision doc explaining rationale (experiment results)
   - **Owner**: Lucas
   - **Timeline**: This week

4. **Scattered Info: Experiment Results**
   - **What**: Health Meter A/B test results in Slack + PostHog + meeting notes
   - **Issue**: No single source of truth
   - **Format**: Experiment summary in Confluence
   - **Action**: Consolidate results, link to Feed PRD
   - **Owner**: Lucas + Data team
   - **Timeline**: Before next experiment launch

---

### Low Priority Gaps (Backlog)

5. **Tribal Knowledge: Data Removal Prioritization**
   - **What**: "We always prioritize data removal over new features"
   - **Issue**: New team members don't know this
   - **Format**: Product principles doc
   - **Action**: Document in team wiki
   - **Owner**: Lucas
   - **Timeline**: Q1 sometime

---

### Recommendations

**For High Priority Gaps**:
- I can draft these docs for your review
- For Wallet PRD, I can generate template with sections for you to fill
- For Feed PRD update, I can propose specific changes

**For Medium Priority Gaps**:
- Schedule time this week to document decision
- I can consolidate experiment results from sources

**For Low Priority Gaps**:
- Add to documentation backlog
- Revisit during Q1 planning

---

What would you like me to help with first?
```

### Step 5: Get User Input

**Present report and ask**:
```
I've identified [X] documentation gaps:
- [Y] high priority (need this week)
- [Z] medium priority (need this month)

Should I:
1. Help you create the high priority docs now
2. Show detailed analysis for specific gaps
3. Wait, I disagree with these priorities

Choose option (1, 2, or 3):
```

### Step 6: Help Create Missing Documentation

**If user chooses option 1**, offer to:

**For Missing PRDs**:
```
I can create a PRD template for [Feature Name] with:
- Overview section
- User stories
- Acceptance criteria (draft based on conversation)
- Success metrics
- Out of scope
- Open questions

Should I generate this template?
```

**For Outdated PRDs**:
```
I can draft proposed changes for [PRD Section]:

Current text:
"[old content]"

Proposed update:
"[new content based on recent decision]"

Should I prepare this update for Confluence?
```

**For Undocumented Decisions**:
```
I can draft a decision page for:

Decision: [Title]
Context: [Why this was needed]
Rationale: [Data/reasoning]
Impact: [What changes]

Should I create this Confluence page?
```

---

## Gap Analysis Triggers

**When to run gap analysis**:

### Weekly Review (Friday afternoon)
- Check what decisions were made this week
- Verify they're documented in rolling context
- Flag any that need formal Confluence docs

### Sprint Planning Prep
- Review all tickets in next sprint
- Ensure each has clear acceptance criteria
- Verify high-priority tickets have linked PRDs

### After Major Decisions
- Immediately after strategic decision
- Check if it needs formal documentation
- Decide where to document (log, context, Confluence)

### Quarterly Review
- Review all PRDs and specs
- Check for outdated content
- Consolidate scattered information
- Archive old docs

---

## Documentation Assessment Criteria

**For each potential gap, evaluate**:

### Completeness
- Does it have all necessary information?
- Are acceptance criteria clear and testable?
- Are success metrics defined?

### Currency
- Is it up to date with recent decisions?
- Does it reflect current scope and priorities?
- Are linked tickets and docs current?

### Accessibility
- Can team members find it easily?
- Is it in the right location (space, folder)?
- Is it linked from relevant places?

### Clarity
- Can someone unfamiliar understand it?
- Is rationale explained?
- Are assumptions documented?

### Actionability
- Does it enable engineering to start work?
- Are edge cases and constraints clear?
- Are open questions flagged?

---

## Common Documentation Patterns

### Pattern: Epic without PRD

**Gap**: Jira epic exists but no product spec

**Solution**:
1. Create PRD in Confluence
2. Link PRD to epic (add Confluence URL in epic description)
3. Ensure epic sub-tasks reference PRD sections

### Pattern: Decision in Slack only

**Gap**: Important decision discussed in Slack but not documented formally

**Solution**:
1. Capture decision in daily log (immediate)
2. Add to rolling context (team awareness)
3. If major, create Confluence decision page (long-term reference)
4. Link decision page in Slack thread (close the loop)

### Pattern: Experiment results scattered

**Gap**: Results in PostHog + Slack + meeting notes

**Solution**:
1. Create experiment summary page in Confluence
2. Include: hypothesis, setup, results, decision, next steps
3. Link from PRD (if experiment informs feature)
4. Add to rolling context learnings

### Pattern: Outdated roadmap

**Gap**: Roadmap shows old priorities, not current state

**Solution**:
1. Update roadmap with recent decisions
2. Add "Last updated" timestamp
3. Archive old versions (don't delete history)
4. Notify stakeholders of changes

---

## Preventing Future Gaps

### Habits to Build

**After every major decision**:
- Immediately add to daily log
- Within 24 hours, add to rolling context
- If major, schedule time to create Confluence doc

**Before starting any feature**:
- Verify PRD exists and is current
- Ensure acceptance criteria are clear
- Check that design and product are aligned

**During weekly reviews**:
- Check for undocumented decisions
- Verify active work has proper specs
- Flag outdated docs for update

**At end of sprint**:
- Document retrospective learnings
- Update roadmap with completed work
- Archive or update old docs

---

## Output Template

**Gap analysis report structure**:

```markdown
## Documentation Gap Analysis - [Date]

### Summary
- [X] total gaps identified
- [Y] high priority (need this week)
- [Z] medium priority (need this month)
- [N] low priority (backlog)

### High Priority
[List with: what, why needed, who needs, format, action, owner, timeline]

### Medium Priority
[List with: what, issue, format, action, owner, timeline]

### Low Priority
[List with: what, issue, format, action, owner, timeline]

### Recommendations
[Specific next steps]

### Proposed Actions
[What I can help with right now]
```

**Present to user for prioritization and action.**
