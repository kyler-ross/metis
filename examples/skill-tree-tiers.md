# The 12-Tier Skill Tree

A progressive learning path for building an AI-augmented product management system. Each tier builds on the previous one. You can stop at any tier and have a useful system -- but each new tier multiplies the value of everything below it.

This starter kit gives you the scaffolding from Tier 5 onward. Tiers 1 through 4 are prerequisites you likely already have if you are reading this.

## Overview

| Tier | Name | Theme | You Need |
|------|------|-------|----------|
| 1 | The Basics | Mental models before touching any tool | 30 min |
| 2 | Mental Models | How software and AI systems think | 1 hour |
| 3 | First Contact | Getting Claude Code running | 30 min |
| 4 | Working with Claude | The core interaction loop | 2 hours |
| **5** | **Repo Setup** | **Structuring your project for agents** | **2 hours** |
| **6** | **Knowledge Engineering** | **Building the knowledge layer** | **3 hours** |
| **7** | **Security and Tooling** | **Credentials, safety, external connections** | **4 hours** |
| **8** | **Agent Craft** | **Scripts, hooks, and CLI tools** | **6 hours** |
| **9** | **Skills Architecture** | **Composable skills and slash commands** | **4 hours** |
| **10** | **Orchestration** | **Multi-agent coordination and routing** | **6 hours** |
| **11** | **Agents in Production** | **CI pipelines, messaging, production use** | **8 hours** |
| **12** | **The Frontier** | **Agent teams, protocol design, self-improvement** | **Ongoing** |

Bold tiers are where this starter kit provides direct scaffolding and examples.

---

## Tier 1: The Basics

**Theme**: Mental models before touching any tool.

**Skills**:
- The Terminal - Opening a terminal, navigating the filesystem, running commands
- Large Language Models - What LLMs are, how they generate text, and why they are useful for work
- Markdown - Headers, lists, tables, and code blocks as the lingua franca of agent-readable docs

**What you learn**: You understand that a terminal is how you talk to your computer directly. You understand that an LLM is a text prediction engine, not magic. You understand that markdown gives structure to text, and structure is how agents parse your intent.

**After completing this tier**: You can open a terminal, navigate folders, and write a markdown file that an LLM can parse cleanly.

**Real-world example**: You write your first CLAUDE.md file. It is just a few bullet points in markdown, but Claude Code now knows your name, your role, and your project. Its answers immediately become more relevant.

---

## Tier 2: Mental Models

**Theme**: How software and AI systems think.

**Skills**:
- Version Control - What repos are, why version control matters, commits as snapshots
- Context Windows - Token limits, why agents "forget," and why file size matters
- Data Formats - JSON and YAML as structured data, reading and writing config files
- APIs - Contracts between systems, request and response, why agents need them

**What you learn**: You understand that a git repo is a folder with a history of every change. You understand that an agent has a fixed amount of working memory (the context window) and everything you send competes for space. You understand JSON and YAML well enough to edit a config file without breaking it. You understand that APIs are how software talks to other software.

**After completing this tier**: You can read a JSON config file without anxiety. You understand why Claude Code sometimes forgets what you said 20 minutes ago. You know what it means when someone says "call the Jira API."

**Real-world example**: You realize why dumping your entire codebase into a prompt gives worse results than sending two specific files. You start being selective about what context you provide, and the quality of responses jumps noticeably.

---

## Tier 3: First Contact

**Theme**: Getting Claude Code running and having your first conversation.

**Skills**:
- What is Claude Code - A CLI agent, not a chatbot, not an IDE plugin
- Installing Claude Code - Getting it on your machine
- First Session - Starting a conversation, asking your first question
- Environment Variables - How to pass configuration to programs

**What you learn**: You understand that Claude Code is a terminal program that can read files, run commands, and edit code. You install it and run it for the first time. You learn that environment variables are how programs access secrets and configuration without hardcoding them.

**After completing this tier**: You have Claude Code running on your machine. You have had a conversation with it. You know the difference between a chatbot and an agent.

**Real-world example**: You ask Claude Code "What files are in this directory?" and it actually runs `ls` and tells you. You realize this is not autocomplete -- it is an agent that can take actions.

---

## Tier 4: Working with Claude

**Theme**: The core loop -- reading code, making edits, understanding tools.

