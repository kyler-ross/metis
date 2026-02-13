---
name: ticket-templates
description: Resource file for jira-ticket-writer agent
type: resource
---

# Jira Ticket Writer - Ticket Templates

This resource contains mandatory templates for Bug, Feature/Improvement, and Task tickets.

---

## Core Principle

**STATE WHAT AND WHY. NEVER HOW.**

Tickets are asks, not implementation specs. Engineers solution. You provide context, not instructions.

---

## Template Format Rules

**Note**: These show the conceptual structure. When creating tickets via API, convert to ADF (Atlassian Document Format) - see api-reference.md for details.

---

## Bug Template

```
Title: [platform]: [what's broken]

Source: [internal-qa | customer | internal-feedback | sentry | automated-test]

Impact: [extensive | significant | moderate | minor]
  - extensive: Affects all or most users
  - significant: Affects a large user segment
  - moderate: Affects a subset of users
  - minor: Affects few users or edge cases

User Pain: [crash | major-functional | minor-functional | major-ux | minor-ux]
  - crash: App crash, data loss, or security issue
  - major-functional: Core feature completely broken
  - minor-functional: Feature works but with issues
  - major-ux: Significantly degraded experience
  - minor-ux: Cosmetic or minor annoyance

What happened: [actual behavior]

What should have happened: [expected behavior]

Repro:
1. [step]
2. [step]
3. [step]

Evidence: [data, Sentry link, screenshot, or blank]

Priority: [Use the matrix in knowledge/jira-priority-matrix.md]
  - Assess Severity (S1-S4) based on User Pain
  - Assess Likelihood (L1-L4) based on Impact
  - Cross-reference to get: Highest, High, Medium, or Low

Labels: [iOS | Android | Mobile | Dashboard | Extension | Platform] + [feature labels]

Components: [Mobile | Dashboard | Extension | Platform | Feature-1 | Feature-2 | Feature-3]

Notes: [Constraints, dependencies, edge cases - WHAT to think about, not HOW to fix]
```

### Bug Template - Required Fields

- **Title**: Clear, concise, includes platform
- **Source**: Where the bug was discovered
- **Impact**: How many users are affected
- **User Pain**: Severity of the problem
- **What happened**: Observable actual behavior
- **What should have happened**: Expected behavior
- **Repro**: Steps to reproduce (if known)
- **Evidence**: Links, screenshots, data (if available)
- **Priority**: Based on priority matrix
- **Labels**: Platform + feature area
- **Components**: Product area
- **Notes**: Important context, constraints, edge cases

### Bug Template - Example

```
Title: iOS: App crashes when deleting account

Source: internal-qa

Impact: moderate
  - Affects users who attempt account deletion

User Pain: crash
  - App crashes, forcing restart

What happened: App crashes immediately when user taps "Delete Account" in Settings

What should have happened: Should show confirmation dialog, then delete account and log out

Repro:
1. Open [Your Company] app on iOS
2. Navigate to Settings > Account
3. Tap "Delete Account"
4. App crashes before confirmation dialog appears

Evidence: Sentry error log: https://sentry.io/[your-org]/issues/12345

Priority: High (S1 severity, L2 likelihood)

Labels: iOS, Account-Management

Components: Mobile

Notes:
- Only affects iOS 16+; iOS 15 works correctly
- May be related to recent keychain changes in PROJ-XXX
- Consider: What if user has pending transactions?
- Constraint: Must comply with GDPR deletion requirements
```

---

## Feature/Improvement Template

```
Title: [Verb] [what] [for whom]

User Story: As a [type], I want [function] so that [benefit]

Acceptance Criteria:
- [Testable outcome]
- [Edge case handling]
- [Success metric]
- [PostHog events: noun_verb_noun format]

Designs: [Figma link or "TBD"]

Notes: [Constraints, dependencies - WHAT matters, not HOW to build]
```

### Feature Template - Required Fields

- **Title**: Action-oriented, clear beneficiary
- **User Story**: Classic format (As a... I want... so that...)
- **Acceptance Criteria**: Testable outcomes (can verify done/not done)
- **Designs**: Figma link if available, otherwise "TBD"
- **Notes**: Constraints, dependencies, business context

### Feature Template - Example

```
Title: Add urgent tasks section to Feed

User Story: As a [Your Company] user, I want to see my most urgent tasks prominently in the Feed so that I can quickly address high-priority items

Acceptance Criteria:
- Urgent tasks appear at top of Feed above other cards
- Tasks are sorted by priority ([Feature A] requests first, then [Feature B] actions, then other)
- Tapping a task navigates to appropriate action (e.g., [Feature A] flow)
- Section is hidden if user has no urgent tasks
- PostHog events: feed_urgent_task_viewed, feed_urgent_task_tapped

Designs: https://figma.com/file/abc123/Feed-V2

Notes:
- Constraint: Must load in <200ms to avoid Feed lag
- Dependency: Requires task prioritization logic from [Feature Name] experiment (PROJ-XXX)
- Edge case: What if user has 50+ urgent tasks? (Show max 5, link to full list)
- Business context: Experiment shows 2x conversion lift for urgent tasks CTA vs "scan again"
```

