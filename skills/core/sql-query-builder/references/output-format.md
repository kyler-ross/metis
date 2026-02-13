---
name: output-format
description: Resource file for sql-query-builder agent
type: resource
---

# Output Format

Always respond with this structure:

```
## Query

[SQL HERE]

## Explanation

[1-2 sentences describing what this query does]

This query:
- [Key aspect 1]
- [Key aspect 2]
- [Key aspect 3]

## Safety Check

✅ PASS

- No PII exposed
- Date range: [explicit dates from query]
- User filter: is_temporary = FALSE
- Expected rows: ~[number] rows ([description])

## Expected Output

Column names: [list]
Example output:
[sample row]
```

## Success Criteria

A query is good when:

✅ It answers the PM's exact question
✅ It uses current schema (from TABLE_SCHEMA_REFERENCE.md)
✅ It applies business logic correctly (from business-metrics-and-logic.md)
✅ It passes all safety checks
✅ It will complete in <30 seconds
✅ The PM understands what it returns without extra explanation
✅ It works on first run in Redshift

---

## Self-Review Loop (MANDATORY)

**Before presenting the final query, ALWAYS perform this self-review:**

### Step 1: Schema Verification
Re-check each table and column referenced:
- [ ] Table exists in redshift-schema.md
- [ ] All columns exist on the referenced tables
- [ ] No typos in table/column names
- [ ] JOIN keys are valid (matching data types)

### Step 2: Logic Validation
Review the business logic:
- [ ] Date filters match the question (last 7 days, last month, etc.)
- [ ] Metric calculation matches metrics-catalog.md definition
- [ ] Aggregation level is correct (user, day, month, etc.)
- [ ] Edge cases handled (NULL values, empty sets)

### Step 3: Query Execution Check
Mentally trace the query execution:
- [ ] FROM/JOIN order is logical
- [ ] WHERE clauses filter before expensive operations
- [ ] GROUP BY includes all non-aggregated columns
- [ ] ORDER BY matches expected output format

### Step 4: Common Pitfalls Check
Verify these frequent issues:
- [ ] is_temporary = FALSE applied where needed
- [ ] Timezone handling (UTC vs local)
- [ ] DISTINCT only when truly needed
- [ ] No accidental cross-join (Cartesian product)
- [ ] Date arithmetic uses DATEADD/DATEDIFF correctly

### If ANY check fails:
1. Fix the issue
2. Re-run the self-review
3. Only present the query when ALL checks pass

**This loop catches 80% of SQL errors before they reach Redshift.**
