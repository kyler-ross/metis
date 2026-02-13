---
name: critical-rules
description: Resource file for sql-query-builder agent
type: resource
---

# Critical Rules

## Rule 1: Always Filter Temporary Users
```sql
-- GOOD
SELECT COUNT(DISTINCT u.user_id)
FROM users u
JOIN raw_privyuser_user pu ON u.user_id = pu.user_id
WHERE pu.is_temporary = FALSE  -- REQUIRED

-- BAD
SELECT COUNT(DISTINCT user_id) FROM users  -- No temp filter!
```

## Rule 2: Date Windows Must Be Complete
```sql
-- GOOD (7-day churn: user must have 7+ days)
WHERE subscription_start_date <= DATEADD(day, -7, CURRENT_DATE)

-- BAD (includes users with only 3 days)
WHERE subscription_start_date >= DATEADD(day, -7, CURRENT_DATE)
```

## Rule 3: Use Pre-Computed Tables When Available
```sql
-- GOOD (use pre-computed, it's validated)
SELECT * FROM daily_key_metrics
WHERE date >= DATEADD(day, -30, CURRENT_DATE)

-- OK (calculate if needed)
SELECT DATE(subscription_started_at) as date,
       COUNT(*) as new_users
FROM subscription_events
WHERE subscription_event = 'subscription_started'
GROUP BY DATE(subscription_started_at)
```

## Rule 4: Exclude Imported Items for New Creation Metrics
```sql
-- GOOD
SELECT COUNT(*)
FROM [your_items_table]
WHERE created_at >= '2025-10-01'
  AND import_uuid IS NULL  -- Only user-created

-- BAD
SELECT COUNT(*)
FROM [your_items_table]
WHERE created_at >= '2025-10-01'  -- Includes imports
```

## Rule 5: Handle Refund Adjustments
```sql
-- When accuracy matters, use refund-adjusted metrics
SELECT mrr_refund_adjusted FROM daily_key_metrics
SELECT arpu_refund_adjusted FROM daily_key_metrics

-- When showing raw metrics, note the adjustment
SELECT mrr, mrr_refund_adjusted
FROM daily_key_metrics
-- Shows both so PM understands impact
```

## Rule 6: Date Math Syntax
```sql
-- Redshift/PostgreSQL date arithmetic
DATEADD(day, -7, CURRENT_DATE)     -- 7 days ago
DATEADD(month, -1, CURRENT_DATE)   -- 1 month ago
DATE_TRUNC('month', date_col)      -- Start of month
DATEDIFF(day, start_date, end_date) -- Days between

-- NOT INTERVAL (that's for PostgreSQL, Redshift uses DATEADD)
-- DON'T use: date_col - INTERVAL '7 days'
```

## Rule 7: Redshift SQL Limitations (CRITICAL - Learned Painfully)

**Redshift is NOT PostgreSQL.** These common SQL patterns are NOT supported and will fail:

❌ **Window functions with OVER clauses** (in certain contexts)
```sql
-- DON'T DO THIS
SELECT
  name,
  COUNT(*) OVER (PARTITION BY category) as count
FROM table;
-- Error: "Specified types or functions not supported on Redshift tables"
```
✅ **Use GROUP BY instead**
```sql
-- DO THIS
SELECT
  category,
  COUNT(*) as count
FROM table
GROUP BY category;
```

❌ **Complex CTEs with UNION ALL** (especially multiple levels)
```sql
-- DON'T DO THIS
WITH chunk_1 AS (
  SELECT ... FROM table1
  UNION ALL
  SELECT ... FROM table2
),
chunk_2 AS (
  SELECT ... FROM table3
  UNION ALL
  SELECT ... FROM chunk_1
)
SELECT * FROM chunk_2;
-- Error: "Specified types or functions not supported"
```
✅ **Use separate simple queries instead**
```sql
-- DO THIS - Run query 1
SELECT ... FROM table1;

-- Then run query 2
SELECT ... FROM table2;

-- Combine results in application layer
```

❌ **Subqueries in SELECT for dynamic data**
```sql
-- DON'T DO THIS
SELECT
  name,
  (SELECT COUNT(*) FROM other_table) as row_count
FROM main_table;
-- Error: "Specified types or functions not supported"
```
✅ **Use LEFT JOIN instead**
```sql
-- DO THIS
SELECT
  m.name,
  COUNT(o.*) as row_count
FROM main_table m
LEFT JOIN other_table o ON m.id = o.main_id
GROUP BY m.name;
```

**When in doubt: Start with the simplest possible query.** If it fails with "unsupported functions," strip out all advanced SQL features (CTEs, window functions, subqueries) and rebuild from scratch.

**Testing strategy:** Always test a simple baseline query first before adding complexity.
```sql
-- Test 1: Does the basic SELECT work?
SELECT * FROM table LIMIT 1;

-- Test 2: Add WHERE clause
SELECT * FROM table WHERE condition LIMIT 10;

-- Test 3: Add GROUP BY
SELECT category, COUNT(*) FROM table GROUP BY category;

-- Only then add JOINs, ORDER BY, etc.
```

## When Your Query Fails in Redshift

If you get error: `"Specified types or functions (one per INFO message) not supported on Redshift tables."`

**This is Redshift rejecting advanced SQL features.** Do NOT try variants of the same approach. Instead:

1. **Simplify immediately**
   - Remove ALL CTEs
   - Remove ALL window functions (OVER clauses)
   - Remove ALL subqueries in SELECT
   - Use only: SELECT, FROM, WHERE, JOIN, GROUP BY, ORDER BY, LIMIT

2. **Test basic query first**
   ```sql
   SELECT * FROM pg_table_def LIMIT 1;
   ```
   If this works, you know the table is accessible.

3. **Add complexity incrementally**
   - Add WHERE clause
   - Add GROUP BY
   - Add JOINs
   - Test at each step

4. **Split into multiple queries**
   - If you need counts from multiple tables, run separate queries
   - Combine results in application layer or as separate result sets
   - This is FASTER and SIMPLER than trying to do everything in one query

5. **Never persist with a broken pattern**
   - If error repeats 2x, the pattern itself is unsupported
   - Completely change your approach, don't try variants

## DO NOT

❌ Generate queries without checking schema first
❌ Skip the temporary user filter
❌ Use incomplete date windows
❌ Return PII columns
❌ Ignore refund adjustments when relevant
❌ Make assumptions about ambiguous questions
❌ Generate INSERT/UPDATE/DELETE (SELECT only)
❌ Create new tables or views
❌ Use * in SELECT (always be specific)
