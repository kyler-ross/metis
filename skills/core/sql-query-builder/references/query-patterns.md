---
name: query-patterns
description: Production-tested SQL patterns from data-jobs pipelines
type: resource
source: data-jobs repository analysis (2026-01-12)
---

# Production Query Patterns

These patterns are extracted from actual production pipelines in `data-jobs/legacy/redshift-scheduled-queries/`.

---

## Pattern 1: Daily Key Metrics (MRR, Active Users, Churn)

**Source**: `user_activity_reports.sql` (QS2-6_reports_new)
**Use for**: "What's our MRR?", "How many active users?", "Daily churn numbers"

```sql
-- Fast path: Use pre-aggregated table
SELECT
    date,
    active_user,
    new_users,
    churned_users,
    recovered_users,
    mrr,
    mrr_refund_adjusted
FROM daily_key_metrics
WHERE date >= DATEADD(day, -30, CURRENT_DATE)
ORDER BY date DESC;

-- By plan type
SELECT
    date,
    plan_info,
    active_user,
    mrr,
    new_users,
    churned_users
FROM daily_key_metrics_by_plan_info
WHERE date >= DATEADD(day, -30, CURRENT_DATE)
ORDER BY date DESC, plan_info;
```

---

## Pattern 2: New/Churned/Recovered Users (Full Logic)

**Source**: `user_activity_reports.sql`
**Use for**: When you need to understand the exact logic or customize

```sql
WITH daily_user_activity_report_raw AS (
    SELECT
        *,
        COALESCE(
            LAG(active_updated) OVER (PARTITION BY user_id ORDER BY date),
            LAG(active) OVER (PARTITION BY user_id ORDER BY date),
            TRUE
        ) AS active_lag
    FROM daily_user_activity_report
)
SELECT
    date,
    -- New users: first subscription on this date, still active
    COUNT(DISTINCT CASE
        WHEN first_subscription_start_timestamp::date = date
        AND COALESCE(active_updated, active)
        AND first_subscription_start_timestamp::date !=
            COALESCE(max_period_end_timestamp_updated, max_period_end_timestamp)::date
        THEN user_id
    END) AS new_users,

    -- Churned users: period ended today, was active yesterday, not same-day signup
    COUNT(DISTINCT CASE
        WHEN COALESCE(max_period_end_timestamp_updated, max_period_end_timestamp)::date = date
        AND NOT COALESCE(active_updated, active)
        AND active_lag
        AND first_subscription_start_timestamp::date <>
            COALESCE(max_period_end_timestamp_updated, max_period_end_timestamp)::date
        THEN user_id
    END) AS churned_users,

    -- Recovered users: became active today, wasn't active yesterday, not new
    COUNT(DISTINCT CASE
        WHEN COALESCE(active_updated, active)
        AND NOT active_lag
        AND as_of_subscription_start_timestamp::date = date
        AND first_subscription_start_timestamp::date != date
        THEN user_id
    END) AS recovered_users
FROM daily_user_activity_report_raw
WHERE date >= DATEADD(day, -30, CURRENT_DATE)
GROUP BY date
ORDER BY date DESC;
```

---

## Pattern 3: Churn Breakdown by Reason

**Source**: `churned_user_reports.sql` (QS2-Churned-Users)
**Use for**: "Why are users churning?", "Refund vs payment failed churn"

```sql
-- Fast path: Use pre-aggregated table
SELECT
    date,
    refunded,
    user_unsubscribed,
    payment_failed,
    delayed_renewal,
    reason_unknown,
    total_churned
FROM churn_breakdown_daily
WHERE date >= DATEADD(day, -30, CURRENT_DATE)
ORDER BY date DESC;

-- By platform
SELECT
    date,
    platform,
    SUM(CASE WHEN refunded THEN 1 ELSE 0 END) AS refunded,
    SUM(CASE WHEN user_unsubscribed AND NOT refunded THEN 1 ELSE 0 END) AS unsubscribed,
    SUM(CASE WHEN payment_failed THEN 1 ELSE 0 END) AS payment_failed,
    COUNT(*) AS total
FROM churn_breakdown_daily_by_users
WHERE date >= DATEADD(day, -30, CURRENT_DATE)
GROUP BY date, platform
ORDER BY date DESC, platform;
```

---

## Pattern 4: Recovery Rate Analysis

**Source**: `churned_user_reports.sql`
**Use for**: "What % of churned users come back?", "Recovery within 7 days"

