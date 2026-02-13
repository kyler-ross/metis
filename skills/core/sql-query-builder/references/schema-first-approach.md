---
name: schema-first-approach
description: Resource file for sql-query-builder agent
type: resource
---

# Schema-First Approach

## CRITICAL ENFORCEMENT: SCHEMA-FIRST APPROACH

**BEFORE you write ANY SQL:**

1. **Read the schema documentation** (`knowledge/redshift-schema.md`)
   - Verify table names exist
   - Verify column names exist in those tables
   - Check data types and encoding
   - Find the right join keys
   - Note which tables are pre-aggregated (use those first)

2. **Check query patterns** (`skills/core/sql-query-builder/query-patterns.md`)
   - Find similar queries you can use as templates
   - Reference production-tested patterns from `data-jobs`
   - Use pre-aggregated tables when available

3. **Understand pipeline context** (`knowledge/data-infrastructure.md`)
   - Know when tables are refreshed
   - Understand data flow and dependencies
   - Check for edge cases (refund adjustments, etc.)

4. **Verify business logic** (`knowledge/business-metrics-and-logic.md`)
   - Understand metric definitions
   - Check filtering rules (temporary users, imports, etc.)
   - Verify calculation formulas

5. **NEVER guess at table/column names**
   - Every table must be found in `redshift-schema.md`
   - Every column must be verified to exist
   - If unsure, ask clarifying questions

**Why this matters:** Previous failures happened because I guessed at table names and wrote incorrect queries. Schema-first prevents that.

## Your Process

When a PM asks a question:

1. **UNDERSTAND THE INTENT**
   - What metric are they asking for? (e.g., "14-day churn rate", "feature usage by platform")
   - What time period? (last 30 days, by month, historical)
   - What dimensions? (by platform, by plan, by cohort)
   - Parse the question to identify: metric + filters + grouping

2. **MAP TO SCHEMA**
   - Which table(s) contain this data?
   - Consult TABLE_SCHEMA_REFERENCE.md: Which columns do I need?
   - Are there pre-computed tables that already have this metric?
   - Strategy: Use pre-computed tables when possible (faster, validated)

3. **APPLY BUSINESS LOGIC**
   - Consult business-metrics-and-logic.md for metric definitions
   - Example: "14-day churn" = specific eligibility windows, specific event types
   - Example: "[Key Metric]" = exclude imports (import_uuid IS NULL)
   - Example: "active users" = COALESCE(active_updated, active)

4. **CHECK SAFETY GUARDRAIL**
   - No direct PII columns in SELECT (no email, phone, SSN)
   - Date range must be explicit (WHERE date >= X AND date <= Y)
   - User filter applied: is_temporary = FALSE for user counts
   - Row limit: LIMIT included or GROUP BY aggregates results
   - Explain what the output will be (row count, dimensions)

5. **GENERATE CLEAN SQL**
   - PostgreSQL/Redshift syntax
   - CTEs for readability
   - Column aliases that are self-documenting
   - Comments explaining complex logic
   - Include EXPLAIN comment above query

6. **EXPLAIN THE OUTPUT**
   - "This returns X columns"
   - "You'll see ~Y rows (one per [dimension])"
   - "Expected output: [example row]"
   - "Run time: [estimate]"
