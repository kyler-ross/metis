# What a Mature PM AI System Looks Like

This document describes what happens after months of building and iterating on a PM AI system. Not as a requirements doc or a specification, but as a picture of where you are heading. Every capability described here was built incrementally -- a few skills one week, a new integration the next, a workflow that emerged from a repeated pattern.

The system described below is real. It runs in production today, handling actual PM work at a Series A startup. It started as a CLAUDE.md file and a handful of scripts. It grew into something that fundamentally changed how product work gets done.

## The Scale

- **54 skills** across 6 categories (core, experts, specialized, workflows, personas, utilities)
- **14 slash commands** for direct access to common tasks
- **13 expert personas** that can be assembled into panels
- **130+ CLI scripts** connecting to every tool in the PM stack
- **60+ knowledge files** providing product context, metrics definitions, team info, and institutional memory
- **4 customer personas** for testing product decisions from different user perspectives
- **Automated daily briefings** that run without prompting
- **Context enrichment** that learns from every meeting transcript

None of this was built in a week. Here is what each layer enables.

## Daily Operations

Every morning, the system can run a daily briefing that pulls from:

- Your calendar (what meetings are today, what prep is needed)
- Jira (what tickets changed overnight, what's blocked, what's overdue)
- Slack (unread messages that need your attention, threads awaiting your response)
- Email (important threads, action items)
- Meeting transcripts (decisions from yesterday that need follow-up)

The agent reads all of this, synthesizes it into priorities, and presents: "Here are your 3 most important things today. Here is what is blocked. Here is what can wait."

This is not a dashboard you check. It is a conversation. You can push back: "Move the API review to tomorrow, I need to focus on the board deck." The system adjusts.

**What enables this**: The `daily-chief-of-staff` skill, Google Calendar/Gmail/Sheets scripts, Slack and Jira CLI tools, and knowledge files about your team structure and priorities.

## Product Strategy

When you are weighing a product decision -- "Should we build feature X?" -- you can get structured analysis from multiple perspectives simultaneously:

- A **Serial CEO** who has seen three companies through exits evaluates the strategic timing
- A **Growth Strategist** models the acquisition and retention impact
- A **VC Investor** pressure-tests the market size and competitive moat
- A **Devil's Advocate** finds the strongest counterarguments
- A **UX Psychologist** assesses the behavioral implications
- An **Engineering Lead** estimates the technical complexity and debt

These are not generic advice generators. Each expert persona has a detailed backstory, thinking style, and set of frameworks. The serial CEO draws on pattern-matched experiences from three specific companies. The growth strategist uses specific mental models from product-led growth playbooks.

You can run these as a full expert panel -- all perspectives at once -- or call on individual experts as needed. The synthesis step identifies where experts agree (high confidence) and where they disagree (needs more investigation).

**What enables this**: 13 expert persona skills, the expert-panel-orchestrator workflow, and Claude Code's parallel subagent execution (all experts run simultaneously, not one at a time).

## Ticket Writing

After a strategy session, turning decisions into Jira tickets is a single conversation:

"Create the stories for the dark mode epic we discussed."

The system knows your Jira project, your component taxonomy, your label conventions, and your team's definition of a good acceptance criterion. It generates tickets in your team's format, previews them for your approval, and creates them with proper ADF formatting. No copy-pasting between tools. No forgetting to set the component field.

If you need linked Confluence documentation -- a technical spec, a design brief -- the Jira-Confluence sync workflow creates both the ticket and the page, linked bidirectionally, in a single conversation.

**What enables this**: The `jira-ticket-writer` skill, `confluence-manager` skill, `jira-confluence-sync` workflow, ADF formatting knowledge, and component/label reference files.

## Meeting Synthesis

After a customer call or a team standup, transcripts flow into the system automatically. A transcript organizer extracts:

- Decisions made (with who decided and rationale)
- Action items (with owners and deadlines)
- Open questions (flagged for follow-up)
- Sentiment signals (frustration, excitement, confusion)

Over time, a context enrichment pipeline processes these transcripts and updates:

- Your personal profile (values, work style, communication preferences)
- A company profile (strategy shifts, key decisions, organizational changes)
- Relationship maps (who works on what, reporting structures, influence patterns)

This means when you ask "What did we decide about pricing in last week's exec meeting?", the system does not search -- it already knows, because it processed the transcript the day it happened.

**What enables this**: The `transcript-organizer` and `granola-transcript-agent` skills, the context enrichment pipeline, and the meeting transcript knowledge base.

## Customer Feedback Loops

Research insights from Dovetail, user interviews, and support tickets feed into the system. When you are designing a new feature, you can ask:

"What have our users said about onboarding in the last 3 months?"

The system searches across Dovetail research notes, meeting transcripts, and any locally stored interview data to build a synthesis. Not a list of quotes -- a structured analysis: "7 users mentioned confusion at the account setup step. 4 specifically mentioned not understanding the difference between feature A and feature B. The friction is in comprehension, not flow."

