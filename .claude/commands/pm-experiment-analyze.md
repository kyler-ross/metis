# Deep Experiment Analysis

Comprehensive 5-phase research for a single experiment. Goes BEYOND internal metrics to include external literature, unexplored PostHog data, SQL cohort analysis, and evidence-weighted root cause synthesis.

## Instructions

You are performing DEEP experiment analysis that goes outside the "walled garden" of direct experiment metrics.

**Key Principle**: Don't just report what we measured - discover what we SHOULD have measured, what industry research says, and form evidence-weighted hypotheses for why the experiment won/lost.

---

## Input

Experiment identifier: $ARGUMENTS

If no argument provided, ask which experiment to analyze. Valid inputs:
- Feature flag key: `checkout-light-mode`
- Experiment ID: `exp_checkout_light_mode`
- PostHog ID: `132265`

---

## Phase 1: Internal Data Collection (5 min)

### MANDATORY SOURCE CHECKLIST

**Every run of this command MUST check ALL of these sources, even if they return nothing:**

| Source | Command | Required |
|--------|---------|----------|
| Knowledge Base | `cat .ai/knowledge/experiments/_index.json \| jq ...` | YES |
| PostHog Experiments | `mcp__posthog__experiment-get` | YES |
| PostHog Feature Flags | `mcp__posthog__feature-flag-get-all` / `feature-flag-get-definition` | YES |
| Git History | `git log -S "FLAG_KEY"` in dashboard, ios, android | YES |
| GitHub PRs | `gh pr list --search "FLAG_KEY"` | YES |
| Jira | `node .ai/scripts/atlassian-api.cjs search "FLAG_KEY OR experiment_name"` | YES |
| Slack | `node .ai/scripts/slack-api.cjs search "FLAG_KEY OR experiment_name"` | YES |
| Transcripts | Search `.ai/local/private_transcripts/` and `.ai/knowledge/meeting_transcripts/` | YES |
| Google Sheets | Check for analysis spreadsheets | YES |
| Confluence | `node .ai/scripts/atlassian-api.cjs confluence search "experiment_name"` | YES |

**Document ALL sources checked in `sources` array, even if empty:**
```json
{
  "sources": [
    {"source_type": "slack", "searched": true, "results_found": 0, "search_query": "discounted annual plan"},
    {"source_type": "jira", "searched": true, "results_found": 2, "tickets": ["ALL-1234", "ALL-5678"]}
  ]
}
```

**NEVER skip a source. If a source returns nothing, document it as checked with 0 results.**

---

### 1.1 Load from Knowledge Base
```bash
# Find experiment in KB
cat .ai/knowledge/experiments/_index.json | jq '.experiments[] | select(.feature_flag_key == "FEATURE_FLAG_KEY" or .experiment_id == "EXPERIMENT_ID")'
```

Read the experiment JSON file if it exists.

### 1.2 MANDATORY: Extract Baseline & KPI (REQUIRED)

**These fields MUST be populated before completing analysis:**

| Field | Location | Required | Description |
|-------|----------|----------|-------------|
| `metrics.primary[0].name` | metrics | YES | Primary KPI name (e.g., "Checkout Conversion") |
| `results.baseline_value` | results | YES | Control group conversion rate (number) |
| `results.baseline_unit` | results | YES | Unit of measurement ("percent", "count", "rate") |
| `results.treatment_value` | results | RECOMMENDED | Test group value for comparison |

**Baseline Sources (in priority order):**
1. PostHog experiment results (`mcp__posthog__experiment-results-get`)
2. `funnel_analysis.stages` - last stage control_rate
3. `results.conclusion_comment` - extract with regex
4. Related experiments with same funnel (document as estimated)
5. Industry benchmarks (document as external_research source)

**If baseline cannot be found:**
- Search meeting transcripts for discussed metrics
- Check Google Sheets for analysis data
- Look at temporally adjacent experiments with same funnel
- Document source in `results.baseline_source` and add `baseline_estimated` to data_quality_flags

**NEVER leave baseline_value as null for concluded experiments.**

### 1.3 PostHog Deep Pull
Use MCP tools if PostHog ID is known:
- `mcp__posthog__experiment-get` - Full experiment config
- `mcp__posthog__experiment-results-get` - Detailed results with sample sizes

Extract:
- Exact sample sizes per variant
- Conversion rates with confidence intervals
- Timeline (start, end, duration)
- All metrics tracked (primary + secondary)

### 1.3 Slack Search (MANDATORY)

Search Slack for experiment discussions, decisions, and concerns:

