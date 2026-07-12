/*
# Notification Center — Core Tables

## Overview
Creates the foundational notification infrastructure: inbox, push subscriptions,
outbox queue, delivery tracking, user preferences, templates, and campaigns.

## 1. New Tables

### notification_inbox
- id (uuid, PK) — unique notification identifier
- user_id (uuid, FK→auth.users) — recipient
- event_key (text) — machine-readable event type e.g. 'payment_approved'
- category (text) — PAYMENT/ORDER/SERVICE/GAME/PRIZE/CHAT/ACCOUNT/SECURITY/MARKETING/SYSTEM
- title_ar, title_en (text) — bilingual title
- body_ar, body_en (text) — bilingual body
- icon_url, image_url (text, nullable) — visual assets
- deep_link (text, nullable) — internal route e.g. /orders/{id}
- entity_type (text, nullable) — linked entity type
- entity_id (uuid, nullable) — linked entity id
- priority (text) — LOW/NORMAL/HIGH/CRITICAL
- is_read (boolean) — read state
- read_at (timestamptz, nullable) — when read
- expires_at (timestamptz, nullable) — auto-expire
- created_at (timestamptz) — insertion time

### push_subscriptions
- id (uuid, PK)
- user_id (uuid, FK→auth.users)
- endpoint (text) — Web Push endpoint URL
- endpoint_hash (text, unique) — SHA-256 hash for dedup
- p256dh, auth_key (text) — encryption keys (sensitive)
- user_agent, platform, browser_family, device_label (text) — device metadata
- locale, timezone (text) — localization
- permission_state (text) — granted/denied/default
- is_active (boolean) — active subscription flag
- failure_count (int) — consecutive failures
- last_success_at, last_failure_at (timestamptz) — health tracking
- last_failure_code (text) — last error code
- created_at, updated_at (timestamptz)

### notification_outbox
- id (uuid, PK)
- notification_id (uuid, FK→notification_inbox)
- user_id (uuid, FK→auth.users)
- channel (text) — IN_APP/WEB_PUSH/EMAIL
- status (text) — QUEUED/PROCESSING/PROVIDER_ACCEPTED/DISPLAYED/OPENED/FAILED_RETRYABLE/FAILED_PERMANENT/EXPIRED/SUPPRESSED
- attempt_count (int)
- available_at (timestamptz) — next eligible processing time
- locked_at, locked_by (text) — worker claim
- last_error_code, last_error_message (text)
- provider_message_id (text)
- expires_at (timestamptz)
- idempotency_key (text, unique) — prevents duplicates
- created_at, completed_at (timestamptz)

### notification_deliveries
- Per-attempt delivery record for audit
- Links notification, outbox, subscription
- Tracks sent/displayed/opened/failed states

### notification_preferences
- user_id (uuid, PK, FK→auth.users)
- Per-category toggle flags
- Quiet hours config
- push_enabled, email_enabled, marketing_enabled

### notification_templates
- id (uuid, PK)
- template_key (text, unique)
- Category, bilingual title/body, variables, channels, priority

### notification_campaigns
- id (uuid, PK)
- Campaign lifecycle: DRAFT→SCHEDULED→PROCESSING→COMPLETED/PAUSED/CANCELLED/FAILED
- Audience definition (jsonb)
- Targeting and scheduling

### notification_audit_log
- Admin action tracking for notification system changes

## 2. Security
- RLS enabled on ALL tables
- Users read only own inbox, preferences, delivery status
- Push subscription secrets hidden from normal client queries
- Admins (via is_admin_role()) manage templates, campaigns, audit
- Outbox/deliveries restricted to service role (edge functions)

## 3. Indexes
- notification_inbox: user_id+is_read, user_id+created_at, user_id+category
- push_subscriptions: user_id+is_active, endpoint_hash
- notification_outbox: status+available_at (queue polling), notification_id
- notification_deliveries: notification_id+subscription_id (dedup)
- notification_templates: template_key
- notification_campaigns: status
*/

