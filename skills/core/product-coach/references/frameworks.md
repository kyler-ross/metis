---
name: frameworks
description: Resource file for product-coach agent
type: resource
---

# Strategic Frameworks - Product Coach

This resource provides a comprehensive reference of strategic frameworks for product leadership.

## When to Use This Resource

Load this when:
- User asks "What frameworks should I use?"
- User needs structured decision-making tools
- User wants to evaluate features/roadmap systematically
- User is stuck and needs mental models to unstick thinking

## Product Strategy Frameworks

### RICE Prioritization
**Use for**: Feature/initiative prioritization with limited resources

**Formula**: Score = (Reach × Impact × Confidence) / Effort

- **Reach**: How many users/customers affected in a given period
- **Impact**: How much it improves their experience (3=massive, 2=high, 1=medium, 0.5=low, 0.25=minimal)
- **Confidence**: How sure you are about Reach/Impact estimates (100%=high, 80%=medium, 50%=low)
- **Effort**: Person-months required

**Example**:
```
Feature A: (5000 users × 2 impact × 80% confidence) / 3 person-months = 2,667
Feature B: (500 users × 3 impact × 50% confidence) / 1 person-month = 750
→ Prioritize Feature A
```

### Jobs-to-be-Done (JTBD)
**Use for**: Multi-market feature discovery and customer understanding

**Framework**: "When [situation], I want to [motivation], so I can [outcome]"

**Example for Cloaked**:
- **B2C**: "When signing up for a new service, I want to hide my real email, so I can avoid spam and protect my identity"
- **B2B**: "When onboarding employees, I want to provision secure identities, so I can reduce data breach risk"
- **B2G**: "When processing citizen data, I want to ensure compliance, so I can meet FedRAMP requirements"

**Key insight**: Same product, different jobs across markets

### North Star Metric
**Use for**: Aligning team around one key success measure

**Criteria**:
1. Captures core product value delivered
2. Measurable and trackable
3. Leading indicator (predicts revenue/growth)
4. Actionable by product team
5. Understandable by everyone

