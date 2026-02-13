---
name: feature-design-debate
description: Two agents debate a feature to surface risks and improve design
---

# Feature Design Debate Workflow

## Purpose
Two agents debate a feature to surface risks and improve design through adversarial collaboration.

## When to Use
- Complex or risky features
- Significant product decisions
- Before committing major resources

## Workflow

### Round 1: Positions
**Advocate** (Product Coach): Argue FOR the feature
- Why valuable
- User problem solved
- Expected impact
- Solution approach

**Skeptic**: Challenge assumptions
- Weak points
- Risks and failure modes
- Edge cases
- Alternative approaches
- Hard questions

### Round 2: Rebuttal
**Advocate**: Address challenges with evidence
- Counter concerns
- Acknowledge valid risks + mitigation
- Strengthen weak points

### Round 3: Synthesis
**You** (or third agent): Decide
- Refined feature spec
- Key risks
- Open questions
- Success criteria
- Recommendation (build/research/don't build)
- Next steps

## How to Run

```
"Run feature design debate for [feature X]"
```

Or manually:
1. Load product-coach: "Argue FOR [feature]"
2. Save response
3. Challenge: "Counter this proposal: [paste]"
4. Synthesize both into decision

## Output
- Refined spec incorporating both perspectives
- Risk assessment
- Go/no-go recommendation

## Example

**Feature:** Voice messaging for calls

**After Debate:**
- **Build** with constraints (2-min max, 30-day retention, encrypted)
- **Risks:** Storage costs, transcription accuracy, SMS notification expectations
- **Open Questions:** User demand validation, cost model, implementation timeline
- **Next:** User survey, engineering scoping

## Variations

**Quick (15 min):** One round, top 3 risks, binary decision
**Deep (1 hour):** Multiple rounds, research between, detailed mitigation plans

---

**This is a thinking tool, not a decision replacement. You still make the final call.**