-- ══════════════════════════════════════════════════════════════════
-- 1. notification_inbox
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS notification_inbox (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  event_key   text NOT NULL,
  category    text NOT NULL CHECK (category IN (
    'PAYMENT','ORDER','SERVICE','GAME','PRIZE','CHAT','ACCOUNT','SECURITY','MARKETING','SYSTEM'
  )),
  title_ar    text NOT NULL,
  title_en    text,
  body_ar     text NOT NULL,
  body_en     text,
  icon_url    text,
  image_url   text,
  deep_link   text,
  entity_type text,
  entity_id   uuid,
  priority    text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','CRITICAL')),
  is_read     boolean NOT NULL DEFAULT false,
  read_at     timestamptz,
  expires_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_inbox ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_notif_inbox_user_unread
  ON notification_inbox (user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notif_inbox_user_created
  ON notification_inbox (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_inbox_user_category
  ON notification_inbox (user_id, category);
CREATE INDEX IF NOT EXISTS idx_notif_inbox_expires
  ON notification_inbox (expires_at) WHERE expires_at IS NOT NULL;

DROP POLICY IF EXISTS "notif_inbox_select_own" ON notification_inbox;
CREATE POLICY "notif_inbox_select_own" ON notification_inbox FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notif_inbox_insert_service" ON notification_inbox;
CREATE POLICY "notif_inbox_insert_service" ON notification_inbox FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true)
  );

DROP POLICY IF EXISTS "notif_inbox_update_own" ON notification_inbox;
CREATE POLICY "notif_inbox_update_own" ON notification_inbox FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notif_inbox_delete_own" ON notification_inbox;
CREATE POLICY "notif_inbox_delete_own" ON notification_inbox FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════════
-- 2. push_subscriptions
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint         text NOT NULL,
  endpoint_hash    text NOT NULL UNIQUE,
  p256dh           text NOT NULL,
  auth_key         text NOT NULL,
  user_agent       text,
  platform         text,
  browser_family   text,
  device_label     text,
  locale           text,
  timezone         text,
  permission_state text NOT NULL DEFAULT 'granted',
  is_active        boolean NOT NULL DEFAULT true,
  failure_count    integer NOT NULL DEFAULT 0,
  last_success_at  timestamptz,
  last_failure_at  timestamptz,
  last_failure_code text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_push_sub_user_active
  ON push_subscriptions (user_id, is_active) WHERE is_active = true;

-- Users can see their own subscription metadata (NOT secrets)
DROP POLICY IF EXISTS "push_sub_select_own_meta" ON push_subscriptions;
CREATE POLICY "push_sub_select_own_meta" ON push_subscriptions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- Users register their own subscriptions via RPC (not direct insert)
DROP POLICY IF EXISTS "push_sub_insert_own" ON push_subscriptions;
CREATE POLICY "push_sub_insert_own" ON push_subscriptions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_sub_update_own" ON push_subscriptions;
CREATE POLICY "push_sub_update_own" ON push_subscriptions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_sub_delete_own" ON push_subscriptions;
CREATE POLICY "push_sub_delete_own" ON push_subscriptions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════════
-- 3. notification_outbox
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS notification_outbox (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id    uuid NOT NULL REFERENCES notification_inbox(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel            text NOT NULL CHECK (channel IN ('IN_APP','WEB_PUSH','EMAIL')),
  status             text NOT NULL DEFAULT 'QUEUED' CHECK (status IN (
    'QUEUED','PROCESSING','PROVIDER_ACCEPTED','DISPLAYED','OPENED',
    'FAILED_RETRYABLE','FAILED_PERMANENT','EXPIRED','SUPPRESSED'
  )),
  attempt_count      integer NOT NULL DEFAULT 0,
  available_at       timestamptz NOT NULL DEFAULT now(),
  locked_at          timestamptz,
  locked_by          text,
  last_error_code    text,
  last_error_message text,
  provider_message_id text,
  expires_at         timestamptz,
  idempotency_key    text NOT NULL UNIQUE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz
);

ALTER TABLE notification_outbox ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_notif_outbox_queue
  ON notification_outbox (status, available_at)
  WHERE status IN ('QUEUED','FAILED_RETRYABLE');
CREATE INDEX IF NOT EXISTS idx_notif_outbox_notif
  ON notification_outbox (notification_id);
CREATE INDEX IF NOT EXISTS idx_notif_outbox_user
  ON notification_outbox (user_id);

-- Outbox is managed by service role (edge functions) — users read only own delivery status
DROP POLICY IF EXISTS "notif_outbox_select_own" ON notification_outbox;
CREATE POLICY "notif_outbox_select_own" ON notification_outbox FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notif_outbox_insert_admin" ON notification_outbox;
CREATE POLICY "notif_outbox_insert_admin" ON notification_outbox FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true)
  );

DROP POLICY IF EXISTS "notif_outbox_update_admin" ON notification_outbox;
CREATE POLICY "notif_outbox_update_admin" ON notification_outbox FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true));

