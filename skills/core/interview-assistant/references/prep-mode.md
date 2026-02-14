---
name: prep-mode
description: Resource file for interview-assistant agent
type: resource
---

# Interview Prep & Guidance Mode

## When to Use
- PM says "prep for interview", "interview questions", "what should I ask"
- PM provides a job listing URL or description
- PM provides a candidate resume
- PM needs help during a live interview

## Required Inputs

**Ask for these if not provided:**
1. **Job listing** - URL (I'll fetch via browser) or pasted text
2. **Resume** - File path or pasted content
3. **Interview stage** - Phone screen, technical, culture fit, final round?
4. **Your focus areas** - What does PM want to evaluate?

## What You Provide

### Role-Specific Question Banks

**For Product Managers:**
- Product sense: "Walk me through a product you've shipped. What trade-offs did you make?"
- Prioritization: "You have 3 high-priority requests from different stakeholders. How do you decide?"
- Customer empathy: "Tell me about a time you advocated for a user need that wasn't obvious."
- Technical fluency: "How do you work with engineering when requirements change mid-sprint?"
- Metrics: "How do you know if a feature is successful?"

**For Product Designers:**
- Process: "Walk me through your design process for a recent project."
- User research: "How do you validate designs before engineering starts?"
- Constraints: "Tell me about designing within significant technical constraints."
- Critique: "How do you handle design feedback you disagree with?"
- Systems thinking: "How do you balance consistency with innovation?"

**For Software Engineers:**
- Problem-solving: "Describe a technically challenging problem you solved."
- Collaboration: "How do you handle disagreements about technical approach?"
- Code quality: "How do you balance shipping fast with code quality?"
- Learning: "Tell me about a technology you taught yourself recently."
- Debugging: "Walk me through how you approach a production issue."

### Areas to Probe

Based on resume and job requirements, I'll identify:
- **Gaps** - Missing experience the role requires
- **Red flags** - Short tenures, vague descriptions, claims without evidence
- **Dig-deeper zones** - Impressive claims that need validation
- **Culture fit signals** - Alignment with Cloaked values

## Live Interview Coaching

During the interview, if PM asks for help:
- Suggest follow-up questions based on candidate responses
- Flag when candidate is being vague (ask for specifics)
- Note when to move on (dead end or sufficient data)
- Remind PM of remaining evaluation areas

## Interview Types by Stage

| Stage | Focus | Time |
|-------|-------|------|
| Phone Screen | Basic fit, communication, interest | 30 min |
| Technical/Craft | Role-specific skills | 45-60 min |
| Culture/Values | Team fit, Cloaked alignment | 30-45 min |
| Final Round | Senior leadership, edge cases | 45-60 min |

## Using Browser for Job Listings

When PM provides a URL:
1. Navigate to the URL
2. Snapshot the page
3. Extract role requirements, responsibilities, qualifications
4. Use this to tailor questions and evaluation criteria

## Success Criteria

**For Prep Mode:**
- PM has targeted, role-specific questions
- PM knows what to probe based on resume
- PM feels prepared and confident
