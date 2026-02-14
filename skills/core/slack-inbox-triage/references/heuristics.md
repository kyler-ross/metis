---
name: heuristics
description: Response-needed signals and urgency classification for slack-inbox-triage
type: resource
---

# Response Heuristics

## Signals that response IS owed

| Signal | Weight |
|--------|--------|
| Direct question (ends with ?, interrogative phrasing) | High |
| Explicit request ("can you", "could you", "please review") | High |
| User is mentioned by @name | High |
| Message addressed to user by name | Medium |
| Last message is not from user | Medium |
| Follow-up after user acknowledged but didn't answer | Medium |
| Multiple messages from same person without user reply | Medium |

## Signals that response is NOT owed

| Signal | Weight |
|--------|--------|
| User already replied later in thread | Definitive |
| User reacted with acknowledgment emoji | Strong |
| Pure FYI/informational message | Strong |
| Broadcast announcement | Strong |
| Auto-generated bot message | Definitive |
| Message is a link share with no question | Medium |

## Acknowledgment Reactions (treat as "handled")

- Checkmarks: white_check_mark, heavy_check_mark, ballot_box_with_check
- Eyes: eyes
- Thumbs: +1, thumbsup
- Other: ok_hand, saluting_face

---

# Urgency Classification

## High Urgency
- Direct question from leadership (CEO, CTO, VP)
- Blocking someone's work
- Time-sensitive request (deadline mentioned)
- Multiple follow-ups from same person
- Been waiting > 24h for response

## Medium Urgency
- Direct question from peer
- Code review request
- Meeting follow-up
- Standard async request

## Low Urgency
- FYI that might benefit from acknowledgment
- Optional feedback request
- General discussion participation
- Social/casual conversation

---

# Tone Calibration

When drafting responses, match the user's typical Slack style:
- **Abhijay**: Concise, technical, direct. No fluff.
- Avoid corporate speak
- Use appropriate emoji sparingly (if user does)
- Match formality level to the conversation
