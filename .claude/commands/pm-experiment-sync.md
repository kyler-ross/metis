# Experiment Sync Pipeline

Comprehensive multi-phase experiment discovery and deep research pipeline using Claude Code subagents.

## Instructions

You are orchestrating a **3-phase experiment knowledge base sync**. This is expensive and time-consuming but creates deep, rich context that persists forever.

---

## Phase 1: Discovery (Parallel Master Lists)

Spawn **9 parallel subagents** to gather master experiment lists from each source. Use a single message with 9 Task tool calls, `subagent_type: "general-purpose"`.

### Agent 1: PostHog Experiments
```
You are gathering experiment data from PostHog.

TASK: Use MCP tools to get all experiments.

TOOLS:
1. mcp__posthog__experiment-get-all - Get list of all experiments
2. For concluded experiments, get results with mcp__posthog__experiment-results-get

FILTER: Focus on experiments from the past 6 months.

OUTPUT (JSON only):
{
  "source": "posthog",
  "experiments": [
    {
      "posthog_id": <number>,
      "name": "<name>",
      "feature_flag_key": "<key>",
      "status": "concluded|running|draft",
      "start_date": "<ISO or null>",
      "end_date": "<ISO or null>"
    }
  ]
}
```

### Agent 2: Confluence Documentation
```
You are gathering experiment documentation from Confluence.

TASK: Search Confluence for experiment pages.

COMMANDS:
- node .ai/scripts/atlassian-api.cjs confluence children 801767852
- node .ai/scripts/atlassian-api.cjs confluence search "experiment"

LOOK FOR: Pages with "EXP:" prefix, hypothesis docs, A/B test PRDs.

OUTPUT (JSON only):
{
  "source": "confluence",
  "experiments": [
    {
      "page_id": "<id>",
      "title": "<title>",
      "feature_flag_key": "<key if mentioned>"
    }
  ]
}
```

### Agent 3: iOS Experiments
```
You are extracting experiments from iOS code.

FILE: /Users/kyler/Documents/code/cloaked/cloaked-ios/Shared/FeatureFlags/CloakedExperiments.swift

EXTRACT: Structs implementing CloakedExperiment, their featureFlagKey values.

Also check git log for removed experiments:
git log --oneline -20 -- Shared/FeatureFlags/CloakedExperiments.swift

OUTPUT (JSON only):
{
  "source": "ios_code",
  "experiments": [
    {
      "struct_name": "<Name>",
      "feature_flag_key": "<key>",
      "status": "active|removed"
    }
  ]
}
```

### Agent 4: Android Experiments
```
You are extracting experiments from Android code.

FILES:
1. /Users/kyler/Documents/code/cloaked/cloaked-android/app/src/main/java/app/android/cloaked/utils/featureflags/ProductExperimentInfo.kt
2. /Users/kyler/Documents/code/cloaked/cloaked-android/app/src/main/java/app/android/cloaked/posthog/PostHogManager.kt

EXTRACT: ProductExperiment sealed interface implementations (NOT FeatureFlag.kt - those are toggles).

OUTPUT (JSON only):
{
  "source": "android_code",
  "experiments": [
    {
      "experiment_name": "<Name>",
      "feature_flag_key": "<key from PostHogManager>"
    }
  ]
}
```

### Agent 5: Dashboard Experiments
```
You are extracting experiments from the web dashboard.

FILE: /Users/kyler/Documents/code/cloaked/dashboard/src/scripts/posthogEvents.js

ALSO SEARCH:
grep -r "getFeatureFlag" /Users/kyler/Documents/code/cloaked/dashboard/src --include="*.vue" --include="*.js" | head -30

LOOK FOR: Multi-variant experiments (not just true/false toggles).

OUTPUT (JSON only):
{
  "source": "dashboard_code",
  "experiments": [
    {
      "const_name": "<name or null>",
      "feature_flag_key": "<key>"
    }
  ]
}
```

### Agent 6: Backend Experiments
```
You are searching for experiments in backend-core.

SEARCH: /Users/kyler/Documents/code/cloaked/backend-core/

COMMANDS:
grep -r "feature.flag\|experiment\|variant" --include="*.py" /Users/kyler/Documents/code/cloaked/backend-core/ | head -50

OUTPUT (JSON only):
{
  "source": "backend_code",
  "experiments": [
    {
      "name": "<name>",
      "location": "<file:line>"
    }
  ],
  "posthog_integration_found": true|false
}
```