**Skills**:
- Tool Use Model - How Claude Code decides which tools to call and when
- Reading Code with Claude - Pointing the agent at files and getting analysis
- Permission Model - What the agent can and cannot do, and how approvals work
- Making Edits - Having the agent modify files, reviewing changes

**What you learn**: You understand that Claude Code has a set of tools (read file, write file, run bash, search) and decides which to use based on your request. You learn to point it at specific files for analysis. You understand the permission model -- it asks before doing anything destructive. You learn to review edits before accepting them.

**After completing this tier**: You can use Claude Code as a working tool. You can ask it to read a file, explain what it does, and make changes. You know how to approve or reject its proposed edits.

**Real-world example**: You point Claude Code at a competitor's API documentation (a PDF converted to markdown) and ask "What are the key differences from our API?" It reads both docs and produces a comparison table. You saved 45 minutes of manual comparison.

---

## Tier 5: Repo Setup

**Theme**: Structuring your project so agents can navigate it.

**This is where the starter kit begins.**

**Skills**:
- Context and Memory - How CLAUDE.md, memory files, and conversation history work together
- CLAUDE.md Basics - Writing the instruction file that shapes every conversation
- Writing Effective Rules - The difference between suggestions and rules agents actually follow
- Project Structure - Organizing directories, naming conventions, and file placement

**What you learn**: You understand that CLAUDE.md is the most important file in your repo -- it is loaded into every conversation and shapes all agent behavior. You learn how to write rules that agents consistently follow (specific, testable, with examples) versus rules they ignore (vague, aspirational). You establish a directory structure that agents can navigate predictably.

**After completing this tier**: Your repo has a CLAUDE.md that makes every Claude Code session contextual. You have a `knowledge/` directory, a `scripts/` directory, and a `skills/` directory. The agent knows where to find things.

**Real-world example**: You write a rule in CLAUDE.md: "When asked about metrics, always read knowledge/metrics-catalog.md first." From now on, every time you ask about metrics, the agent checks your authoritative definitions instead of hallucinating. Metric discussions become trustworthy.

---

## Tier 6: Knowledge Engineering

**Theme**: Building the knowledge layer agents need to do useful work.

**Skills**:
- Knowledge Base Design - What to document, how to organize it, when to update it
- Writing Knowledge Files - Markdown files optimized for agent consumption
- Knowledge Indexing - Making files discoverable through tags and search
- File Conventions - Naming, formatting, and metadata standards

**What you learn**: You understand that a knowledge base is not documentation for humans -- it is context for agents. You learn to write files that are dense with facts and light on prose. You learn to index files with tags so agents can find what they need. You establish naming conventions that make files predictable.

**After completing this tier**: You have 5-10 knowledge files covering your product, your team, your metrics, and your processes. The agent can answer questions about your specific business instead of giving generic advice.

**Real-world example**: You create `knowledge/product-overview.md` describing your product's architecture, and `knowledge/team-members.json` listing your team with roles and responsibilities. When you ask "Who should review this API change?", the agent checks the team file and says "Alice owns the API layer, Bob is the secondary reviewer" instead of guessing.

---

## Tier 7: Security and Tooling

**Theme**: Credentials, safety patterns, and connecting to the outside world.

**Skills**:
- Credential Management - API keys in .env files, never in code, with validation
- Gitignore Strategy - What to commit and what to keep private
- Error Recovery Patterns - Detecting auth failures, auto-diagnosing problems
- MCP Servers Overview - What Model Context Protocol is and why it matters
- MCP Configuration - Setting up MCP servers for GitHub, PostHog, Figma, Slack

**What you learn**: You understand that every external connection needs an API key, and those keys must never touch your git history. You learn the two-file credential pattern (shell env for MCP, dotenv for scripts). You learn to configure MCP servers -- the protocol that lets Claude Code talk directly to GitHub, analytics tools, and design tools. You set up error recovery so auth failures get diagnosed automatically.

**After completing this tier**: Claude Code can read your GitHub repos, query your PostHog analytics, view your Figma designs, and read your Slack messages -- all through secure, credentialed connections.

**Real-world example**: You configure the PostHog MCP server. Now when you ask "What's our 7-day retention rate?", Claude Code queries PostHog directly and returns the number. No more switching to a browser, finding the right dashboard, and reading the chart yourself.

---

## Tier 8: Agent Craft

**Theme**: Building the scripts, hooks, and CLI tools agents use.

