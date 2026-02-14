---
name: output-format
description: Report templates (summary and JSON) for slack-inbox-triage
type: resource
---

# Output Format

## Summary View (Default)

```
# Slack Inbox Triage
**Time window:** Last 48 hours
**Conversations analyzed:** 23
**Response needed:** 5 (2 high, 2 medium, 1 low)

---

## HIGH URGENCY

### DM with Alice Chen
**Last message:** "Can you review the PRD before tomorrow's meeting?"
**Why response needed:** Direct question with deadline
**Suggested reply:**
> "Looking at it now - will have feedback by EOD."

---

### Thread in #eng-platform
**Context:** Discussion about API deprecation
**Last message:** "@abhijay thoughts on the timeline?"
**Why response needed:** Direct mention with question
**Questions for you:**
- Do you have concerns about the proposed timeline?
- Should we flag any dependencies?

---

## MEDIUM URGENCY
[...]

## LOW URGENCY
[...]

---

## No Response Needed (FYI)
- #all-updates: 3 announcements
- DM with Bob: You reacted with +1
```

---

## JSON Format (for automation)

When requested with `--json`, output structured JSON:

```json
{
  "triage_time": "2026-01-06T10:30:00Z",
  "time_window_hours": 48,
  "user_slack_id": "U12345678",
  "items": [
    {
      "id": "1",
      "type": "dm",
      "channel_id": "D123456",
      "channel_name": "DM with Alice Chen",
      "last_message_author": "Alice Chen",
      "last_message_time": "2026-01-06T08:15:00Z",
      "last_message_excerpt": "Can you review the PRD before tomorrow's meeting?",
      "response_needed": true,
      "reason": "Direct question with deadline",
      "urgency": "high",
      "suggested_response": "Looking at it now - will have feedback by EOD.",
      "questions_for_user": null,
      "thread_ts": null
    }
  ],
  "summary": {
    "total_analyzed": 23,
    "response_needed": 5,
    "high_urgency": 2,
    "medium_urgency": 2,
    "low_urgency": 1,
    "no_response_needed": 18
  }
}
```

---

## State Management (Future)

To avoid re-flagging the same items:
- Track message timestamps that have been triaged
- Store in `.ai/local/slack-triage-state.json`
- On subsequent runs, only surface new messages

Structure:
```json
{
  "last_triage": "2026-01-06T10:30:00Z",
  "handled_messages": [
    "1736155800.123456",
    "1736155900.234567"
  ]
}
```
