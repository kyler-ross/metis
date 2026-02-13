# Slash Commands

Slash commands are custom prompts you can invoke directly in Claude Code by typing `/command-name`. They provide repeatable workflows for common PM, engineering, and analysis tasks.

## How to Use

In Claude Code, type `/` followed by the command name:

```
/pm-daily
/pm-jira create a ticket for the new onboarding flow
/expert-panel should we build or buy our analytics pipeline?
```

Commands that accept arguments show an `argument-hint` in their frontmatter. You can pass arguments inline after the command name.

## Included Commands (23)

### Core PM Operations
| Command | Description |
|---------|-------------|
| `/pm-ai` | Route your PM task to the appropriate specialized agent |
| `/pm-daily` | Daily sync - analyze meetings, Jira, email, and priorities |
| `/pm-coach` | Get product strategy and design guidance |
| `/pm-analyze` | Analyze metrics and create SQL queries |
| `/pm-jira` | Create and update Jira tickets |
| `/pm-weekly` | Write weekly team or manager updates |
| `/pm-document` | Update daily log, rolling context, and Jira/Confluence |
| `/pm-my-todos` | Manage personal todo list with sections, due dates, and people |
| `/pm-status` | Check PM AI system health and last update times |
| `/pm-improve` | Improve or refactor the PM AI system based on learnings |

### Research & Analysis
| Command | Description |
|---------|-------------|
| `/pm-experiment-analyze` | Deep 5-phase experiment analysis with evidence weighting |
| `/pm-feedback-insights` | Analyze customer feedback sessions and generate insights |
| `/research-to-doc` | Gather data from multiple sources and synthesize into a document |
| `/expert-panel` | Launch a multi-expert panel discussion on a product topic |

### Communication & Collaboration
| Command | Description |
|---------|-------------|
| `/pm-transcript` | Organize and structure meeting transcripts |
| `/pm-interview` | Get interview guidance or create candidate feedback |
| `/pm-slack-chats` | Triage Slack conversations and draft responses |
| `/pm-search` | Find Claude Code or Cursor sessions by description |

### Engineering & Review
| Command | Description |
|---------|-------------|
| `/eng-fullstack` | Principal engineer for debugging, architecture, and code review |
| `/pr-review` | Run a multi-dimensional PR review with parallel analysis |

### Media Processing
| Command | Description |
|---------|-------------|
| `/pdf-processor` | Convert PDFs and images to Markdown using Gemini |
| `/video-processor` | Convert videos to Markdown timelines using frame analysis |

### Help
| Command | Description |
|---------|-------------|
| `/question` | Get help, find demos, check usage stats, or get coaching |

## Creating Your Own Commands

1. Create a new `.md` file in `.claude/commands/`
2. Add YAML frontmatter with `name`, `description`, and optionally `argument-hint`
3. Write the prompt body below the frontmatter
4. Use `$ARGUMENTS` to reference user input passed after the command name

**Template:**

```markdown
---
name: my-command
description: Short description of what this command does
argument-hint: [what the user should provide]
---

Instructions for Claude when this command is invoked: $ARGUMENTS
```

**Tips:**
- Keep commands focused on a single workflow
- Reference skill files (`skills/...`) for complex multi-step workflows
- Use `allowed-tools` in frontmatter to restrict which tools the command can access
- Commands can delegate to agents or skills for more sophisticated behavior