```sql
SELECT
    date,
    COUNT(DISTINCT user_id) AS churned_users,
    SUM(CASE WHEN recovered THEN 1 ELSE 0 END) AS recovered_ever,
    SUM(CASE
        WHEN recovered
        AND EXTRACT(EPOCH FROM recovered_at - period_end) <= (7*60*60*24)
        THEN 1 ELSE 0
    END) AS recovered_within_7_days,
    ROUND(100.0 * SUM(CASE WHEN recovered THEN 1 ELSE 0 END) / COUNT(*), 2) AS recovery_rate_pct
FROM churn_breakdown_daily_by_users
WHERE date >= DATEADD(day, -90, CURRENT_DATE)
GROUP BY date
ORDER BY date DESC;
```

---

## Pattern 5: LTV/CAC Calculation

**Source**: `okr_reports.sql` (QS2-OKR-Pipeline)
**Use for**: "What's our LTV to CAC ratio?", "Unit economics"

```sql
-- Fast path: Use pre-computed tables
SELECT
    date,
    window,
    revenue,
    new_users,
    blended_ltv,
    total_cac,
    ltv_to_cac_ratio,
    ltv_per_user,
    cac_per_user,
    churn_percentage_monthly,
    churn_percentage_annual
FROM okr_ltv_to_cac_one_week_window  -- or _two_week_window, _one_month_window
WHERE date >= DATEADD(day, -90, CURRENT_DATE)
ORDER BY date DESC;

-- Monthly summary
SELECT
    date,
    window,
    revenue,
    new_users,
    ltv_to_cac_ratio,
    cac_per_user
FROM okr_ltv_to_cac_monthly
ORDER BY date DESC;
```

---

## Pattern 6: Feature Adoption Rate

**Source**: `okr_reports.sql`
**Use for**: "What % of users used feature X?", "Adoption by cohort"

```sql
-- Fast path
SELECT
    date,
    total_users,
    one_plus_feature_used_rate,
    two_plus_feature_used_rate,
    three_plus_feature_used_rate
FROM okr_feature_adoption_rate
WHERE date >= DATEADD(day, -90, CURRENT_DATE)
ORDER BY date DESC;

-- Custom feature check from PostHog
WITH feature_adopters AS (
    SELECT DISTINCT pe.distinct_id
    FROM analytics_events pe
    WHERE pe.event = '$screen'
      AND pe.screen_name IN ('feature_setup_success', 'feature_log_enabled')
      AND pe.timestamp >= DATEADD(day, -30, CURRENT_DATE)
),
all_active_users AS (
    SELECT DISTINCT u.posthog_uuid
    FROM users u
    WHERE COALESCE(u.active_updated, u.active) = TRUE
      AND u.valid_posthog_uuid = TRUE
)
SELECT
    COUNT(DISTINCT fa.distinct_id) AS adopted_users,
    COUNT(DISTINCT au.posthog_uuid) AS total_users,
    ROUND(100.0 * COUNT(DISTINCT fa.distinct_id) / NULLIF(COUNT(DISTINCT au.posthog_uuid), 0), 2) AS adoption_rate_pct
FROM all_active_users au
LEFT JOIN feature_adopters fa ON au.posthog_uuid = fa.distinct_id;
```

---

## Pattern 7: MAU with Platform Breakdown

**Source**: `okr_reports.sql`
**Use for**: "Monthly active users", "Web vs mobile breakdown"

```sql
-- Fast path: Pre-computed with projections
SELECT
    activity_month,
    data_type,  -- 'historical' or 'projected'
    total_mau,
    mau_web_only,
    mau_mobile_only,
    mau_both
FROM okr_mau
ORDER BY activity_month DESC;

-- Custom calculation
WITH active_events AS (
    SELECT
        distinct_id,
        timestamp AS event_timestamp,
        CASE
            WHEN event = '$pageview' THEN 'web'
            WHEN event = '$screen' THEN 'mobile'
        END AS platform
    FROM analytics_events
    WHERE timestamp >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '3 months'
      AND (
          (event = '$pageview' AND set_current_url LIKE '%app.yourcompany.com/%')
          OR (event = '$screen' AND screen_name IN (
              'us_pay_wallet_home', 'mobile_home_page', 'pay_wallet_home'
          ))
      )
),
monthly_user_activity AS (
    SELECT
        DATE_TRUNC('month', event_timestamp)::date AS activity_month,
        distinct_id,
        MAX(CASE WHEN platform = 'web' THEN 1 ELSE 0 END) AS on_web,
        MAX(CASE WHEN platform = 'mobile' THEN 1 ELSE 0 END) AS on_mobile
    FROM active_events
    GROUP BY 1, 2
)
SELECT
    activity_month,
    COUNT(DISTINCT distinct_id) AS total_mau,
    COUNT(DISTINCT CASE WHEN on_web = 1 AND on_mobile = 0 THEN distinct_id END) AS web_only,
    COUNT(DISTINCT CASE WHEN on_mobile = 1 AND on_web = 0 THEN distinct_id END) AS mobile_only,
    COUNT(DISTINCT CASE WHEN on_web = 1 AND on_mobile = 1 THEN distinct_id END) AS both
FROM monthly_user_activity
GROUP BY activity_month
ORDER BY activity_month DESC;
```