-- ══════════════════════════════════════════════════════════════════
-- 4. notification_deliveries
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id     uuid NOT NULL REFERENCES notification_inbox(id) ON DELETE CASCADE,
  outbox_id           uuid NOT NULL REFERENCES notification_outbox(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id     uuid REFERENCES push_subscriptions(id) ON DELETE SET NULL,
  channel             text NOT NULL,
  attempt_number      integer NOT NULL DEFAULT 1,
  status              text NOT NULL DEFAULT 'SENT',
  provider_status     text,
  provider_message_id text,
  sent_at             timestamptz NOT NULL DEFAULT now(),
  displayed_at        timestamptz,
  opened_at           timestamptz,
  failed_at           timestamptz,
  failure_code        text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_notif_del_notif_sub
  ON notification_deliveries (notification_id, subscription_id);
CREATE INDEX IF NOT EXISTS idx_notif_del_user
  ON notification_deliveries (user_id);

DROP POLICY IF EXISTS "notif_del_select_own" ON notification_deliveries;
CREATE POLICY "notif_del_select_own" ON notification_deliveries FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notif_del_insert_admin" ON notification_deliveries;
CREATE POLICY "notif_del_insert_admin" ON notification_deliveries FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true)
  );

DROP POLICY IF EXISTS "notif_del_update_admin" ON notification_deliveries;
CREATE POLICY "notif_del_update_admin" ON notification_deliveries FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true));

-- ══════════════════════════════════════════════════════════════════
-- 5. notification_preferences
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id                uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  push_enabled           boolean NOT NULL DEFAULT true,
  email_enabled          boolean NOT NULL DEFAULT false,
  marketing_enabled      boolean NOT NULL DEFAULT false,
  payment_notifications  boolean NOT NULL DEFAULT true,
  service_notifications  boolean NOT NULL DEFAULT true,
  game_notifications     boolean NOT NULL DEFAULT true,
  prize_notifications    boolean NOT NULL DEFAULT true,
  chat_notifications     boolean NOT NULL DEFAULT true,
  security_notifications boolean NOT NULL DEFAULT true,
  quiet_hours_enabled    boolean NOT NULL DEFAULT false,
  quiet_hours_start      time DEFAULT '23:00',
  quiet_hours_end        time DEFAULT '07:00',
  timezone               text DEFAULT 'Africa/Tripoli',
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_pref_select_own" ON notification_preferences;
CREATE POLICY "notif_pref_select_own" ON notification_preferences FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notif_pref_insert_own" ON notification_preferences;
CREATE POLICY "notif_pref_insert_own" ON notification_preferences FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notif_pref_update_own" ON notification_preferences;
CREATE POLICY "notif_pref_update_own" ON notification_preferences FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notif_pref_delete_own" ON notification_preferences;
CREATE POLICY "notif_pref_delete_own" ON notification_preferences FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════════
-- 6. notification_templates
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS notification_templates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key     text NOT NULL UNIQUE,
  category         text NOT NULL,
  title_ar         text NOT NULL,
  title_en         text,
  body_ar          text NOT NULL,
  body_en          text,
  default_deep_link text,
  default_priority  text NOT NULL DEFAULT 'NORMAL',
  allowed_variables jsonb NOT NULL DEFAULT '[]',
  default_channels  jsonb NOT NULL DEFAULT '["IN_APP","WEB_PUSH"]',
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;

-- Admin-only table
DROP POLICY IF EXISTS "notif_tmpl_select_admin" ON notification_templates;
CREATE POLICY "notif_tmpl_select_admin" ON notification_templates FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true)
  );

DROP POLICY IF EXISTS "notif_tmpl_insert_admin" ON notification_templates;
CREATE POLICY "notif_tmpl_insert_admin" ON notification_templates FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true)
  );

DROP POLICY IF EXISTS "notif_tmpl_update_admin" ON notification_templates;
CREATE POLICY "notif_tmpl_update_admin" ON notification_templates FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true));

DROP POLICY IF EXISTS "notif_tmpl_delete_admin" ON notification_templates;
CREATE POLICY "notif_tmpl_delete_admin" ON notification_templates FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true)
  );

-- ══════════════════════════════════════════════════════════════════
-- 7. notification_campaigns
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS notification_campaigns (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  campaign_type       text NOT NULL DEFAULT 'BROADCAST',
  audience_definition jsonb NOT NULL DEFAULT '{}',
  template_id         uuid REFERENCES notification_templates(id),
  title_ar            text,
  title_en            text,
  body_ar             text,
  body_en             text,
  image_url           text,
  deep_link           text,
  channels            jsonb NOT NULL DEFAULT '["IN_APP","WEB_PUSH"]',
  scheduled_at        timestamptz,
  expires_at          timestamptz,
  status              text NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT','SCHEDULED','PROCESSING','COMPLETED','PAUSED','CANCELLED','FAILED'
  )),
  total_targeted      integer NOT NULL DEFAULT 0,
  total_sent          integer NOT NULL DEFAULT 0,
  total_displayed     integer NOT NULL DEFAULT 0,
  total_opened        integer NOT NULL DEFAULT 0,
  total_failed        integer NOT NULL DEFAULT 0,
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  started_at          timestamptz,
  completed_at        timestamptz
);