### Agent 7: Automation Feature Flags
```
You are cataloging automation feature flags.

NOTE: These are ON/OFF toggles for automation scripts, NOT A/B experiments. Include for completeness.

FILE: /Users/kyler/Documents/code/cloaked/automation/packages/types/src/user/FeatureFlag.generated.ts

OUTPUT (JSON only):
{
  "source": "automation_code",
  "note": "These are toggles, not experiments",
  "flags": [
    {"flag_key": "<key>", "type": "toggle"}
  ]
}
```

### Agent 8: Slack Mentions
```
You are gathering experiment mentions from Slack.

COMMANDS:
- node .ai/scripts/slack-api.cjs search "experiment"
- node .ai/scripts/slack-api.cjs search "A/B test"

CHANNELS: #all-launches, #all-updates, #proj-journey-to-checkout

OUTPUT (JSON only):
{
  "source": "slack",
  "experiment_mentions": [
    {
      "experiment_name_or_key": "<name>",
      "channel": "<channel>",
      "user": "<user>",
      "date": "<YYYY-MM-DD>",
      "type": "launch|result|discussion"
    }
  ]
}
```

### Agent 9: Meeting Transcripts
```
You are extracting experiment discussions from transcripts.

SEARCH:
grep -l -i "experiment\|a/b test" /Users/kyler/Documents/code/cloaked/pm/.ai/local/private_transcripts/*.md | head -30

For matching files, extract experiment names and context.

OUTPUT (JSON only):
{
  "source": "transcripts",
  "files_with_mentions": <number>,
  "experiment_mentions": [
    {
      "file": "<filename>",
      "experiments_mentioned": ["<exp1>", "<exp2>"]
    }
  ]
}
```

---

## Phase 2: Synthesis (Orchestrator)

After all 9 agents return, YOU (the orchestrator) must:

### 2.1 Aggregate Results
Combine all experiment identifiers into a master list. Match by `feature_flag_key` as the canonical identifier.

### 2.2 Load Existing Knowledge Base
Read: `.ai/knowledge/experiments/_index.json`

### 2.3 Compare and Categorize
For each experiment found, determine:
- **EXISTING**: Already in KB with complete data → skip deep research
- **EXISTING_STALE**: In KB but new info discovered → queue for deep research
- **NEW**: Not in KB → queue for deep research

### 2.4 Create Work Queue
Build a list of experiments needing deep research:
```json
{
  "work_queue": [
    {
      "experiment_id": "exp_checkout_trust_badges",
      "feature_flag_key": "checkout-trust-badges",
      "reason": "new",
      "known_sources": ["posthog", "slack", "ios_code"],
      "identifiers": {
        "posthog_id": 288056,
        "ios_struct": "CheckoutTrustBadges",
        "confluence_page": null
      }
    }
  ]
}
```

