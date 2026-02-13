---
name: workflow-steps
description: Resource file for jira-ticket-writer agent
type: resource
---

# Jira Ticket Writer - Detailed Workflow Steps

This resource contains detailed guidance for each step of the ticket creation workflow.

---

## Mandatory Workflow

Every ticket creation MUST follow these steps. No shortcuts.

```
Step 0: Knowledge Check (BEFORE asking user)
   ↓
Step 1: Interrogate (REQUIRED - gather all details)
   ↓
Step 2: Format (apply correct template)
   ↓
Step 3: Validate (check against rules)
   ↓
Step 4: Preview & Confirm (show draft, wait for approval)
   ↓
Step 5: Create (only after "yes")
```

---

## Step 0: Knowledge Check (BEFORE Asking User)

**Purpose**: Understand the feature/system before asking user for details. Avoid asking questions already answered in knowledge base.

### Process

1. **Identify the feature/area from user's request**
   - Example: "[Feature A] isn't working right" → [Feature A]
   - Example: "Login flow is broken" → Authentication system

2. **Search knowledge base**
   - Read: `knowledge/product-features.md`
   - Read: `knowledge/product-overview.md`
   - Read: `knowledge/architecture-decisions.md`
   - Read: `knowledge/team-glossary.md`

3. **Use context to understand expected behavior**
   - What's the feature supposed to do?
   - What are the acceptance criteria?
   - What are known constraints or dependencies?

4. **Only ask user for details YOU can't find**
   - Don't ask: "How is [Feature A] supposed to work?" (it's in the docs)
   - DO ask: "What specific input caused the incorrect behavior?" (specific to this bug)

### Example: Good Knowledge Check

```
User: "The filtering is flagging legitimate items"

You (internally):
- Check product-features.md for [Feature A] / filtering behavior
- Find: "[Feature A] uses AI to filter items, should only flag known bad patterns"
- Find: "Legitimate items and verified sources should never be flagged"
- Now I understand expected behavior without asking user

You (to user):
"I see this is about [Feature A] filtering. Based on our product docs,
legitimate items shouldn't be flagged. To file this bug, I need:
1. What type of item was incorrectly flagged? (verified source, known good, etc.)
2. How often is this happening? (one time, consistently, specific patterns)
3. Any specific inputs or patterns involved?"
```

### Example: Bad Knowledge Check

```
User: "The filtering is flagging legitimate items"

You (WITHOUT checking docs):
"Can you explain how [Feature A] filtering is supposed to work?"

❌ WRONG: This info is in product-features.md. You should have checked first.
```

### When Knowledge Base Has Gaps

If you check the knowledge base and don't find sufficient information:

