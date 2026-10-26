import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/** Also used by integration tests; no historical activity is fabricated. */
export async function migrateTrialFunnel() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS trial_funnel_subjects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS trial_funnel_events (
      subject_id uuid NOT NULL REFERENCES trial_funnel_subjects(id) ON DELETE CASCADE,
      event text NOT NULL CHECK (event IN ('consent_accepted','account_trial_started',
        'first_receipt_succeeded','third_receipt_succeeded','receipt_limit_reached','paywall_viewed',
        'plan_selected','checkout_canceled','paid_activation_confirmed')),
      dimension text NOT NULL DEFAULT 'none',
      interval text CHECK (interval IN ('monthly','yearly')),
      reason text CHECK (reason IN ('trial_expired','trial_exhausted')),
      occurred_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(subject_id,event,dimension)
    );
    CREATE INDEX IF NOT EXISTS trial_funnel_events_time ON trial_funnel_events(occurred_at);
    -- Existing tables: widen the event check to include receipt_limit_reached.
    ALTER TABLE trial_funnel_events DROP CONSTRAINT IF EXISTS trial_funnel_events_event_check;
    ALTER TABLE trial_funnel_events ADD CONSTRAINT trial_funnel_events_event_check CHECK (event IN ('consent_accepted','account_trial_started',
      'first_receipt_succeeded','third_receipt_succeeded','receipt_limit_reached','paywall_viewed',
      'plan_selected','checkout_canceled','paid_activation_confirmed'));
    CREATE TABLE IF NOT EXISTS trial_funnel_checkouts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      subject_id uuid NOT NULL REFERENCES trial_funnel_subjects(id) ON DELETE CASCADE,
      interval text NOT NULL CHECK (interval IN ('monthly','yearly')),
      reason text CHECK (reason IN ('trial_expired','trial_exhausted')),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE OR REPLACE FUNCTION record_trial_funnel_milestone() RETURNS trigger AS $$
    DECLARE sid uuid; uses integer;
    BEGIN
      IF TG_TABLE_NAME = 'legal_acceptances' THEN
        IF EXISTS (SELECT 1 FROM account_trials WHERE user_id = NEW.user_id)
          OR EXISTS (SELECT 1 FROM user_billing WHERE user_id = NEW.user_id AND stripe_subscription_id IS NOT NULL)
          THEN RETURN NEW; END IF;
        INSERT INTO trial_funnel_subjects(user_id) VALUES(NEW.user_id) ON CONFLICT DO NOTHING;
        SELECT id INTO sid FROM trial_funnel_subjects WHERE user_id = NEW.user_id;
        INSERT INTO trial_funnel_events(subject_id,event,occurred_at)
          VALUES(sid,'consent_accepted',NEW.accepted_at) ON CONFLICT DO NOTHING;
      ELSIF TG_TABLE_NAME = 'account_trials' THEN
        -- Existing accepted users can start a new no-card trial, but do not
        -- invent a consent event for them.
        INSERT INTO trial_funnel_subjects(user_id) VALUES(NEW.user_id) ON CONFLICT DO NOTHING;
        SELECT id INTO sid FROM trial_funnel_subjects WHERE user_id = NEW.user_id;
        INSERT INTO trial_funnel_events(subject_id,event,occurred_at)
          VALUES(sid,'account_trial_started',NEW.started_at) ON CONFLICT DO NOTHING;
      ELSIF NEW.state = 'succeeded' THEN
        -- Serialize simultaneous successes, including Gmail and guest claims.
        PERFORM 1 FROM account_trials WHERE user_id = NEW.user_id FOR UPDATE;
        SELECT id INTO sid FROM trial_funnel_subjects WHERE user_id = NEW.user_id;
        IF sid IS NULL OR NOT EXISTS (SELECT 1 FROM trial_funnel_events
          WHERE subject_id = sid AND event = 'account_trial_started') THEN RETURN NEW; END IF;
        SELECT count(*) INTO uses FROM trial_uploads WHERE user_id = NEW.user_id AND state = 'succeeded';
        IF uses >= 1 THEN
          INSERT INTO trial_funnel_events(subject_id,event) VALUES(sid,'first_receipt_succeeded') ON CONFLICT DO NOTHING;
        END IF;
        IF uses >= 3 THEN
          INSERT INTO trial_funnel_events(subject_id,event) VALUES(sid,'third_receipt_succeeded') ON CONFLICT DO NOTHING;
        END IF;
        -- Trial cap (TRIAL_LIMIT = 5): adding is blocked from here, viewing continues.
        IF uses >= 5 THEN
          INSERT INTO trial_funnel_events(subject_id,event) VALUES(sid,'receipt_limit_reached') ON CONFLICT DO NOTHING;
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    DROP TRIGGER IF EXISTS funnel_consent ON legal_acceptances;
    CREATE TRIGGER funnel_consent AFTER INSERT ON legal_acceptances FOR EACH ROW EXECUTE FUNCTION record_trial_funnel_milestone();
    DROP TRIGGER IF EXISTS funnel_trial ON account_trials;
    CREATE TRIGGER funnel_trial AFTER INSERT ON account_trials FOR EACH ROW EXECUTE FUNCTION record_trial_funnel_milestone();
    DROP TRIGGER IF EXISTS funnel_receipt ON trial_uploads;
    CREATE TRIGGER funnel_receipt AFTER INSERT OR UPDATE OF state ON trial_uploads FOR EACH ROW EXECUTE FUNCTION record_trial_funnel_milestone();
  `);
}