### 2.5 Report Phase 2 Summary
Tell the user:
- Total unique experiments found across all sources
- How many already exist in KB (skipping)
- How many need deep research
- Ask for confirmation before Phase 3 (it's expensive)

---

## Phase 3: Deep Research (Per-Experiment Agents)

For EACH experiment in the work queue, spawn a dedicated subagent that searches ALL 9 sources for every detail about that specific experiment.

### Batching Strategy
- Batch size: 5 experiments at a time (parallel)
- Wait for batch to complete before next batch
- This respects rate limits while maintaining parallelism

### Per-Experiment Agent Prompt Template
```
You are researching ONE specific experiment in depth.

EXPERIMENT: {canonical_name}
FEATURE FLAG KEY: {feature_flag_key}
KNOWN IDENTIFIERS:
- PostHog ID: {posthog_id or "unknown"}
- iOS Struct: {ios_struct or "unknown"}
- Android Name: {android_name or "unknown"}
- Confluence Page: {confluence_page_id or "unknown"}

YOUR TASK: Search ALL 9 sources for every piece of information about this experiment.

## Source 1: PostHog
If posthog_id is known, use:
- mcp__posthog__experiment-get with experimentId: {posthog_id}
- mcp__posthog__experiment-results-get with experimentId: {posthog_id}

Extract: variants, metrics, timeline, results, conclusion.

## Source 2: Confluence
Search: node .ai/scripts/atlassian-api.cjs confluence search "{feature_flag_key}"
Also search: "{canonical_name}"

Extract: hypothesis, design rationale, success metrics, related docs.

## Source 3: iOS Code
Read: /Users/kyler/Documents/code/cloaked/cloaked-ios/Shared/FeatureFlags/CloakedExperiments.swift
Search for: {feature_flag_key} or {ios_struct}

Extract: variant definitions, default values, implementation details.

## Source 4: Android Code
Read ProductExperimentInfo.kt and PostHogManager.kt
Search for: {feature_flag_key} or {android_name}

Extract: variant definitions, implementation details.

## Source 5: Dashboard Code
grep -r "{feature_flag_key}" /Users/kyler/Documents/code/cloaked/dashboard/src/

Extract: how the experiment is used in web UI.

## Source 6: Backend Code
grep -r "{feature_flag_key}" /Users/kyler/Documents/code/cloaked/backend-core/

Extract: backend implementation details.

## Source 7: Automation Code
grep "{feature_flag_key}" /Users/kyler/Documents/code/cloaked/automation/

Extract: any automation-related usage.

## Source 8: Slack
node .ai/scripts/slack-api.cjs search "{feature_flag_key}"
node .ai/scripts/slack-api.cjs search "{canonical_name}"

Extract: launch announcements, result discussions, team context.

## Source 9: Transcripts
grep -l -i "{feature_flag_key}\|{canonical_name}" /Users/kyler/Documents/code/cloaked/pm/.ai/local/private_transcripts/*.md

For matches, read the file and extract relevant discussion context.

---

OUTPUT FORMAT (JSON):
{
  "experiment_id": "{experiment_id}",
  "canonical_name": "{canonical_name}",
  "feature_flag_key": "{feature_flag_key}",
  "category": "<checkout|onboarding|retention|data-deletion|call-guard|landing-page|other>",

  "identification": {
    "posthog_id": <number or null>,
    "confluence_page_id": "<id or null>",
    "ios_struct_name": "<name or null>",
    "android_experiment_name": "<name or null>",
    "dashboard_const_name": "<name or null>"
  },

  "hypothesis": {
    "statement": "<the hypothesis being tested>",
    "confidence": "high|medium|low",
    "source": "<where this came from>"
  },

  "variants": [
    {
      "key": "<variant key>",
      "name": "<display name>",
      "description": "<what this variant does>",
      "rollout_percentage": <number or null>
    }
  ],

  "metrics": {
    "primary": ["<metric1>", "<metric2>"],
    "secondary": ["<metric3>"],
    "guardrails": ["<metric4>"]
  },

  "timeline": {
    "created_at": "<ISO or null>",
    "started_at": "<ISO or null>",
    "ended_at": "<ISO or null>",
    "duration_days": <number or null>
  },

  "results": {
    "status": "concluded_won|concluded_lost|concluded_inconclusive|running|draft",
    "conclusion": "<summary of what was learned>",
    "winning_variant": "<variant key or null>",
    "lift_percentage": "<e.g. +6.3% or null>",
    "sample_size": <number or null>,
    "statistical_significance": "<95% CI or null>"
  },

  "impact": {
    "business_summary": "<what this means for the business>",
    "shipped_to_production": true|false,
    "follow_up_experiments": ["<exp_id1>", "<exp_id2>"]
  },

  "context": {
    "slack_mentions": [
      {
        "channel": "<channel>",
        "user": "<user>",
        "date": "<YYYY-MM-DD>",
        "summary": "<what was said>"
      }
    ],
    "transcript_mentions": [
      {
        "file": "<filename>",
        "date": "<date>",
        "summary": "<what was discussed>"
      }
    ],
    "team_observations": ["<observation1>", "<observation2>"]
  },

  "sources": [
    {
      "source_type": "posthog|confluence|ios_code|android_code|dashboard_code|backend_code|automation_code|slack|transcripts",
      "source_id": "<specific ID>",
      "retrieved_at": "<ISO timestamp>",
      "confidence": "high|medium|low",
      "fields_from_source": ["<field1>", "<field2>"]
    }
  ],

  "lineage": {
    "conflicts": [],
    "uncertainty_flags": ["<field>: <reason>"]
  }
}

Return ONLY the JSON. Be thorough - this data persists forever.
```

---

## Phase 4: Persist Results

After all deep research agents complete:

1. **Save each experiment** to `.ai/knowledge/experiments/{category}/{experiment_id}.json`

2. **Update _index.json** with new/updated experiments

3. **Update _sources.json** with sync timestamps

4. **Report conflicts** in `_conflicts.json` if any sources disagreed

5. **Generate summary**:
   - Experiments created
   - Experiments updated
   - Sources synced
   - Conflicts to review

---

## Usage

```
/pm-experiment-sync
```

This pipeline is expensive (many subagents) but creates comprehensive, permanent experiment documentation.

Optional: $ARGUMENTS
- `--discovery-only` - Run Phase 1 only, report findings
- `--experiment <id>` - Deep research single experiment