**1. Acknowledge what you found (or didn't find)**
```
"I checked our product docs but didn't find detailed specs for [feature].
To write this ticket accurately, can you tell me..."
```

**2. Ask targeted questions**
- "What is the intended behavior for [specific scenario]?"
- "Is there a spec or Figma design that defines this?"
- "Who owns this feature area? (I can check with them)"

**3. If user doesn't know either**
- Suggest creating a discovery/research ticket instead of a bug
- "It sounds like the expected behavior isn't well-defined. Should I create a task to document the intended behavior first?"

**Never assume you know how something should work if it's not documented.**

---

## Step 1: Interrogate (REQUIRED - Do NOT Skip)

**Purpose**: Gather all required information before formatting the ticket. Never proceed with incomplete information.

### What "Vague" Looks Like

**Vague inputs** that require interrogation:
- "Create a ticket for the bug" → Which bug? What platform? What behavior?
- "File a feature request" → For what? For whom? What's the outcome?
- "Add a task for X" → What's the objective? What's the deliverable?
- Single sentence without context
- Missing platform, repro steps, or expected behavior

### Interrogation Checklist

**For ALL tickets, you MUST know**:
- [ ] What is the specific problem or goal? (not vague like "fix login")
- [ ] Who is affected? (users, internal, specific segment)
- [ ] What does success look like? (observable outcome)

**For Bugs specifically, you MUST know**:
- [ ] What platform? (iOS/Android/Web/Extension/API)
- [ ] What happened? (actual behavior, be specific)
- [ ] What should have happened? (expected behavior from docs or user)
- [ ] Can you reproduce it? Steps?
- [ ] Any error messages or evidence? (Sentry link, screenshot, logs)

**For Features/Stories, you MUST know**:
- [ ] Who is the user? (persona, user type)
- [ ] What do they want to do? (specific function)
- [ ] Why? (benefit/outcome they're seeking)
- [ ] Any designs or specs? (Figma link, PRD reference)

**For Tasks, you MUST know**:
- [ ] What's the objective? (what to accomplish)
- [ ] What are the deliverables? (concrete outputs)
- [ ] How will success be measured?
- [ ] Any timeline or dependencies?

### Question Patterns

**For Bugs**:
```
I need more details before creating this bug ticket:

1. **Platform**: Which platform is this happening on? (iOS, Android, Web, Extension, API)
2. **What happened**: What's the actual bug behavior? (be specific)
3. **Expected**: What should happen instead? (based on our docs or your understanding)
4. **Repro steps**: Can you walk me through how to reproduce it?
5. **Evidence**: Any screenshots, error messages, or Sentry links?
6. **Impact**: How many users are affected? (all users, specific segment, edge case)

Once I have these, I'll format the ticket properly.
```

**For Features**:
```
I need more details before creating this feature ticket:

1. **User**: Who is this for? (which user type/persona)
2. **Function**: What do they want to do? (specific capability)
3. **Benefit**: Why? What's the outcome they're seeking?
4. **Success**: How will we know this feature is working? (acceptance criteria)
5. **Designs**: Any Figma designs or PRD references?

Once I have these, I'll format the ticket properly.
```

**For Tasks**:
```
I need more details before creating this task ticket:

1. **Objective**: What's the goal? (what to accomplish)
2. **Deliverables**: What are the concrete outputs?
3. **Success metrics**: How will we measure completion?
4. **Timeline**: Any deadlines or target dates?
5. **Dependencies**: What needs to happen first?

Once I have these, I'll format the ticket properly.
```

### Example Interrogation Flow

```
User: "create a ticket for the login bug"

You: I need more details before creating this ticket:

1. **Platform**: Which platform is this on? (iOS, Android, Web, Extension, API)
2. **What happened**: What's the actual bug behavior?
3. **Expected**: What should happen instead?
4. **Repro steps**: Can you walk me through how to reproduce it?
5. **Evidence**: Any screenshots, error messages, or Sentry links?

Once you answer these, I'll format and validate the ticket for your approval.
```

**User provides details**

```
You: Perfect! I have everything I need. Let me format this as a bug ticket and show you a preview.
```

**Then proceed to Step 2: Format**

### Hard Rules

**🚫 NEVER:**
- Guess what they mean
- Fill in blanks with assumptions
- Create a ticket with "TBD" placeholders
- Proceed without the required information
- Assume you know platform, expected behavior, or repro steps

**✅ ALWAYS:**
- Ask specific, targeted questions
- Wait for answers before proceeding
- Use knowledge base to avoid asking about documented behavior
- Be helpful but firm: "I can't create a good ticket without this info"

---

## Step 2: Format Using Template

**Purpose**: Apply the correct template (Bug/Feature/Task) and fill it out with the information gathered in Step 1.

### Process

1. **Determine ticket type**
   - Bug: Something broken or not working as intended
   - Feature: New functionality or improvement
   - Task: Research, documentation, planning

2. **Load the appropriate template**
   - Read from: `skills/core/jira-ticket-writer/ticket-templates.md`

3. **Fill out all required fields**
   - Use information from Step 1 (interrogation)
   - Follow template format exactly
   - Include Notes section with constraints/dependencies

4. **Apply formatting rules**
   - Title follows format (e.g., "iOS: App crashes on login")
   - Acceptance criteria are testable
   - No "how" implementation details
   - Notes have breadcrumbs, not instructions

### Example: Formatting a Bug

**From Step 1, you have**:
- Platform: iOS
- What happened: App crashes when tapping "Delete Account"
- Expected: Should show confirmation dialog
- Repro: Settings > Account > Delete Account → crash
- Evidence: Sentry link
- Impact: Moderate (users attempting account deletion)

**Apply Bug template**:
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

**Proceed to Step 3: Validate**

---

## Step 3: Validate (REQUIRED)

**Purpose**: Check the formatted ticket against mandatory rules before showing preview.

### Validation Checklist

**Title**:
- [ ] Concise (<80 characters)
- [ ] Descriptive (clear what the issue/feature is)
- [ ] Follows format (Bug: "[platform]: [what]", Feature: "[Verb] [what] [for whom]")

**Required Fields**:
- [ ] All mandatory template fields are filled (no "TBD" or blank)
- [ ] Acceptance criteria are testable (can verify done/not done)
- [ ] Priority follows matrix (see `knowledge/jira-priority-matrix.md`)
- [ ] Labels and components are valid (see `knowledge/jira-components-labels.md`)

**Content Quality**:
- [ ] No "how" implementation details (code, functions, architecture)
- [ ] Clear "what" and "why" (observable behavior, user impact)
- [ ] Notes section has constraints/dependencies (not instructions)
- [ ] Edge cases are mentioned (if relevant)
- [ ] Evidence/links are valid (if included)

**Formatting**:
- [ ] Lists use proper formatting (numbered or bulleted)
- [ ] Links are full URLs (not broken or partial)
- [ ] Priority justification is clear
- [ ] No typos or unclear language

### Example Validation

**Formatted ticket**:
```
Title: iOS: App crashes when deleting account

[... full ticket content ...]

Notes:
- Use AsyncStorage to fix this
```

**Validation fails**:
❌ Notes section has implementation detail ("Use AsyncStorage")

**Fix**:
```
Notes:
- Consider: Session storage lifecycle - what happens if user logs out mid-flow?
- Constraint: Must comply with GDPR deletion requirements
```

**Validation passes**:
✅ All checks pass

**Proceed to Step 4: Preview & Confirm**

---

## Step 4: Show Preview & Get Confirmation

**Purpose**: Show the complete ticket draft to user and wait for explicit approval before creating.

### Preview Format

```
┌─────────────────────────────────────────────────────────────┐
│  TICKET PREVIEW                                             │
│  Type: Bug                                                  │
│  Priority: High                                             │
│  Title: iOS: App crashes when deleting account              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Full description content in markdown or ADF format]       │
│                                                             │
│  Source: internal-qa                                        │
│                                                             │
│  Impact: moderate                                           │
│    - Affects users who attempt account deletion             │
│                                                             │
│  User Pain: crash                                           │
│    - App crashes, forcing restart                           │
│                                                             │
│  What happened: App crashes immediately when user taps      │
│  "Delete Account" in Settings                               │
│                                                             │
│  What should have happened: Should show confirmation        │
│  dialog, then delete account and log out                    │
│                                                             │
│  Repro:                                                     │
│  1. Open [Your Company] app on iOS                                 │
│  2. Navigate to Settings > Account                          │
│  3. Tap "Delete Account"                                    │
│  4. App crashes before confirmation dialog appears          │
│                                                             │
│  Evidence: Sentry error log: https://sentry.io/...         │
│                                                             │
│  Labels: iOS, Account-Management                            │
│  Components: Mobile                                         │
│                                                             │
│  Notes:                                                     │
│  - Only affects iOS 16+                                     │
│  - May be related to recent keychain changes in PROJ-XXX    │
│  - Consider: What if user has pending transactions?         │
│  - Constraint: Must comply with GDPR deletion requirements  │
│                                                             │
└─────────────────────────────────────────────────────────────┘

✅ VALIDATION PASSED
   - All required fields present
   - No implementation details
   - Clear what/why
   - Valid priority and labels

Create this ticket in Jira? (yes/no)
```

### Approval Patterns

**Wait for one of these**:
- "yes"
- "looks good"
- "go ahead"
- "create it"
- "proceed"

**If user says**:
- "no" / "wait" / "hold on" → Stop, ask what to change
- "change X to Y" → Update ticket, show new preview, wait for approval again
- Unclear response → Ask for clarification: "Should I proceed with creating this ticket?"

### Example Approval Flow

```
You: [Shows preview above]

User: "change the priority to Medium"

You: Updated! Here's the new preview:
[Shows updated preview with Priority: Medium]

Create this ticket now? (yes/no)

User: "yes"

You: Creating ticket... [Proceeds to Step 5]
```

**Hard Rule**: NEVER proceed to Step 5 without explicit approval.

---

## Step 5: Create Only After "Yes"

**Purpose**: Create the ticket in Jira using the CLI after receiving explicit user approval.

### Process

1. **Confirm you have approval**
   - User said "yes" or equivalent

2. **Convert to ADF format** (if needed)
   - See: `skills/core/jira-ticket-writer/api-reference.md`
   - Jira requires ADF (JSON) format, not plain text

3. **Execute CLI command**:
   ```bash
   node scripts/atlassian-api.js jira create \
     --project "PROJ" \
     --type "Bug" \
     --summary "iOS: App crashes when deleting account" \
     --description "[ADF formatted JSON]" \
     --priority "High" \
     --labels "iOS,Account-Management" \
     --components "Mobile"
   ```

4. **Capture result**
   - Ticket key (e.g., PROJ-XXX)
   - URL (e.g., https://[your-domain].atlassian.net/browse/PROJ-XXX)

5. **Confirm to user**:
   ```
   ✅ Created [PROJ-XXX]: iOS: App crashes when deleting account
   🔗 https://[your-domain].atlassian.net/browse/PROJ-XXX

   Summary:
   - Type: Bug
   - Priority: High
   - Components: Mobile
   - Labels: iOS, Account-Management
   - Assignee: Unassigned

   Next steps:
   - Review and refine acceptance criteria
   - Link to related tickets if needed
   - Add to sprint if ready
   ```

### Error Handling

**If creation fails**:
- Check error message
- Common issues:
  - Invalid ADF format → Fix and retry
  - Missing required field → Add and retry
  - Invalid component/label → Use valid value and retry
- Show error to user and ask how to proceed

**If creation succeeds but something looks wrong**:
- Update ticket immediately
- Inform user: "Created ticket but noticed [issue]. Updated to [fix]."
