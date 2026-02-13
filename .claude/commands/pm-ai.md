---
name: pm-ai
description: Route your PM task to the appropriate specialized agent
allowed-tools: github, jira, posthog, figma
argument-hint: [PM task or question]
---

Load the PM Router agent from `.claude/agents/pm-router.md` and use it to intelligently route this PM task to the appropriate specialized agent: $ARGUMENTS