**Skills**:
- Connecting External Services - Building API wrappers for Jira, Confluence, Google Workspace
- Hooks Overview - Pre-commit and post-action hooks that enforce quality
- CLI Tool Design - Designing command-line interfaces agents can discover and use
- Writing CLI Scripts - Building Node.js scripts with argument parsing and error handling
- Reusable Libraries - Shared utilities that multiple scripts depend on

**What you learn**: You understand that agents need hands -- CLI scripts that call external APIs. You learn to write scripts that are both human-readable and agent-readable, with clear `--help` output and structured JSON responses. You learn to build reusable libraries so every script does not reinvent authentication. You learn about hooks that enforce rules automatically (like preventing commits to protected branches).

**After completing this tier**: You have CLI scripts for your most-used services. The agent can create Jira tickets, read Confluence pages, check your Google Calendar, and send Slack messages -- all through scripts you built and control.

**Real-world example**: You build `atlassian-api.cjs` and add it to your CLAUDE.md rules: "For Jira operations, always use `node scripts/atlassian-api.cjs`." Now "Create a bug ticket for the login crash" becomes a 10-second conversation instead of a 5-minute context switch to the Jira UI.

---

## Tier 9: Skills Architecture

**Theme**: Designing composable skills, slash commands, and the skill registry.

**Skills**:
- Slash Command Authoring - Creating `.claude/commands/` files that trigger specific behaviors
- Slash Command Patterns - Patterns for routing, argument passing, and skill loading
- SKILL.md Standard - The open format for portable agent skills
- Skill Anatomy - Sections, modes, personas, and quality criteria
- Skill Registry - The central index that maps keywords to skills

**What you learn**: You understand that a skill is a reusable instruction set with a persona, rules, and tool preferences. You learn the SKILL.md format -- YAML frontmatter for metadata, markdown body for instructions. You learn to write slash commands that load specific skills. You build a skill registry that routes user requests to the right specialist.

**After completing this tier**: You have 10-15 skills covering your core PM workflows. Each has a slash command. You type `/pm-jira` and Claude becomes a Jira specialist. You type `/pm-coach` and it becomes a product strategy advisor. The system feels intentional, not ad-hoc.

**Real-world example**: You create a `product-coach` skill with modes for coaching, copy review, and analysis. When you say "/pm-coach Help me think through the pricing model", the agent loads product principles, metrics definitions, and competitive data -- then engages in a structured coaching conversation instead of a generic brainstorm.

---

## Tier 10: Orchestration

**Theme**: Multi-agent coordination, routing, and building custom MCP servers.

**Skills**:
- Expert Personas - Designing detailed simulated perspectives with backstories and frameworks
- Semantic Routing - Matching user intent to skills using keywords and tags
- Multi-Agent Orchestration - Running parallel agents that synthesize into a single answer
- System Observability - Tracking what skills are used, where they fail, and what to improve
- Building MCP Servers - Creating your own Model Context Protocol servers for custom data

**What you learn**: You understand how to design expert personas that give genuinely different perspectives (not just "here's another angle"). You learn semantic routing -- how user intent maps to skills through keyword matching and confidence thresholds. You learn to orchestrate multiple agents in parallel, where Claude Code spawns sub-agents that each investigate a different dimension and synthesize into a single recommendation.

**After completing this tier**: You can run expert panels with 3-5 perspectives analyzing a decision simultaneously. The router automatically picks the right skill for any request. You can see which skills are used most and which are failing.

**Real-world example**: You are deciding whether to build a referral program. You run `/expert-panel "Should we invest in a referral program for Q2?"` and get simultaneous analysis from a growth strategist (market sizing), a VC investor (competitive moat), an engineering lead (6-week estimate), and a UX psychologist (motivation mechanics). The synthesis: "Build it, but start with a private beta -- the viral coefficient needs 1.3x to justify the full investment."

---

## Tier 11: Agents in Production

**Theme**: Agents that ship to real users -- in CI, messaging apps, and production codebases.

**Skills**:
- Headless CI Pipelines - Running Claude Code in GitHub Actions without human interaction
- Agent Eval and Observability - Testing agent behavior, measuring quality, catching regressions
- Prototyping with Production - Using agents to build and ship real features, not just analysis
- Messaging-Native Agents - Agents that live in Slack, email, or other communication channels
- Vibe Coding at Scale - Managing multiple agents working on different parts of a codebase

