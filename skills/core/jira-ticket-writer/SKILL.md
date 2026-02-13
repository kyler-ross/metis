---
name: jira-ticket-writer
description: Create and update Jira tickets using mandatory formats. Turns vague problems into crisp, actionable tickets. States WHAT and WHY, never HOW. Use for bug reports, feature requests, tasks, epics, and bulk ticket operations.
---

# Jira Ticket Writer

## When to Use This Skill

Invoke this skill when the user needs:
- **Create tickets** - Bugs, features, tasks, improvements
- **Update tickets** - Modify existing tickets
- **Epic management** - Create and organize epics
- **Bulk operations** - Multiple tickets at once
- **Confluence linking** - Link tickets to PRDs

## Core Principle

**STATE WHAT AND WHY. NEVER HOW.**

Tickets are asks, not implementation specs. Engineers solution. You provide context, not instructions.

## Mandatory Workflow

**Knowledge Check -> Interrogate -> Format -> Validate -> Preview -> Confirm -> Create**

**DO NOT SKIP STEPS.** Every ticket creation MUST follow this flow.

## Resource Selection

Load the appropriate reference based on the task:

| Resource | When to Use | Load |
|----------|-------------|------|
| **Ticket Templates** | Creating new tickets (bug, feature, task) | `references/ticket-templates.md` |
| **Workflow Steps** | Full workflow guidance or uncertainty | `references/workflow-steps.md` |
| **API Reference** | CLI commands, ADF formatting, field mappings | `references/api-reference.md` |
| **Common Workflows** | Epics, bulk ops, Confluence linking | `references/common-workflows.md` |

## Quick Start

1. **Check product knowledge first**:
   - `knowledge/product-features.md` - Expected behavior
   - `knowledge/product-overview.md` - Context

2. **Ask if information is vague**:
   - Which bug? What platform? What behavior?
   - Never guess or fill blanks with assumptions

3. **Format using templates**:
   - Load `references/ticket-templates.md`
   - Follow mandatory structure exactly

4. **Preview and get approval**:
   - Show full ticket content
   - Wait for explicit "yes"
   - Never create without approval

5. **Execute via CLI** (NEVER MCP):
   ```bash
   node scripts/atlassian-api.cjs create-issue \
     --project "PROJ" --type "Bug" \
     --summary "Title" --description "ADF JSON"
   ```

## What to Include

**DO Include:**
- Business/user impact
- Constraints (time, compatibility, compliance)
- Edge cases to consider
- Success metrics
- Dependencies
- Who is affected

**NEVER Include:**
- File paths or line numbers
- Code snippets or function names
- Implementation steps
- Technology choices ("use Redux")
- Architecture decisions
- HOW to build it

**Exception:** Can mention constraints like "Must work offline", "< 200ms response"

## When Given Vague Input

**STOP. Interrogate first.**

```
I need more details before creating this ticket:

1. [Specific question about the problem/goal]
2. [Specific question about who's affected]
3. [Specific question about expected behavior]
4. [Specific question about evidence/context]

Once you answer these, I'll format and validate the ticket for your approval.
```

## Jira Configuration

- **Cloud ID**: `[your-cloud-id]`
- **Project**: `PROJ` (ID: XXXXX)
- **CLI**: `node scripts/atlassian-api.cjs`

## Voice

Direct. No fluff. Bottom line first. Sound human.

**Never use:** "delve," "robust," "seamless," "leverage," "streamline," "furthermore"

## Quality Checklist

Before creating any ticket:

- [ ] All mandatory fields filled
- [ ] No vague language or TBD placeholders
- [ ] Uses knowledge base for expected behavior
- [ ] States WHAT and WHY, not HOW
- [ ] Checked against templates
- [ ] User saw full preview
- [ ] User explicitly approved
- [ ] Using CLI (atlassian-api.cjs), not MCP

## Verification

**NEVER report a ticket ID without verification.**

Expected output:
```
Created: PROJ-XXX
   URL: https://[your-domain].atlassian.net/browse/PROJ-XXX
   Verified: Ticket exists
```

If verification fails, do NOT report success. Retry or escalate.

## Required Context

Before asking user about expected behavior, check:
- `knowledge/product-features.md`
- `knowledge/product-overview.md`
- `knowledge/jira-components-labels.md`
- `knowledge/jira-adf-formatting.md`
