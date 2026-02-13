# Skills

Skills are reusable instruction sets that tell Claude Code how to perform a specific task. Each skill is a markdown file that defines a persona, methodology, and set of tools -- turning a general-purpose AI into a specialized agent for that job.

When you type `/pm-coach` in Claude Code, the system loads the product-coach skill. Claude reads the SKILL.md file, adopts the persona, loads the relevant knowledge files, and responds as that specialist. The conversation feels different from a generic prompt because the agent has deep context about how to approach that particular kind of work.

This is the core idea: instead of writing the same detailed prompt every time you need help with Jira tickets, you write a skill once, and it's available forever through a slash command.

## How Skills Work

```
You type: /pm-jira "Create a story for dark mode support"

Claude Code:
  1. Loads skills/core/jira-ticket-writer/SKILL.md
  2. Reads the persona, rules, and formatting requirements
  3. Loads referenced knowledge files (Jira components, ADF formatting)
  4. Generates a properly formatted ticket with all mandatory fields
  5. Calls the Jira CLI script to create it
```

The skill file is the instruction manual. The slash command is the trigger. The knowledge files are the reference material. The CLI scripts are the hands.

## The SKILL.md Standard

Skills follow the [SKILL.md standard](https://agentskills.io) -- an open format for portable AI agent skills. The format is simple: YAML frontmatter for metadata, markdown body for instructions.

### Anatomy of a SKILL.md File

```markdown
---
name: jira-ticket-writer
description: Create and update Jira tickets using mandatory formats. Turns vague
  problems into crisp, actionable tickets.
---

# Jira Ticket Writer

## When to Use This Skill

Invoke this skill when the user needs:
- **Ticket creation** - bugs, stories, tasks, epics
- **Ticket search** - JQL queries, finding related tickets
- **Bulk operations** - creating multiple linked tickets

## Core Identity

You are a senior PM who writes exceptionally clear Jira tickets. You state
WHAT and WHY, never HOW. Every ticket has acceptance criteria.

## Rules

- Always use the Atlassian CLI: `node scripts/atlassian-api.cjs`
- Never use MCP tools for Jira (they 404)
- Preview the ticket before creating it -- get user confirmation
- Use ADF format via --description-file for formatted descriptions

## Required Context

Before creating tickets, load:
- `knowledge/jira-components-labels.md` - Valid components and labels
- `knowledge/jira-adf-formatting.md` - ADF format reference

## Communication Style

Direct. State the ticket summary first, then details. No filler.
```

**Frontmatter fields:**
- `name` (required): The skill identifier, used for routing
- `description` (required): One-line description, displayed in skill listings

**Body sections** (conventions, not enforced):
- **When to Use**: Helps the router decide if this skill matches the user's request
- **Core Identity**: The persona the agent adopts
- **Rules**: Hard constraints and tool preferences
- **Required Context**: Knowledge files to load before responding
- **Communication Style**: Tone and formatting preferences
- **Evaluation**: What "good" looks like for this skill

### Anatomy of manifest.json

Each skill has a `references/manifest.json` file that provides structured metadata for routing and orchestration:

```json
{
  "version": "1.0",
  "routing": {
    "keywords": ["create ticket", "jira", "jql", "search jira"],
    "semantic_tags": ["ticket-creation", "jql-queries", "epic-management"],
    "confidence_threshold": 0.75
  },
  "io": {
    "input_types": ["ticket-request", "bug-report", "search-query"],
    "output_types": ["jira-ticket", "search-results", "bulk-creation-report"]
  },
  "execution": {
    "estimated_tokens": 2500,
    "mcp_tools": [],
    "can_orchestrate": false,
    "compatible_skills": ["confluence-manager"]
  },
  "quality": {
    "success_signals": ["ticket-created-with-all-fields", "user-confirmed-before-creation"],
    "failure_modes": ["missing-acceptance-criteria", "created-without-preview"]
  },
  "required_context": [
    "jira-components-labels.md",
    "jira-adf-formatting.md"
  ]
}
```

**Routing**: Keywords and tags that the router uses to match user requests to skills. The confidence threshold sets the minimum match score.

**IO**: Declares what the skill takes in and produces, useful for chaining skills in workflows.

**Execution**: Token budget estimate, external tools needed, and whether this skill can orchestrate sub-skills.

**Quality**: Defines what success and failure look like, used for self-evaluation and system improvement.

## Directory Structure

```
skills/
  _index.json              # Central registry for routing
  core/                    # Core PM skills
    product-coach/
      SKILL.md             # Main instructions
      references/
        manifest.json      # Routing and metadata
        coaching-mode.md   # Mode-specific instructions
        analysis-mode.md
        frameworks.md
    jira-ticket-writer/
      SKILL.md
      references/
        manifest.json
    daily-chief-of-staff/
      SKILL.md
      references/
        manifest.json
  experts/                 # Expert personas for panels
    serial-ceo/
      SKILL.md
      references/
        manifest.json
  specialized/             # Document processing, OCR, etc.
  workflows/               # Multi-skill orchestration
  personas/                # Customer personas for testing
  utilities/               # System maintenance skills
```

## Skill Categories

**Core** - The daily drivers. Product coaching, Jira tickets, daily briefings, status updates, SQL queries, Slack triage. These are the skills you use every day.

**Experts** - Simulated perspectives for multi-angle analysis. A Serial CEO, Principal PM, VC Investor, Growth Strategist, Design Lead, UX Psychologist, and more. Used individually or assembled into expert panels.

**Specialized** - Tools for specific file types and integrations. PDF-to-markdown conversion, video timeline extraction, OCR, prototype building, transcript organization.

**Workflows** - Multi-skill orchestration patterns. Expert panel discussions, feature design debates (advocate vs. skeptic), Jira-Confluence sync, PR review with parallel analysis.

**Personas** - Customer archetypes for testing features. Each persona has a defined understanding level, urgency, and behavioral patterns. Use them to stress-test your product decisions from different user perspectives.

**Utilities** - System maintenance. Repo sync, credential health checks, file organization, autonomous agent management.

## How Routing Works

When you type `/pm-ai "help me prioritize the Q2 roadmap"`, the router:

1. Reads `skills/_index.json`
2. Scans the `routing_index` for keyword matches ("prioritize" matches `product-coach`)
3. Checks `semantic_tags` for broader relevance
4. Loads the matched skill's SKILL.md
5. Hands off the conversation to that specialist

The `_index.json` file is the central brain. It maps keywords to skills, groups skills by category, and provides quick metadata for every skill in the system. It is generated automatically.

For direct access, skip the router: `/pm-coach`, `/pm-jira`, `/pm-analyze` each load a specific skill directly.

## Creating a New Skill

### Step 1: Create the Directory

```bash
mkdir -p skills/core/my-new-skill/references
```

Choose the category that fits: `core`, `experts`, `specialized`, `workflows`, `personas`, or `utilities`.

### Step 2: Write the SKILL.md

Start with the frontmatter:

```markdown
---
name: my-new-skill
description: One sentence explaining what this skill does and when to use it.
---
```

Then write the body. Include at minimum:
- **When to Use**: Clear trigger conditions
- **Core Identity**: Who the agent becomes
- **Rules**: Hard constraints, tool preferences, things to never do
- **Required Context**: Knowledge files to load

### Step 3: Create the manifest.json

```bash
# In skills/core/my-new-skill/references/manifest.json
```

Fill in routing keywords (what users might say), semantic tags (conceptual categories), and execution details.

### Step 4: Create a Slash Command (Optional)

If you want a direct shortcut, create a file in `.claude/commands/`:

```markdown
---
name: pm-my-skill
description: One-line description
argument-hint: [what the user provides]
---

Load the my-new-skill skill from `skills/core/my-new-skill/SKILL.md` and use it for: $ARGUMENTS
```

### Step 5: Regenerate the Index

```bash
node scripts/generate-index.cjs
```

This scans all skill directories, reads each SKILL.md and manifest.json, and rebuilds `skills/_index.json`. The router will now find your new skill.

### Step 6: Test It

```
/pm-ai "a task that should match your skill"
```

If the router picks the right skill, you are done. If not, adjust the routing keywords in your manifest.json and regenerate.

## Best Practices

**Be specific about identity.** "You are a senior PM who writes clear Jira tickets" works better than "You help with Jira." The more concrete the persona, the more consistent the behavior.

**Declare your tools.** If a skill should use a CLI script, say so explicitly. If it should avoid MCP tools, say that too. Agents will try the most convenient path, which is not always the right one.

**Load context selectively.** Every knowledge file you reference costs tokens. Load what is needed, not everything that might be relevant. A skill that loads 10 knowledge files will leave less room for the actual conversation.

**Write "when to use" carefully.** The router reads this section to decide whether a skill matches. Vague descriptions get vague routing. List concrete trigger phrases.

**Include failure modes.** Telling the agent what NOT to do is as important as telling it what to do. "Never create a ticket without showing a preview first" prevents a class of errors.

**Test with real tasks.** After writing a skill, use it 5 times with real work. The first version is never the final version. Watch for patterns where the agent misunderstands or takes wrong turns, then add rules to prevent those.

**Keep skills focused.** A skill that tries to do everything does nothing well. If your skill handles both Jira and Confluence, consider splitting it into two skills connected by a workflow.

**Version your manifests.** The `version` field in manifest.json helps track when a skill was last updated. Bump it when you make significant changes to routing or behavior.