```bash
# Search for experiment by flag key and name
node .ai/scripts/slack-api.cjs search "FEATURE_FLAG_KEY"
node .ai/scripts/slack-api.cjs search "experiment name in quotes"
```

Extract:
- Team discussions about the experiment
- Concerns raised during implementation
- Decisions made outside of formal docs
- Launch/rollback communications

Document in sources array even if no results found.

### 1.4 Jira Search (MANDATORY)

Search Jira for related tickets:

```bash
# Search by flag key and experiment name
node .ai/scripts/atlassian-api.cjs search "FEATURE_FLAG_KEY"
node .ai/scripts/atlassian-api.cjs search "experiment name"

# Also check for linked tickets
node .ai/scripts/atlassian-api.cjs jira get ALL-XXXX  # if ticket ID known
```

Extract:
- Implementation tickets
- Bug reports related to the experiment
- Acceptance criteria and requirements
- Links to PRs

### 1.5 GitHub PRs (MANDATORY)

Search for related pull requests:

```bash
# Search PRs across Cloaked repos
gh pr list --repo your-org/dashboard --search "FEATURE_FLAG_KEY" --state all --limit 20
gh pr list --repo your-org/cloaked-ios --search "FEATURE_FLAG_KEY" --state all --limit 20
gh pr list --repo your-org/cloaked-android --search "FEATURE_FLAG_KEY" --state all --limit 20
gh pr list --repo your-org/backend-core --search "FEATURE_FLAG_KEY" --state all --limit 20
```

For each PR found, get details:
```bash
gh pr view PR_NUMBER --repo your-org/REPO
```

Extract:
- PR titles and descriptions
- Code review comments
- Merge dates
- Files changed

### 1.6 Git History Research

Search for code evidence across all repos:

```bash
# Dashboard
cd /Users/kyler/Documents/code/cloaked/dashboard
git log -S "FEATURE_FLAG_KEY" --all --oneline | head -10
git log -S "FEATURE_FLAG_KEY" --all -p --since="2025-01-01" | head -200

# iOS
cd /Users/kyler/Documents/code/cloaked/cloaked-ios
git log -S "FEATURE_FLAG_KEY" --all --oneline | head -10

# Android
cd /Users/kyler/Documents/code/cloaked/cloaked-android
git log -S "FEATURE_FLAG_KEY" --all --oneline | head -10
```

Extract:
- Commit hashes and messages
- Files modified
- Code diff snippets showing variant implementations

### 1.4 Build Funnel Breakdown
Map the experiment's metrics to user journey stages:

| Stage | Event | Control Rate | Test Rate | Delta |
|-------|-------|--------------|-----------|-------|
| ... | ... | ... | ... | ... |

---

## Phase 2: External Research (5 min)

Use WebSearch to find industry knowledge about the experiment's topic.

### 2.1 Topic Extraction
From the experiment hypothesis, extract the core UX/product question. Examples:
- "checkout-light-mode" → "dark mode vs light mode checkout conversion UX"
- "counter-display" → "social proof counters e-commerce conversion"
- "scan-results-feedback" → "user feedback prompts conversion impact"

### 2.2 Search Industry Sources
Perform 3-5 targeted searches:

1. **Academic/Research**: `"[topic]" UX research study conversion`
2. **Nielsen Norman**: `site:nngroup.com "[topic]"`
3. **Baymard Institute**: `site:baymard.com "[topic]" checkout`
4. **Industry blogs**: `"[topic]" A/B test results case study`
5. **Competitors**: `"[topic]" [competitor names] conversion`

### 2.3 Synthesize Findings

For each claim, find at least one source that SUPPORTS and one that CHALLENGES the hypothesis.
If you cannot find contradicting evidence, explicitly state "No contradicting research found" rather than omitting.

Create structured output:
```json
{
  "external_research": {
    "sources": [
      {"title": "...", "url": "...", "credibility": "high|medium|low"}
    ],
    "key_findings": [
      "Finding 1 with citation",
      "Finding 2 with citation"
    ],
    "synthesis": "What does industry research say about our hypothesis?",
    "supports_our_result": true|false,
    "alternative_explanations": ["...", "..."]
  }
}
```

---

## Phase 3: Independent PostHog Exploration (5 min)

Go beyond the experiment's defined metrics to find hidden insights.

### 3.1 Identify Unexplored Metrics
Ask: "What metrics did we NOT measure that could explain the result?"

Common unexplored metrics by experiment type:
- **Checkout experiments**: Time on page, scroll depth, return visits, cart abandonment recovery
- **Onboarding experiments**: Session duration, feature discovery rate, day-1 retention
- **Scan experiments**: Scan completion rate, accuracy perception, support tickets