**For Cloaked (B2C)**: "Active identities used per month"
- Not just users, but actual identity usage
- Indicates value delivery (they're protecting privacy actively)
- Leading indicator of retention and word-of-mouth

**Cascade down**:
- North Star: Active identities used/month
  - Input metrics: New user activation rate, feature adoption
  - Health metrics: Retention rate, NPS, support tickets

### Opportunity Solution Trees
**Use for**: Problem decomposition and solution exploration

**Structure**:
```
[Outcome/Goal]
  ├─ [Opportunity 1]
  │   ├─ [Solution 1a]
  │   ├─ [Solution 1b]
  │   └─ [Solution 1c]
  ├─ [Opportunity 2]
  │   ├─ [Solution 2a]
  │   └─ [Solution 2b]
  └─ [Opportunity 3]
```

**Example**:
```
Increase B2B adoption
  ├─ Reduce enterprise buyer friction
  │   ├─ Add SSO integration
  │   ├─ Create admin dashboard
  │   └─ Offer white-label option
  ├─ Prove ROI to decision-makers
  │   ├─ Build reporting/analytics
  │   └─ Create case studies
  └─ Lower implementation barriers
```

### Product-Market Fit Framework (Multi-Segment)
**Use for**: Assessing fit across B2C, B2B, B2G markets

**Assessment**:
1. **Value Hypothesis**: Do users/customers want this?
2. **Growth Hypothesis**: Can we acquire them efficiently?
3. **Monetization Hypothesis**: Will they pay enough?

**Multi-segment adaptation**:
```
       B2C          B2B              B2G
Value: Privacy     Breach prevention Compliance
Growth: Viral      Sales-led         RFP/Procurement
Monetization: $5-15/mo  $10-50/user/mo   $100K+ contracts
```

**PMF signals by segment**:
- **B2C**: 40%+ would be "very disappointed" if product went away (Sean Ellis test)
- **B2B**: 60%+ renewal rate, <90 day sales cycle, word-of-mouth referrals
- **B2G**: Repeat contracts, reference customers, compliance certifications

### Outcome-First Onboarding
**Use for**: Designing activation flows that deliver value fast

**Framework**: Diagnose → Passive Value → Active Upsell

**Traditional (wrong)**:
```
Sign up → Set up profile → Add payment → Configure settings → Use product
```

**Outcome-first (right)**:
```
Sign up → Immediately deliver value → Upsell features as needed → Upgrade when valuable
```

**Cloaked example**:
```
1. Diagnose: "What do you need Cloaked for?" (email privacy, phone privacy, etc.)
2. Passive value: Instantly create masked email/phone, show it working
3. Active upsell: When they need more masks or advanced features, upgrade prompt
```

**Don't front-load setup** - users abandon before seeing value.

### Inverted Engagement
**Use for**: Designing features that work WITHOUT requiring login/setup

**Framework**: Design for value *without* login, login only when necessary

**Example**:
```
❌ Traditional: "Sign up to see if we found your data on the dark web"
✅ Inverted: "Enter email to scan dark web (no signup)" → value first → "Sign up to monitor ongoing"
```

**Cloaked example**: Background Protection
- Runs automatically, no user action required
- Delivers value passively (removes data from data brokers)
- User sees results, not setup screens

### Interdependent Retention
**Use for**: Making churn a "network risk" vs. "personal savings" decision

**Framework**: Create features where value depends on others also using the product

**Examples**:
- Dropbox: Shared folders (if you leave, team loses access)
- Slack: Channels and history (leaving = missing conversations)
- Notion: Collaborative docs (leaving = can't edit shared work)

**Cloaked challenge**: Primarily individual-use product
**Opportunity**: Family plans, shared password vaults, team identity management for B2B

## Leadership & Org Design Frameworks

### Team Topologies
**Use for**: Structuring product/engineering teams

**Four team types**:
1. **Stream-aligned**: Owns a flow of work (e.g., "B2C Onboarding team")
2. **Platform**: Provides internal services (e.g., "Identity Platform team")
3. **Enabling**: Helps other teams learn new tech (e.g., "DevOps Enablement")
4. **Complicated Subsystem**: Owns complex technical area (e.g., "Encryption team")

**For Cloaked multi-market**:
```
Stream-aligned teams:
  - B2C Growth team (onboarding, activation, retention)
  - B2B Sales team (enterprise features, admin tools)
  - B2G Compliance team (FedRAMP, IL4/5, security)

Platform teams:
  - Identity Platform (core masking infrastructure)
  - Data Infrastructure (analytics, reporting)

Enabling teams:
  - Security Enablement (help all teams meet compliance)
```

### Delegation Ladder
**Use for**: Deciding how much autonomy to give on decisions

**7 levels** (from most control to least):
1. **Tell**: You decide, tell them what to do
2. **Sell**: You decide, but explain why to get buy-in
3. **Consult**: Get their input, then you decide
4. **Agree**: Decide together (consensus)
5. **Advise**: They decide, but you give input first
6. **Inquire**: They decide, just inform you after
7. **Delegate**: They decide and act, no check-in

**Usage**:
- Junior PM on small feature → Level 5-6 (Advise/Inquire)
- Senior PM on strategic initiative → Level 6-7 (Inquire/Delegate)
- Critical decision affecting multiple teams → Level 3-4 (Consult/Agree)

### RACI Matrix
**Use for**: Cross-functional clarity on who does what

**Roles**:
- **Responsible**: Does the work
- **Accountable**: Ultimately answerable (only 1 person)
- **Consulted**: Provides input
- **Informed**: Kept in the loop

**Example for new feature launch**:
```
               Product  Eng  Design  Marketing  Legal
Spec          R,A      C    C       I          I
Build         C        R,A  C       I          I
Launch plan   R,A      I    I       R          C
```

### OKRs vs. KPIs
**Use for**: Setting goals and tracking performance

**OKRs (Objectives & Key Results)**:
- **When**: Ambitious goals, inspiring change, quarterly/annual
- **Structure**: Objective (qualitative) + 3-5 Key Results (quantitative)
- **Example**:
  - Objective: "Become the privacy solution for enterprises"
  - KR1: Sign 10 enterprise contracts (>100 users each)
  - KR2: Achieve 90%+ renewal rate
  - KR3: Launch SSO and admin dashboard

**KPIs (Key Performance Indicators)**:
- **When**: Ongoing health metrics, month-over-month tracking
- **Structure**: Single metric with target and actual
- **Example**:
  - MRR: $500K (target) / $450K (actual)
  - Churn: <5% (target) / 6.2% (actual)
  - NPS: >50 (target) / 48 (actual)

**Use both**: OKRs for growth/change, KPIs for health

### Radical Candor
**Use for**: Difficult conversations, feedback, and coaching

**2x2 Framework**:
```
                Care Personally
                ↑
Ruinous Empathy | Radical Candor
----------------|----------------
Manipulative    | Obnoxious
Insincerity     | Aggression
                ↓
                Challenge Directly →
```

**Radical Candor** = Care Personally + Challenge Directly
- **Care Personally**: Show you care about them as a person
- **Challenge Directly**: Give honest, clear feedback

**Examples**:
- ❌ Ruinous Empathy: "Your presentation was great!" (when it wasn't)
- ❌ Obnoxious Aggression: "That presentation was terrible, do better next time"
- ✅ Radical Candor: "I know you worked hard on that presentation. The data was solid, but the narrative was unclear. Let's work on storytelling together."

## Decision-Making Frameworks

### Eisenhower Matrix
**Use for**: Prioritizing tasks and managing time

**2x2 Matrix**:
```
           Urgent          Not Urgent
Important  Do First       Schedule
           (Quadrant 1)    (Quadrant 2)

Not        Delegate       Eliminate
Important  (Quadrant 3)    (Quadrant 4)
```

**Where Head of Product should spend time**: Quadrant 2 (Important, Not Urgent)
- Strategy, roadmapping, team development, learning

**Trap**: Living in Quadrant 1 (Urgent, Important) = firefighting mode

### One-Way vs. Two-Way Door Decisions
**Use for**: Deciding how much analysis to do before deciding

**Jeff Bezos framework**:

**One-Way Doors** (irreversible):
- Hire/fire decisions
- Pricing changes (hard to reverse without customer pain)
- Architectural decisions (expensive to undo)
→ Go slow, gather data, be certain

**Two-Way Doors** (reversible):
- Feature experiments (can turn off)
- Marketing campaigns (can pause)
- Process changes (can revert)
→ Move fast, learn by doing, iterate

**For Cloaked**:
- One-way: B2G compliance certifications (expensive, long commitments)
- Two-way: New onboarding flow (can A/B test, revert if needed)

### Pre-Mortem Analysis
**Use for**: Risk assessment before launching

**Process**:
1. Imagine project failed spectacularly
2. Write "postmortem" from future: "Why did it fail?"
3. Team brainstorms all possible failure modes
4. Prioritize risks
5. Create mitigation plans

**Example**:
```
Pre-Mortem: "B2B launch failed"
Reasons:
- Sales team couldn't articulate value prop to enterprises
- Admin dashboard too basic for IT buyers
- SSO integration bugs caused trial drop-offs
- Pricing was 3x higher than competitors

Mitigations:
- Run 5 enterprise customer discovery calls before launch
- Beta test admin dashboard with 3 IT teams
- QA SSO with all major providers (Okta, Azure AD, Google)
- Competitive pricing analysis, adjust if needed
```

### OODA Loop
**Use for**: Fast decision-making in uncertain environments

**Cycle**: Observe → Orient → Decide → Act (repeat)

**Explanation**:
1. **Observe**: Gather data, user feedback, market signals
2. **Orient**: Make sense of data, identify patterns
3. **Decide**: Choose action based on orientation
4. **Act**: Execute, then observe results

**Speed matters**: Faster OODA loop = competitive advantage

**For Cloaked**:
- Observe: User analytics, support tickets, competitor moves
- Orient: "Users dropping off at payment step"
- Decide: "Test removing credit card upfront"
- Act: Ship experiment
- Observe: Conversion improved 15% → keep it

### Cost of Delay
**Use for**: Prioritizing features based on economic impact

**Formula**: Cost of Delay = Value Decay + Lost Opportunity + Competitive Impact

**Example**:
```
Feature A (B2G compliance):
- Value decay: Low (compliance always needed)
- Lost opportunity: HIGH ($2M contract waiting on FedRAMP)
- Competitive impact: High (competitor just got certified)
→ Cost of Delay: HIGH (do first)

Feature B (B2C dark mode):
- Value decay: Low
- Lost opportunity: Medium (some users churning without it)
- Competitive impact: Low (table stakes, not differentiator)
→ Cost of Delay: MEDIUM (defer)
```

## When to Use Which Framework

**For Prioritization**:
- Many features, unclear order → RICE
- Strategic, long-term → Opportunity Solution Trees
- Economic trade-offs → Cost of Delay

**For Decision-Making**:
- High stakes, irreversible → Pre-Mortem + slow process
- Low stakes, reversible → Two-Way Door + move fast
- Time management → Eisenhower Matrix
- Fast iteration → OODA Loop

**For Strategy**:
- Multi-market understanding → JTBD
- Team alignment → North Star Metric
- Onboarding design → Outcome-First
- Retention → Interdependent Retention

**For Leadership**:
- Team structure → Team Topologies
- Delegation → Delegation Ladder
- Cross-functional work → RACI
- Goal setting → OKRs + KPIs
- Feedback → Radical Candor

## Combining Frameworks

Frameworks work best in combination:

**Example: B2B expansion decision**
1. **JTBD**: Understand B2B customer jobs (what do they need?)
2. **Product-Market Fit**: Assess value/growth/monetization hypotheses
3. **RICE**: Prioritize which B2B features to build first
4. **Pre-Mortem**: Identify risks before launch
5. **OKRs**: Set quarterly goals for B2B growth
6. **North Star**: Track key metric (e.g., "Active enterprise seats")
7. **OODA Loop**: Ship, learn, iterate fast

**The key**: Use frameworks as thinking tools, not rigid processes. Adapt to your context.