**What enables this**: The `dovetail-manager` skill, transcript search, and the knowledge base containing product context that helps the agent interpret feedback in context.

## Experiment Tracking

When your team runs A/B tests, each experiment gets a deep analysis file that tracks:

- The hypothesis and test design
- Code evidence (what was actually shipped, traced through the codebase)
- Funnel analysis (where in the user journey the experiment sits)
- Results and statistical significance
- Root cause analysis (why did it win or lose?)
- Recommendations for next steps
- Cross-references to related experiments

After 30+ experiments, patterns emerge. The system maintains a learnings index: "Free trials with usage gates convert 2.4x better than time-limited trials." When you design a new experiment, it checks for similar past experiments and surfaces relevant learnings before you start.

**What enables this**: The experiment analysis skill, experiment knowledge base with structured JSON files, PostHog integration for analytics data, and the experiment index for cross-referencing.

## Weekly Communication

Status updates, weekly reports, and stakeholder communication follow templates that match your voice. The system pulls from the week's transcripts, Jira progress, and shipped work to draft updates. You edit, approve, and send -- but you do not start from a blank page.

Board deck preparation works the same way: the system drafts slides from your metrics data, recent wins, and known risks. It knows what your investors care about because it has read every previous board deck and investor meeting transcript.

**What enables this**: The `weekly-update-writer` and `investor-relations` skills, Google Slides and Sheets scripts, metrics knowledge files, and historical context from past communications.

## Self-Improvement

The system audits itself. A librarian skill checks for:

- Stale knowledge files that have not been updated in over 30 days
- Duplicate or conflicting information across files
- Skills that are defined but never used (dead code)
- Index files that are out of sync with actual skill directories
- Scripts that reference deprecated APIs

When you ask the system to improve itself -- "You kept getting confused about our pricing tiers" -- the self-improvement skill identifies the knowledge gap, proposes a fix (usually a new or updated knowledge file), and creates a PR for your review.

**What enables this**: The `self-improvement` and `pm-librarian` utility skills, the knowledge index, and git integration for creating branches and PRs.

## Testing Product Decisions

Before shipping a feature, you can test it against customer personas:

- **The Casual User** who does not really understand the product and finds it boring
- **The Pragmatic User** who understands the problem but treats it like insurance
- **The Power User** who is deeply knowledgeable and uses every feature
- **The Urgent User** who has a time-sensitive problem and desperately needs help right now

Each persona responds in character. The casual user says "I don't get what this toggle does." The urgent user says "I need this to work RIGHT NOW, this is time-sensitive." This surfaces UX problems that your team -- who deeply understands the product -- would miss because of the curse of knowledge.

**What enables this**: 4 customer persona skills with detailed behavioral profiles, understanding levels, and emotional states.

## Headless Agents

Some work happens without you. Scheduled jobs run on CI pipelines:

- Nightly audits of the knowledge base for staleness
- Daily report generation and Slack delivery
- Periodic sync of Confluence pages to local cache
- Experiment status checks and alert generation

These are Claude Code sessions running in headless mode (`claude -p`) with specific prompts and MCP configurations. They output to Slack, update files, and create PRs -- all without a human in the loop.

**What enables this**: GitHub Actions workflows, headless Claude Code execution, the scheduler system, and MCP server configuration for CI environments.

## The Compound Effect

No single capability here is transformative on its own. A Jira integration saves 5 minutes per ticket. A daily briefing saves 15 minutes of context-gathering. An expert panel saves an hour of soliciting opinions.

The transformation comes from the compound effect. When all of these work together:

- You think in conversations, not in tools
- Decisions get documented as they happen, not after the fact
- Institutional knowledge accumulates automatically
- Communication stays consistent without manual effort
- Analysis gets deeper because you have more time to think

The system becomes a second brain that handles the operational overhead of product management, freeing you to do the work that actually requires human judgment: talking to customers, making trade-offs under uncertainty, building relationships with your team.

## How Long Does It Take

Honest timelines from one person's experience:

**Week 1**: CLAUDE.md, basic knowledge files, first slash commands. You start asking Claude for help and it gives contextual answers instead of generic ones.

**Month 1**: 5-10 skills, Google and Jira integrations working, daily briefings functional. The system handles routine tasks and you stop opening Jira directly for simple operations.

**Month 3**: 20+ skills, expert panels, experiment tracking, transcript processing. The system has enough context to give genuinely insightful analysis, not just formatted answers.

**Month 6**: 50+ skills, automated pipelines, self-improvement loops, headless agents. The system maintains itself and catches its own errors. You spend more time on strategy and less time on operations.

This is not a product you install. It is a system you grow. The starter kit gives you the architecture and patterns. What you build inside it depends on what your work actually needs.
