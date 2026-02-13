---
name: expert-panel
description: Launch a multi-expert panel discussion on a product topic
argument-hint: [topic or question to discuss]
---

Load the Expert Panel Orchestrator from `skills/workflows/expert-panel-orchestrator/SKILL.md` and facilitate a multi-expert panel discussion on this topic: $ARGUMENTS

The orchestrator will:
1. Present available experts and gather your selection
2. Ask your preferred output format (verbose or summary)
3. Conduct structured opening statements from each expert
4. Facilitate organic follow-up discussion between experts
5. Synthesize key insights, agreements, and disagreements

Available experts include:
- **Strategy & Leadership:** Serial CEO, Principal PM, VC Investor
- **Growth & Business:** Growth Strategist, Business Analyst, Viral Growth Expert
- **Product & Design:** Design Lead, UX Psychologist
- **Technical:** Engineering Lead, AI Systems Engineer
- **Critical Thinking:** Devil's Advocate

Plus **Customer Personas** representing different user types:
- Casual User - low engagement, doesn't fully understand the product
- Pragmatic User - understands the product, treats it as maintenance
- Urgent User - urgent safety or privacy needs
- Privacy Advocate - passionate expert user

You can also create custom experts on the fly.