---

## Pattern 8: User Subscription Journey

**Source**: `step2_stripedata.py`
**Use for**: "Show me a user's subscription history", "Debug user state"

```sql
SELECT
    se.user_id,
    se.subscription_event,
    se.event_timestamp,
    se.platform,
    se.plan_info,
    se.amount_paid / 100.0 AS amount_dollars,
    se.amount_refunded / 100.0 AS refund_dollars,
    se.promo_codes,
    se.period_end
FROM subscription_events se
WHERE se.user_id = '<USER_ID>'
ORDER BY se.event_timestamp DESC;
```

---

## Pattern 9: Cohort Retention Analysis

**Source**: `user_activity_reports.sql`
**Use for**: "Retention by signup month", "Cohort analysis"

```sql
WITH user_cohorts AS (
    SELECT
        user_id,
        DATE_TRUNC('month', first_subscription_start_timestamp) AS cohort_month,
        first_subscription_platform,
        first_subscription_plan_info
    FROM users
    WHERE first_subscription_start_timestamp IS NOT NULL
),
daily_activity AS (
    SELECT
        uc.user_id,
        uc.cohort_month,
        DATEDIFF(month, uc.cohort_month, dua.date) AS months_since_signup,
        COALESCE(dua.active_updated, dua.active) AS is_active
    FROM user_cohorts uc
    JOIN daily_user_activity_report dua ON uc.user_id = dua.user_id
    WHERE dua.date = DATE_TRUNC('month', dua.date)  -- First of each month
)
SELECT
    cohort_month,
    months_since_signup,
    COUNT(DISTINCT user_id) AS users,
    SUM(CASE WHEN is_active THEN 1 ELSE 0 END) AS active_users,
    ROUND(100.0 * SUM(CASE WHEN is_active THEN 1 ELSE 0 END) / COUNT(DISTINCT user_id), 2) AS retention_pct
FROM daily_activity
WHERE cohort_month >= '2024-01-01'
  AND months_since_signup <= 12
GROUP BY cohort_month, months_since_signup
ORDER BY cohort_month DESC, months_since_signup;
```

---

## Pattern 10: Revenue by Platform/Plan

**Source**: `user_activity_reports.sql`
**Use for**: "Revenue breakdown", "Platform comparison"

```sql
SELECT
    date,
    as_of_subscription_platform AS platform,
    as_of_subscription_plan_info AS plan,
    COUNT(DISTINCT user_id) AS users,
    SUM(as_of_subscription_amount_paid_amortized) AS mrr,
    SUM(as_of_subscription_amount_paid_non_amortized) AS actual_payments
FROM daily_user_activity_report
WHERE date = CURRENT_DATE - 1
  AND COALESCE(active_updated, active) = TRUE
GROUP BY date, as_of_subscription_platform, as_of_subscription_plan_info
ORDER BY mrr DESC;
```

---

## Date Range Generation (Redshift Pattern)

**Critical**: Redshift doesn't support `generate_series()`. Use this pattern:

```sql
WITH date_range AS (
    SELECT
        DATE(CURRENT_DATE - ROW_NUMBER() OVER()) AS date
    FROM users  -- Use any table with enough rows
    LIMIT 365   -- Adjust as needed
)
SELECT * FROM date_range;
```

---

## When You're Unsure

1. **Ask for clarification** before generating SQL
   - "When you say 'active users', do you mean DAU or MAU?"
   - "Do you want payment-failed churn or voluntary churn?"
   - "What time period: yesterday, last 30 days, or historical?"

2. **Use pre-aggregated tables first**
   - `daily_key_metrics` for MRR, active users, new/churned
   - `churn_breakdown_daily` for churn reasons
   - `okr_*` tables for OKR metrics

3. **Document assumptions**
   - "I'm assuming this means [X]. Let me know if different."

4. **Reference the source**
   - See `knowledge/data-infrastructure.md` for pipeline details
   - See `knowledge/redshift-schema.md` for complete table list
