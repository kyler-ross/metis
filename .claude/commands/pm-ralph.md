---
description: "Manage Ralph autonomous AI agent sessions - setup, prompts, and monitoring"
---

# Ralph Session Manager

Load the Ralph manager agent: `skills/utilities/ralph-manager/SKILL.md`

## What You Can Do

**Setup & Configuration:**
- Install via: `node .ai/scripts/installers/ralph-installer.cjs setup`
- Or via setup wizard: `/pm-setup` (includes Ralph phase)
- Check status: `node .ai/scripts/installers/ralph-installer.cjs status`

**Prompt Creation:**
- Write effective PROMPT.md files
- Define clear completion criteria
- Choose appropriate limits
- Templates available in `tasks/templates/`

**Session Management:**
- Start Ralph sessions: `ralph` or `ralph --dry-run`
- Monitor progress and costs
- Troubleshoot stuck loops

## User Request
$ARGUMENTS

## Instructions

1. Read the Ralph manager agent for complete guidance
2. Identify what the user needs (setup, prompt creation, monitoring, troubleshooting)
3. For setup: Use the installer script, NOT manual installation
4. For prompts: Write structured PROMPT.md with objective criteria
5. For monitoring: Check metrics, costs, iteration status
6. For troubleshooting: Diagnose issues, suggest fixes

Always remind users about cost limits - Opus 4.5 is expensive (~$15/M output tokens)!