### 3.2 Query Related Events
Use PostHog MCP to search for related events:
- `mcp__posthog__event-definitions-list` - Find related events
- `mcp__posthog__properties-list` - Find properties we could segment by

### 3.3 Look for Confounding Factors
Search for variables that might explain the result:
- Device type (mobile vs desktop)
- Traffic source (paid vs organic)
- User segment (new vs returning)
- Time of day / day of week
- Platform (iOS vs Android vs web)

### 3.4 Document Findings
```json
{
  "unexplored_metrics": {
    "suggested": [
      {"metric": "...", "why_relevant": "...", "available_in_posthog": true|false}
    ],
    "discovered": [
      {"finding": "...", "source": "event/property name", "significance": "..."}
    ],
    "confounding_factors_identified": [
      {"factor": "...", "potential_impact": "..."}
    ]
  }
}
```

---

## Phase 4: SQL Deep Dive (10 min)

Delegate to the sql-query-builder agent for Redshift queries. This phase requires actual database access.

### 4.1 Cohort Retention Analysis
Request from sql-query-builder:
```
Write a Redshift query to compare 7-day and 30-day retention rates between users in the control vs test variant for experiment [FEATURE_FLAG_KEY].

Join PostHog experiment assignments with our retention tables.
Break down by: new vs returning user, platform (ios/android/web).
```

### 4.2 Revenue Impact Analysis
Request from sql-query-builder:
```
Write a Redshift query to compare LTV (lifetime value) between control and test variant users for experiment [FEATURE_FLAG_KEY].

Include:
- Average order value
- Subscription conversion rate
- Churn rate at M1, M3, M6
```

### 4.3 Segment Breakdown
Request from sql-query-builder:
```
Write a Redshift query to break down experiment [FEATURE_FLAG_KEY] results by:
- plan_type (free, premium, family)
- acquisition_source (organic, paid, referral)
- device_type (ios, android, web)
- user_tenure (0-7 days, 8-30 days, 31+ days)
```

### 4.4 Document Findings
```json
{
  "cohort_analysis": {
    "segments_analyzed": ["new_vs_returning", "device_type", "plan_type"],
    "sql_queries": [
      {"purpose": "...", "query": "-- SQL here", "executed": true|false}
    ],
    "findings": [
      {"segment": "...", "finding": "...", "statistical_confidence": "..."}
    ],
    "anomalies": [
      {"description": "...", "potential_cause": "..."}
    ]
  }
}
```

**Note**: Write the SQL queries that WOULD answer segmentation questions. Mark each as `"executed": false` (proposed, not yet run). Do NOT claim queries have been run unless you actually executed them and got results back. If you do execute queries, mark as `"executed": true` and include the results.

---

## Phase 5: Root Cause & Recommendations (5 min)

Synthesize all findings into actionable insights.

### 5.1 Evidence Weighting
Weight the evidence from each source:

| Source | Weight | Confidence | Key Finding |
|--------|--------|------------|-------------|
| Internal metrics | 0.3 | High | Direct experiment results |
| External research | 0.25 | Medium | Industry patterns |
| Cohort analysis | 0.25 | Medium-High | Segment-specific insights |
| Code evidence | 0.1 | High | Implementation details |
| Qualitative (Slack/transcripts) | 0.1 | Low | Team observations |

### 5.1.5 Conflict Detection & Resolution

When aggregating data from all sources, explicitly check for conflicts:

**Metric Conflicts:**
- If PostHog shows +5% lift but Confluence doc says "inconclusive" → FLAG
- If Slack says "shipping" but Git shows no merge → FLAG
- If transcript says "decided to roll back" but experiment still running → FLAG

**For each conflict:**
1. Document both data points with sources
2. Assign confidence to each (PostHog > Confluence > Slack > Transcript)
3. Form reconciliation hypothesis
4. Add to `lineage.conflicts` array in output

**Example conflict entry:**
```json
{
  "field": "results.conclusion",
  "conflict": "PostHog shows 'won' but Slack discussion says 'rolling back'",
  "sources": [
    {"source": "posthog", "value": "won", "confidence": "high"},
    {"source": "slack", "value": "rolling_back", "confidence": "medium"}
  ],
  "reconciliation": "Experiment won statistically but business decision to roll back due to implementation concerns",
  "resolution": "concluded_won_not_shipped"
}
```

**Source Confidence Hierarchy (highest to lowest):**
1. **PostHog** (high) - Direct measurement, statistical analysis
2. **Git** (high for implementation) - Proof of what shipped
3. **Confluence** (medium-high) - Documented analysis, but may be outdated
4. **Slack** (medium) - Team discussion, real-time but informal
5. **Transcripts** (medium-low) - Contextual understanding but may be misinterpreted

