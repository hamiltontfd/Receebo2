import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/** Read-only, aggregate-only report. Date bounds select acquisition cohorts;
 * outcomes are observed through now, including after the cohort date range.
 */
export async function trialFunnelReport(from: Date, to: Date) {
  if (!Number.isFinite(+from) || !Number.isFinite(+to) || from >= to) throw new Error("Require from < to");
  const acquisition = await db.execute(sql`
    SELECT count(*)::int AS consent_accepted,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM trial_funnel_events t
        WHERE t.subject_id = c.subject_id AND t.event = 'account_trial_started'))::int AS trial_started,
      round(100.0 * count(*) FILTER (WHERE EXISTS (SELECT 1 FROM trial_funnel_events t
        WHERE t.subject_id = c.subject_id AND t.event = 'account_trial_started'))
        / NULLIF(count(*),0), 2) AS consent_to_trial_percent
    FROM trial_funnel_events c WHERE c.event = 'consent_accepted'
      AND c.occurred_at >= ${from} AND c.occurred_at < ${to}
  `);
  const conversion = await db.execute(sql`
    WITH cohorts AS (
      SELECT s.subject_id,
        COALESCE((SELECT interval FROM trial_funnel_events e WHERE e.subject_id = s.subject_id
          AND e.event = 'plan_selected' ORDER BY e.occurred_at, e.interval LIMIT 1), 'not_selected') AS interval,
        COALESCE((SELECT reason FROM trial_funnel_events e WHERE e.subject_id = s.subject_id
          AND e.event = 'paywall_viewed' ORDER BY e.occurred_at, e.reason LIMIT 1), 'not_viewed') AS paywall_reason
      FROM trial_funnel_events s WHERE s.event = 'account_trial_started'
        AND s.occurred_at >= ${from} AND s.occurred_at < ${to}
    ), stages AS (
      SELECT c.subject_id, c.interval, c.paywall_reason,
        bool_or(e.event = 'first_receipt_succeeded') AS first_receipt,
        bool_or(e.event = 'third_receipt_succeeded') AS third_receipt,
        bool_or(e.event = 'paywall_viewed') AS paywall,
        bool_or(e.event = 'plan_selected') AS selected,
        bool_or(e.event = 'checkout_canceled') AS canceled,
        bool_or(e.event = 'paid_activation_confirmed') AS paid,
        bool_or(e.event = 'paid_activation_confirmed' AND e.interval = 'monthly') AS paid_monthly,
        bool_or(e.event = 'paid_activation_confirmed' AND e.interval = 'yearly') AS paid_yearly
      FROM cohorts c JOIN trial_funnel_events e USING(subject_id)
      GROUP BY c.subject_id,c.interval,c.paywall_reason
    )
    SELECT CASE WHEN GROUPING(interval)=1 THEN 'all' ELSE interval END AS selected_interval,
      CASE WHEN GROUPING(paywall_reason)=1 THEN 'all' ELSE paywall_reason END AS paywall_reason,
      count(*)::int AS trials_started,
      count(*) FILTER(WHERE first_receipt)::int AS first_receipt,
      count(*) FILTER(WHERE third_receipt)::int AS third_receipt,
      count(*) FILTER(WHERE paywall)::int AS paywall_viewed,
      count(*) FILTER(WHERE selected)::int AS plan_selected,
      count(*) FILTER(WHERE canceled)::int AS checkout_canceled,
      count(*) FILTER(WHERE paid)::int AS paid_activated,
      count(*) FILTER(WHERE paid_monthly)::int AS paid_monthly,
      count(*) FILTER(WHERE paid_yearly)::int AS paid_yearly,
      round(100.0*count(*) FILTER(WHERE paid)/NULLIF(count(*),0),2) AS trial_to_paid_percent,
      round(100.0*count(*) FILTER(WHERE paid AND selected)/NULLIF(count(*) FILTER(WHERE selected),0),2) AS selected_to_paid_percent,
      round(100.0*count(*) FILTER(WHERE paid AND paywall)/NULLIF(count(*) FILTER(WHERE paywall),0),2) AS paywall_to_paid_percent
    FROM stages
    GROUP BY GROUPING SETS ((), (interval), (paywall_reason), (interval,paywall_reason))
    ORDER BY selected_interval,paywall_reason
  `);
  return {
    from: from.toISOString(), toExclusive: to.toISOString(), observedThrough: new Date().toISOString(),
    acquisition: acquisition.rows[0], conversion: conversion.rows,
  };
}
