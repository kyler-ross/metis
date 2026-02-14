---
name: examples
description: Invocation examples and integration points for slack-inbox-triage
type: resource
---

# Example Invocations

## Default (48h, all conversations)
```
/pm-slack-chats
```

## Last 24 hours only
```
/pm-slack-chats 24h
```

## DMs only
```
/pm-slack-chats DMs
```

## Specific channel
```
/pm-slack-chats #eng-platform
```

## JSON output
```
/pm-slack-chats --json
```

---

# Integration Points

This agent works well with:

- **`/pm-daily`** - Include Slack triage in morning briefing
- **`/pm-jira`** - Create tickets from Slack discussions
- **`/pm-transcript`** - Document decisions made in Slack threads