**When to flag conflicts:**
- Results disagree across sources (won vs lost vs inconclusive)
- Timeline conflicts (ended_at vs "still running" in Slack)
- Implementation conflicts (code merged vs "not shipped" in discussion)
- Metric value conflicts (baseline differs by >10% across sources)

**See `.ai/knowledge/experiments/evidence-weighting-guide.md` for complete conflict resolution workflow.**

### 5.2 Form Root Cause Hypothesis
Using weighted evidence, form a clear hypothesis:

```json
{
  "root_cause": {
    "hypothesis": "Clear statement of why the experiment won/lost",
    "confidence": "high|medium|low",
    "supporting_evidence": [
      {"source": "...", "finding": "...", "weight": 0.3}
    ],
    "contradicting_evidence": [
      {"source": "...", "finding": "...", "weight": 0.1}
    ],
    "evidence_weight": {
      "internal_metrics": 0.3,
      "external_research": 0.25,
      "cohort_analysis": 0.25,
      "code_evidence": 0.1,
      "qualitative": 0.1
    }
  }
}
```

### 5.3 Generate Recommendations
Create prioritized, actionable recommendations:

```json
{
  "recommendations": [
    {
      "type": "follow_up_test",
      "description": "Specific experiment to run next",
      "hypothesis": "What we expect to learn",
      "priority": "high|medium|low",
      "estimated_impact": "..."
    },
    {
      "type": "metrics_improvement",
      "description": "Metrics to add to future experiments",
      "priority": "high|medium|low"
    },
    {
      "type": "research",
      "description": "User research to conduct",
      "priority": "high|medium|low"
    },
    {
      "type": "implementation",
      "description": "Code/product changes to consider",
      "priority": "high|medium|low"
    }
  ]
}
```

---

## Output

After completing all 5 phases, update the experiment JSON file with the deep analysis sections.

### MANDATORY FIELDS (Required for every experiment)

Before adding deep analysis sections, ensure these core fields exist:

```json
{
  "metrics": {
    "primary": [
      {
        "name": "Human-readable KPI name (e.g., 'Checkout Conversion')",
        "type": "funnel|count|rate",
        "events": ["event_1", "event_2"],
        "goal": "increase|decrease"
      }
    ]
  },
  "results": {
    "baseline_value": 12.5,
    "baseline_unit": "percent",
    "treatment_value": 14.2,
    "baseline_source": "posthog|funnel_analysis|transcript|estimated",
    "conclusion": "won|lost|inconclusive|running|code_only"
  }
}
```

**If baseline cannot be determined:** Set `baseline_value` to estimated value and add:
- `"baseline_source": "estimated_from_<source>"`
- `"data_quality_flags": ["baseline_estimated"]`

### CRITICAL STRUCTURE RULE

The `deep_analysis` object must contain ONLY metadata:
- `performed_at`, `performed_by`, `phases_completed`

All analysis content goes in **TOP-LEVEL sibling sections**, NOT nested inside `deep_analysis`:
- `code_evidence`, `funnel_analysis`, `external_research`, `unexplored_metrics`,
  `cohort_analysis`, `root_cause`, `recommendations`

**NEVER** nest analysis content inside `deep_analysis`. If you find yourself writing
`deep_analysis.code_evidence` or `deep_analysis.root_cause`, STOP - those are top-level keys.

### File: `.ai/knowledge/experiments/{category}/{experiment_id}.json`

Add these new top-level sections:

```json
{
  // ... existing fields ...

  "deep_analysis": {
    "performed_at": "ISO timestamp",
    "performed_by": "pm-experiment-analyze",
    "phases_completed": ["internal", "external", "posthog", "sql", "synthesis"]
  },

  "code_evidence": {
    "commits": [
      {"hash": "...", "message": "...", "repo": "...", "date": "..."}
    ],
    "files_modified": ["..."],
    "implementation_notes": "..."
  },

  "funnel_analysis": {
    "stages": [
      {"stage": "...", "event": "...", "control_rate": "...", "test_rate": "...", "delta": "..."}
    ],
    "drop_off_point": "...",
    "funnel_notes": "..."
  },

  "external_research": {
    "sources": [...],
    "key_findings": [...],
    "synthesis": "...",
    "supports_our_result": true|false
  },

  "unexplored_metrics": {
    "suggested": [...],
    "discovered": [...],
    "confounding_factors_identified": [...]
  },

  "cohort_analysis": {
    "segments_analyzed": [...],
    "sql_queries": [...],
    "findings": [...],
    "anomalies": [...]
  },

  "root_cause": {
    "hypothesis": "...",
    "confidence": "...",
    "evidence_weight": {...},
    "supporting_evidence": [...],
    "contradicting_evidence": [...]
  },

  "recommendations": [...]
}
```

