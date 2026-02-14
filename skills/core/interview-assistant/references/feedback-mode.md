---
name: feedback-mode
description: Resource file for interview-assistant agent
type: resource
---

# Feedback Creation Mode

## When to Use
- PM says "feedback", "debrief", "write up candidate", "hiring decision"
- PM provides interview transcript
- PM needs help articulating their impression

## Required Inputs

**Ask for these if not provided:**
1. **Interview transcript** - Check `.ai/local/private_transcripts/` FIRST before fetching from Granola
2. **Job listing** - What role were they interviewing for? Check the job kit for IC vs leadership.
3. **Your impressions** - I'll coach you through this (see below)
4. **Output format preference** - Bullets, paragraphs, or structured scorecard?

**Always check existing transcripts before fetching:**
```bash
ls -la .ai/local/private_transcripts/ | grep -i [candidate-name]
ls -la .ai/local/private_transcripts/ | grep -i interview
```

## Impression Development (REQUIRED before feedback)

**I will NOT generate feedback without understanding your impression first.**

I'll ask these questions one at a time:

1. **Gut check**: Overall, where do you land?
   - Strong Hire / Hire / No Hire / Strong No Hire

2. **Positives**: What stood out in a good way?
   - Specific examples, not just "seemed smart"

3. **Concerns**: What gave you pause?
   - Be honest about doubts, even small ones

4. **Role-specific performance**:
   - (For PM) How was their product sense? Prioritization? Communication?
   - (For Designer) How was their process? User empathy? Craft?
   - (For Engineer) How was their problem-solving? Technical depth? Collaboration?

5. **Team fit**: Would you want to work with them daily? Why/why not?

6. **Comparison**: How do they compare to other candidates you've seen?

7. **Risks**: What could go wrong if we hire them?

## Why This Matters

Your impression is evidence. The transcript shows what happened; your interpretation adds:
- Context that isn't captured in words
- Energy and engagement levels
- How they made you feel
- Pattern recognition from your experience

By articulating your impression clearly, we:
- Reduce bias (forcing specifics over vibes)
- Create better signal for hiring committee
- Document your reasoning for future reference

## Feedback Output

**Default format: Slack-style bullet points with simple sections**

```
**[Candidate Name] — [Role] — [Stage]**

**Recommendation: [Hire (3) / Strong Hire / No Hire / Strong No Hire]**

**What I liked**
- [Specific observation with evidence]
- [Specific observation with evidence]
- [Specific observation with evidence]

**What concerned me**
- [Specific observation with evidence]
- [Specific observation with evidence]

**Overall take**
- [1-2 bullets synthesizing the recommendation]
- [Key question or next step if applicable]
```

Keep it short. Aim for 10-15 bullets total. If it's longer, cut it.

**Alternative formats (on request):**
- Detailed writeup (paragraphs with full context)
- Structured scorecard (dimensions with ratings)
- Comparison format (vs other candidates)

## Optional: VP Perspective Analysis

If the PM wants a second opinion or stress-test, offer to "channel a seasoned VP of Product" who has hired dozens of designers, PMs, and engineers. This perspective helps surface:

- Pattern matching from hiring experience (what signals predict success?)
- Pushback on assumptions (is the concern valid or recency bias?)
- Opportunity cost framing (is this candidate good enough, or should we keep looking?)
- Red flags the PM might be rationalizing away

**When to offer this:**
- PM seems uncertain about their recommendation
- There's conflicting feedback from other interviewers
- The candidate is "fine" but nobody is excited

**How to frame it:**
"Want me to pressure-test this from a VP perspective? I can channel someone who's hired 50+ people and see where they'd agree or push back on your read."

## Evidence Standards

All feedback must be traceable:
- ✅ "When asked about prioritization, they described [specific framework]"
- ✅ "PM noted candidate seemed disengaged during technical questions"
- ❌ "Strong communicator" (too vague)
- ❌ "Would be a culture fit" (what specifically?)

## Success Criteria

**For Feedback Mode:**
- PM's impression is articulated clearly
- Feedback is specific and evidence-based
- Recommendation is justified
- Output is ready to share with hiring team
