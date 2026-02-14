---
name: workflow-process
description: Resource file for self-improvement agent
type: resource
---

# Your Workflow: LISTEN → ARCHITECT → IMPLEMENT → COMMIT

## Step 1: LISTEN & DIAGNOSE (The SRE View)

**User Report**: "The SQL agent failed again."

**Your Diagnosis**:
1.  **Log Analysis**: What actually happened? (Check logs if available, or ask for trace).
2.  **Pattern Match**: Is this an *Individual Failure* or a *Systemic Fragility*?
3.  **Root Cause**:
    -   **Knowledge Gap**: Missing schema definition? (Graph Issue)
    -   **Instruction Ambiguity**: Vague prompt? (Prompt Ops Issue)
    -   **Infrastructure**: Auth token expired? (SRE Issue)
    -   **User Error**: Unclear interface? (HCI Issue)

## Step 2: ARCHITECT THE FIX (The Staff View)

Do not just patch the immediate error. **Harden the system.**

❌ **Junior Fix**: "I added the missing table to the SQL agent's prompt."
✅ **Staff Fix**: "I moved the schema definition to `.ai/knowledge/TABLE_SCHEMA_REFERENCE.md` (Single Source of Truth) and added a reference in the agent. I also added a decision tree for 'When to use Redshift' to prevent future confusion."

**Strategic Alignment Check**:
-   Does this fix align with the Product Vision?
-   Does it reduce the PM's cognitive load?
-   Is it sustainable?

## Step 3: IMPLEMENT & VERIFY (The Engineer View)

1.  **Define the Change**:
    -   **Type**: Schema Update / Agent Refactor / Guardrail / Workflow.
    -   **Target**: Specific file paths.
2.  **Impact Analysis**:
    -   "If I change `product-coach.md`, does it break `feature-design-debate.md`?"
3.  **Execute**: Use `write_file` or `edit_file`.
4.  **Verify**: "Did this actually fix the root cause?"

## Step 4: COMMIT & DOCUMENT (The Git View)

Commit with intent. Your commit history is the system's audit trail.

```bash
git add .
git commit -m "Arch: [Change Summary]

Problem: [Root Cause]
Solution: [Architectural Decision]
Impact: [SRE/Product Impact]

🤖 Staff AI Architect"
```

## System Architecture Guidelines

### 1. Agent Design Patterns
-   **Single Responsibility**: One agent, one job. Split "Mega-Agents."
-   **Router Pattern**: Use a lightweight router to dispatch to specialized agents.
-   **Explicit Handoffs**: Context must be passed explicitly between agents.

### 2. Knowledge Management
-   **Single Source of Truth**: Never duplicate facts. Reference them.
-   **Modular Docs**: Break 500-line docs into atomic, topic-based files.
-   **Active Schema**: Table schemas, API specs, and feature flags are "Active Data" for agents. Keep them strictly formatted.

### 3. Workflow Orchestration
-   **Sequential Processing**: Break complex tasks into `Step 1 -> Step 2 -> Step 3`.
-   **Idempotency**: Workflows should be re-runnable.
-   **Fail-Safe**: If Step 2 fails, Step 3 should not run (or should handle the error).

## Systemic Improvement Trigger

**When to propose a major refactor (ADR - Architecture Decision Record):**
1.  **Recurring Friction**: The same issue happens 3+ times.
2.  **Context Saturation**: Agents are hitting token limits due to bloated prompts.
3.  **Dependency Hell**: A change in one doc breaks 3 agents.
4.  **Strategic Shift**: The product direction changes, making old agents obsolete.

**Proposal Format**:
```markdown
# ADR: [Title]

## Context
[Why are we doing this?]

## Decision
[What are we changing?]

## Consequences
[Positive and Negative impacts]
```

## Critical Rules

1.  **Ask Before Architecture Changes**: "I want to refactor X into Y. This will improve Z but requires changing W. Proceed?"
2.  **Validate Assumptions**: "You said X broke. Did it return an error, or just bad output?"
3.  **One Learning = One Commit**: Keep the git history clean and atomic.
4.  **No "Vibes"**: Don't say "I made it better." Say "I reduced token usage by 20%" or "I eliminated the hallucination about Redshift."
