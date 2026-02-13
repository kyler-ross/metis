---
name: sql-query-builder
description: Transform natural language questions into production-ready Redshift SQL queries. Use for metric queries, data extraction, cohort analysis, churn analysis, and business intelligence questions.
---

# SQL Query Builder

## When to Use This Skill

Invoke this skill when the user needs:
- **SQL queries** - Any request for database queries or data extraction
- **Metrics questions** - M1/M3/M11 churn, retention, MRR, cohort analysis
- **Data exploration** - User segments, feature adoption, funnel analysis
- **Business intelligence** - Trend analysis, breakdowns, comparisons

## Core Principle

**SCHEMA-FIRST. ALWAYS VALIDATE.**

Never write SQL without first verifying table and column names against the schema. All queries must be syntactically correct and safe for production Redshift.

## Resource Selection

Load the appropriate reference based on the task:

| Resource | When to Use | Load |
|----------|-------------|------|
| **Schema-First Approach** | ALWAYS - before writing any SQL | `references/schema-first-approach.md` |
| **Critical Rules** | ALWAYS - data filters, date windows, Redshift limits | `references/critical-rules.md` |
| **Query Patterns** | Templates for churn, adoption, time-series metrics | `references/query-patterns.md` |
| **Output Format** | Formatting response with explanation and safety | `references/output-format.md` |

## Required Context

Before writing any query, load relevant knowledge:
- `knowledge/redshift-schema.md` - Complete table inventory with columns
- `knowledge/metrics-catalog.md` - Authoritative metric definitions
- `knowledge/business-metrics-and-logic.md` - Calculation formulas
- `knowledge/churned-users-guide.md` - Churn analysis details

## Pre-Aggregated Tables (Use First)

For performance, prefer these pre-aggregated tables:
- `daily_key_metrics` / `daily_key_metrics_by_plan_info` - MRR, active users, new/churned
- `churn_breakdown_daily*` - Churn reasons by day/platform/plan
- `okr_*` tables - LTV/CAC, feature adoption, MAU

## Mandatory Self-Review

Before returning ANY query:

1. Verify every table and column against the schema
2. Trace the query execution mentally
3. Check for common pitfalls:
   - `is_temporary` filter for real users
   - Timezone handling (UTC vs local)
   - Cross-join prevention
   - Date window bounds
4. Only present when ALL checks pass

**Do NOT skip this step.** It catches 80% of SQL errors before they reach Redshift.

## Output Format

Always structure responses as:

1. **Understanding** - Restate what data is needed
2. **Approach** - Explain tables and joins used
3. **Query** - The SQL (properly formatted)
4. **Expected Output** - What columns/rows will return
5. **Caveats** - Any assumptions or limitations

## Capabilities

- Complete Redshift schema knowledge
- Pipeline and data flow understanding
- Business metrics definitions
- Production-tested query patterns
- Safety-first approach with guardrails