---

## Phase 6: Validation

After writing the experiment JSON file, run the post-processor to validate structure:

```bash
node .ai/scripts/experiment-validator.cjs --post-process .ai/knowledge/experiments/{category}/{filename}.json
```

If validation fails, fix issues before completing. The validator will:
- Ensure `deep_analysis` contains only metadata (not analysis content)
- Verify all sibling sections exist at top level
- Add `implemented: false` to new recommendations
- Add `executed: false` to SQL queries missing the field
- Bump schema_version to 1.1.0

---

## Phase 7: Confluence Publishing (2 min)

After validation passes, publish the experiment to Confluence.

### 7.1 Publish Experiment Page

```bash
node .ai/scripts/experiment-confluence-publisher.cjs --experiment {experiment_id}
```

This will:
- Convert experiment JSON to rich Confluence page with all sections
- Create or update the page in the PM space
- Add status badge, metrics tables, recommendations
- Store `confluence_page_id` and `confluence_url` back to JSON

### 7.2 Update Experiment Index

```bash
node .ai/scripts/experiment-index-publisher.cjs
```

This updates the master Experiment Catalog page with:
- Summary stats (total, won, lost, running)
- Category breakdown table
- All experiments with links
- Key learnings section

### 7.3 Verify Publication

After publishing:
- [ ] Experiment JSON has `identification.confluence_page_id`
- [ ] Experiment JSON has `identification.confluence_url`
- [ ] Confluence page shows all deep analysis sections
- [ ] Catalog page includes this experiment

---

## Quality Checklist

Before completing, verify:

**MANDATORY SOURCE CHECKS (analysis FAILS if any source skipped):**
- [ ] PostHog experiment searched (`mcp__posthog__experiment-get` or `experiment-results-get`)
- [ ] PostHog feature flags searched (`mcp__posthog__feature-flag-get-all`)
- [ ] Slack searched (`node .ai/scripts/slack-api.cjs search`)
- [ ] Jira searched (`node .ai/scripts/atlassian-api.cjs search`)
- [ ] GitHub PRs searched (`gh pr list --search`)
- [ ] Git history searched in dashboard, ios, android repos
- [ ] Transcripts searched (both private and team)
- [ ] Google Sheets checked for analysis data
- [ ] Confluence searched
- [ ] ALL sources documented in `sources` array (even if 0 results)

**MANDATORY DATA (analysis fails without these):**
- [ ] `metrics.primary[0].name` is populated with KPI name
- [ ] `results.baseline_value` is populated (number, not null)
- [ ] `results.baseline_unit` is set ("percent", "count", or "rate")
- [ ] `results.treatment_value` is populated if experiment has results

**Deep Analysis:**
- [ ] PostHog data pulled with sample sizes
- [ ] Git history searched in all relevant repos
- [ ] At least 3 external sources consulted (with supporting AND contradicting evidence)
- [ ] Unexplored metrics identified
- [ ] SQL queries written (marked `executed: true` or `executed: false` honestly)
- [ ] Evidence weighted from multiple sources
- [ ] Root cause hypothesis formed with confidence level
- [ ] At least 3 actionable recommendations generated (each with `implemented: false`)
- [ ] Experiment JSON file updated with deep analysis
- [ ] All analysis sections are TOP-LEVEL siblings (not nested in `deep_analysis`)
- [ ] `node .ai/scripts/experiment-validator.cjs --post-process <file>` passes

**Conflict Detection:**
- [ ] Source conflicts identified and documented in `lineage.conflicts`
- [ ] Each conflict has reconciliation hypothesis
- [ ] High-confidence source disagreements flagged for review

**Confluence Publishing:**
- [ ] Phase 7 completed (experiment page + catalog update)
- [ ] `identification.confluence_page_id` set
- [ ] `identification.confluence_url` set

---

## Example Usage

```
/pm-experiment-analyze checkout-light-mode
```

This will perform deep analysis on the light mode checkout experiment, including:
- Pulling detailed PostHog results
- Searching for git commits showing the theme change
- Researching industry studies on dark vs light mode in checkout
- Looking for unexplored metrics (time on page, scroll depth)
- Writing SQL to compare retention by variant
- Forming a hypothesis: "Light mode violated brand trust signals"
- Recommending a full-funnel consistency test
- Publishing to Confluence with full analysis