ALTER TABLE notification_campaigns ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_notif_camp_status ON notification_campaigns (status);

DROP POLICY IF EXISTS "notif_camp_select_admin" ON notification_campaigns;
CREATE POLICY "notif_camp_select_admin" ON notification_campaigns FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true)
  );

DROP POLICY IF EXISTS "notif_camp_insert_admin" ON notification_campaigns;
CREATE POLICY "notif_camp_insert_admin" ON notification_campaigns FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true)
  );

DROP POLICY IF EXISTS "notif_camp_update_admin" ON notification_campaigns;
CREATE POLICY "notif_camp_update_admin" ON notification_campaigns FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true));

DROP POLICY IF EXISTS "notif_camp_delete_admin" ON notification_campaigns;
CREATE POLICY "notif_camp_delete_admin" ON notification_campaigns FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true)
  );

-- ══════════════════════════════════════════════════════════════════
-- 8. notification_automation_rules
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS notification_automation_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key     text NOT NULL UNIQUE,
  template_id   uuid REFERENCES notification_templates(id),
  enabled       boolean NOT NULL DEFAULT true,
  channels      jsonb NOT NULL DEFAULT '["IN_APP","WEB_PUSH"]',
  delay_seconds integer NOT NULL DEFAULT 0,
  priority      text NOT NULL DEFAULT 'NORMAL',
  expires_hours integer NOT NULL DEFAULT 168,
  frequency_cap integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_automation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_auto_select_admin" ON notification_automation_rules;
CREATE POLICY "notif_auto_select_admin" ON notification_automation_rules FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true)
  );

DROP POLICY IF EXISTS "notif_auto_insert_admin" ON notification_automation_rules;
CREATE POLICY "notif_auto_insert_admin" ON notification_automation_rules FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true)
  );

DROP POLICY IF EXISTS "notif_auto_update_admin" ON notification_automation_rules;
CREATE POLICY "notif_auto_update_admin" ON notification_automation_rules FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true));

DROP POLICY IF EXISTS "notif_auto_delete_admin" ON notification_automation_rules;
CREATE POLICY "notif_auto_delete_admin" ON notification_automation_rules FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true)
  );

-- ══════════════════════════════════════════════════════════════════
-- 9. notification_audit_log
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS notification_audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     uuid REFERENCES auth.users(id),
  action_type  text NOT NULL,
  entity_type  text,
  entity_id    uuid,
  details      jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_audit_select_admin" ON notification_audit_log;
CREATE POLICY "notif_audit_select_admin" ON notification_audit_log FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true)
  );

DROP POLICY IF EXISTS "notif_audit_insert_admin" ON notification_audit_log;
CREATE POLICY "notif_audit_insert_admin" ON notification_audit_log FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true)
  );

-- ══════════════════════════════════════════════════════════════════
-- 10. notification_settings (global admin config)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS notification_settings (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  max_marketing_push_per_day  integer NOT NULL DEFAULT 3,
  min_marketing_interval_mins integer NOT NULL DEFAULT 60,
  game_reminder_limit_per_day integer NOT NULL DEFAULT 2,
  campaign_batch_size         integer NOT NULL DEFAULT 100,
  default_ttl_hours           integer NOT NULL DEFAULT 168,
  max_retry_attempts          integer NOT NULL DEFAULT 5,
  quiet_hours_enabled_global  boolean NOT NULL DEFAULT false,
  quiet_hours_start           time DEFAULT '23:00',
  quiet_hours_end             time DEFAULT '07:00',
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_settings_select_admin" ON notification_settings;
CREATE POLICY "notif_settings_select_admin" ON notification_settings FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true)
  );

DROP POLICY IF EXISTS "notif_settings_update_admin" ON notification_settings;
CREATE POLICY "notif_settings_update_admin" ON notification_settings FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true));

-- Seed default settings row
INSERT INTO notification_settings (id) VALUES (gen_random_uuid())
ON CONFLICT DO NOTHING;

-- Enable realtime on notification_inbox for live bell updates
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notification_inbox'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notification_inbox;
  END IF;
END $$;