**What you learn**: You understand how to run Claude Code headless -- no terminal, no human approval, just a prompt and a set of tools running on a schedule. You learn to evaluate agent output programmatically (did it create a valid Jira ticket? does the generated SQL run?). You learn to build agents that respond to Slack messages or email triggers. You learn to coordinate multiple agent sessions working on different features simultaneously.

**After completing this tier**: Your system runs autonomously. A nightly job audits your knowledge base for staleness and creates PRs to fix it. A daily job generates a morning briefing and posts it to Slack. A webhook triggers experiment analysis when a PostHog feature flag concludes.

**Real-world example**: You set up a GitHub Actions workflow that runs every night at 2 AM. It launches Claude Code with the pm-librarian skill, which checks for stale knowledge files, outdated skill indexes, and broken script references. If it finds problems, it creates a PR with fixes. You wake up to a clean PR ready for review.

---

## Tier 12: The Frontier

**Theme**: The cutting edge -- agent teams, protocol design, full-stack agent apps, and self-improving systems.

**Skills**:
- Agent Teams Coordination - Multiple agents with different specializations working on the same problem
- Agent Protocol Design - Designing communication formats between agents
- Full-Stack Agent Apps - Native apps (desktop, mobile) that serve as the primary agent interface
- Self-Hosting Agent Infrastructure - Running your own agent infrastructure instead of relying on hosted services
- Self-Improving Systems - Agents that identify their own weaknesses and fix them

**What you learn**: You understand how to design teams of agents where each has a role -- one researches, one writes, one reviews -- and they coordinate through structured protocols. You learn to build native applications (SwiftUI, Electron) that provide a richer interface than the terminal. You explore self-hosting models for environments where data cannot leave your network. You learn to build feedback loops where the system identifies its own failures and proposes improvements.

**After completing this tier**: This tier has no "after." It is the frontier -- the boundary of what is possible with current technology. You are contributing new patterns, not following established ones.

**Real-world example**: You build a macOS app that serves as the command center for your PM AI system. It shows your active sessions, lets you browse your knowledge base, manages your todo list, and launches agent conversations with a click. The system suggests its own improvements: "I noticed you correct my metrics calculations 40% of the time. I should load the metrics catalog by default for any quantitative question." You approve the change, and the system updates its own rules.

---

## Where You Are, Where You Could Be

If you are reading this starter kit, you are probably somewhere between Tier 3 and Tier 6. You have used Claude Code. You might have a CLAUDE.md. You are curious about what more is possible.

This starter kit gives you the architecture for Tiers 5 through 9:

- **Tier 5**: The CLAUDE.md file and directory structure are set up for you
- **Tier 6**: The `knowledge/` directory with templates and conventions is ready
- **Tier 7**: The credential management patterns and .env templates are included
- **Tier 8**: The `scripts/` directory with library utilities and script templates is provided
- **Tier 9**: The `skills/` directory with category structure, SKILL.md examples, and index generation is built

Tiers 10 through 12 require the foundation to be solid. You cannot orchestrate skills that do not exist. You cannot run headless pipelines without reliable scripts. You cannot build self-improving systems without a knowledge base worth improving.

Start where you are. Build what you need today. The system grows with you.

## Suggested First Steps

**If you are at Tier 4** (you use Claude Code but have no project structure):
1. Copy this starter kit into your project
2. Customize the CLAUDE.md with your product and team context
3. Add 3 knowledge files: product overview, team members, metrics definitions
4. Use it for a week and notice what you keep asking for

**If you are at Tier 6** (you have knowledge files and structure):
1. Set up one external integration (Jira or Google Calendar)
2. Write your first skill (start with the one you would use most -- probably Jira or daily briefing)
3. Create a slash command for it
4. Use it for real work, not experiments

**If you are at Tier 8** (you have scripts and integrations):
1. Build 5 core skills covering your daily workflows
2. Set up the skill registry and semantic routing
3. Create an expert persona for a perspective you frequently need
4. Start a daily briefing habit

**If you are at Tier 10** (you have orchestration and routing):
1. Set up your first headless pipeline (nightly knowledge audit)
2. Build an expert panel for your most common strategic question
3. Start tracking skill usage to find gaps
4. Consider building a custom interface (desktop app or web dashboard)

The best system is the one you actually use. Start small. Ship early. Iterate forever.