---

## Task Template

```
Title: [Action] [deliverable]

Objective: [What to accomplish]

Success Metrics: [How measured]

Deliverables:
- [Output 1]
- [Output 2]

Timeline: [Start → Target]

Dependencies: [What's needed first]
```

### Task Template - Required Fields

- **Title**: Clear action and deliverable
- **Objective**: What to accomplish (the goal)
- **Success Metrics**: How to measure completion
- **Deliverables**: Concrete outputs
- **Timeline**: Start and target dates
- **Dependencies**: What must be done first

### Task Template - Example

```
Title: Conduct user research on [Feature Tab] discoverability

Objective: Understand why users aren't discovering the [Feature Tab] in Basic mode and identify UX improvements

Success Metrics:
- 10+ user interviews completed
- Clear themes identified for why users miss [Feature Tab]
- 3+ actionable recommendations for improving discoverability

Deliverables:
- User research plan and script
- Interview notes and recordings
- Summary report with findings and recommendations
- Presentation for product team

Timeline: Jan 5 → Jan 19

Dependencies:
- [Feature Tab] Basic mode must be live in production (PROJ-XXX)
- Recruiting coordinator availability for user scheduling
```

---

## Format Rules: What to Include

### ✅ DO Include

- **Business/user impact**: Why this matters to users or the business
- **Constraints**: Time limits, compatibility requirements, compliance needs
  - Example: "Must work offline", "< 200ms response time", "iOS 15+ compatible"
- **Edge cases**: Scenarios to consider
  - Example: "What if user has no email?", "What if >1000 items?"
- **Success metrics**: How to measure done
  - Example: "95% of users complete flow", "PostHog event firing correctly"
- **Dependencies**: What must happen first
  - Example: "Requires API endpoint from PROJ-XXX", "Blocked by design review"

### ❌ NEVER Include

- **File paths or line numbers**: "Update auth.ts line 45"
- **Code snippets**: "Add this function: `const foo = () => {...}`"
- **Function names**: "Create useSession hook"
- **Implementation steps**: "First create the component, then add state, then..."
- **Technology choices**: "Use Redux for state", "Implement with GraphQL"
- **Architecture decisions**: "Create a microservice for this"

### Exception: Constraints Are OK

You CAN mention technical constraints that define WHAT needs to work:
- "Must work offline" (constraint)
- "Response time < 200ms" (performance requirement)
- "iOS 15+ compatible" (platform constraint)
- "GDPR compliant" (compliance requirement)

You CANNOT suggest HOW to achieve those constraints:
- "Use IndexedDB for offline storage" (implementation detail)
- "Cache responses with Redis" (technology choice)

---

## Notes Section Guidelines

Every ticket should have a Notes section with breadcrumbs, not instructions.

### Good Notes Examples

```
Notes:
- Consider: Session storage lifecycle - what happens if user logs out mid-flow?
- Edge case: What if user has no network during this operation?
- Constraint: Must support iOS 15+ (can't use iOS 16-only APIs)
- Related: Similar Android issue in PROJ-XXX; may want to align approach
- Business context: Part of Q1 OKR to improve user onboarding completion rate
- Dependency: Requires new API endpoint from backend team (see PROJ-XXX)
- Compliance: Must comply with GDPR right-to-deletion requirements
```

### Bad Notes Examples

```
Notes:
- Use AsyncStorage for this (technology choice)
- Implement in auth.ts line 45 (implementation detail)
- Create useSession hook to manage state (architecture decision)
- Add try/catch around the API call (code instruction)
```

---

## Before Using a Template

Ask yourself:

1. Am I stating WHAT needs to happen? ✅
2. Am I explaining WHY it matters? ✅
3. Am I prescribing HOW to do it? ❌ (If yes, delete it)
4. Is this <20 lines? ✅ (If no, cut fluff)

---

## Template Selection Logic

**Use Bug template when**:
- Something is broken or not working as intended
- User is experiencing unexpected behavior
- System is crashing or erroring
- Feature exists but has issues

**Use Feature/Improvement template when**:
- Building new functionality
- Adding to existing features
- Improving user experience
- Creating new product capabilities

**Use Task template when**:
- Research or investigation needed
- Documentation or process work
- Non-code deliverables (designs, specs, analysis)
- Organizational or planning tasks

**If unsure**: Ask user or default to Task template (most flexible)
