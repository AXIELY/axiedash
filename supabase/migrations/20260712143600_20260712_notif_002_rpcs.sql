/*
# Notification Center — RPCs and Helper Functions

## Overview
Server-side functions for the notification system:
- create_notification_event: Idempotent notification creation with outbox jobs
- register_push_subscription: Safe subscription registration with dedup
- deactivate_push_subscription: Logout-safe subscription removal
- ack_notification_displayed/opened: Delivery status tracking
- mark_notification_read / mark_all_notifications_read: Inbox management
- get_unread_notification_count: Bell badge count
- get_notification_stats: Admin dashboard metrics
- send_admin_notification: Admin single/bulk notification send

## Security
- All functions use SECURITY DEFINER with search_path = public
- Auth checks via auth.uid() and is_admin_role()
- Idempotency prevents duplicate notifications
*/

-- ══════════════════════════════════════════════════════════════════
-- Helper: ensure notification preferences row exists
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION ensure_notification_preferences(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notification_preferences (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

-- ══════════════════════════════════════════════════════════════════
-- create_notification_event
-- The single authoritative entry point for creating notifications.
-- Idempotent: duplicate idempotency_key returns existing notification.
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION create_notification_event(
  p_user_id         uuid,
  p_template_key    text,
  p_variables       jsonb DEFAULT '{}',
  p_entity_type     text DEFAULT NULL,
  p_entity_id       uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_channel_override jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tmpl             notification_templates%ROWTYPE;
  v_notif_id         uuid;
  v_title_ar         text;
  v_title_en         text;
  v_body_ar          text;
  v_body_en          text;
  v_deep_link        text;
  v_channels         jsonb;
  v_idem_key         text;
  v_existing_outbox  uuid;
  v_prefs            notification_preferences%ROWTYPE;
  v_category_enabled boolean;
  v_ch               text;
BEGIN
  -- Load template
  SELECT * INTO v_tmpl FROM notification_templates
  WHERE template_key = p_template_key AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'template_not_found');
  END IF;

  -- Build idempotency key
  v_idem_key := COALESCE(p_idempotency_key, p_template_key || ':' || p_user_id || ':' || COALESCE(p_entity_id::text, gen_random_uuid()::text));

  -- Check idempotency — return existing if already processed
  SELECT id INTO v_existing_outbox FROM notification_outbox WHERE idempotency_key = v_idem_key LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'idempotent_replay', true);
  END IF;

  -- Interpolate template variables
  v_title_ar := v_tmpl.title_ar;
  v_title_en := COALESCE(v_tmpl.title_en, v_tmpl.title_ar);
  v_body_ar  := v_tmpl.body_ar;
  v_body_en  := COALESCE(v_tmpl.body_en, v_tmpl.body_ar);
  v_deep_link := v_tmpl.default_deep_link;

  -- Simple variable substitution from p_variables
  IF p_variables IS NOT NULL AND jsonb_typeof(p_variables) = 'object' THEN
    DECLARE
      v_key text;
      v_val text;
    BEGIN
      FOR v_key, v_val IN SELECT key, value#>>'{}'  FROM jsonb_each(p_variables) LOOP
        v_title_ar := replace(v_title_ar, '{{' || v_key || '}}', COALESCE(v_val, ''));
        v_title_en := replace(v_title_en, '{{' || v_key || '}}', COALESCE(v_val, ''));
        v_body_ar  := replace(v_body_ar,  '{{' || v_key || '}}', COALESCE(v_val, ''));
        v_body_en  := replace(v_body_en,  '{{' || v_key || '}}', COALESCE(v_val, ''));
        v_deep_link := replace(COALESCE(v_deep_link, ''), '{{' || v_key || '}}', COALESCE(v_val, ''));
      END LOOP;
    END;
  END IF;

  IF v_deep_link = '' THEN v_deep_link := NULL; END IF;

  -- Insert inbox notification
  INSERT INTO notification_inbox (
    user_id, event_key, category, title_ar, title_en, body_ar, body_en,
    deep_link, entity_type, entity_id, priority,
    expires_at
  )
  VALUES (
    p_user_id, p_template_key, v_tmpl.category, v_title_ar, v_title_en,
    v_body_ar, v_body_en, v_deep_link, p_entity_type, p_entity_id,
    v_tmpl.default_priority,
    CASE WHEN v_tmpl.default_priority = 'LOW' THEN now() + interval '72 hours'
         ELSE NULL END
  )
  RETURNING id INTO v_notif_id;

  -- Determine channels
  v_channels := COALESCE(p_channel_override, v_tmpl.default_channels);

  -- Load user preferences
  PERFORM ensure_notification_preferences(p_user_id);
  SELECT * INTO v_prefs FROM notification_preferences WHERE user_id = p_user_id;

  -- Check category preference
  v_category_enabled := CASE v_tmpl.category
    WHEN 'PAYMENT' THEN COALESCE(v_prefs.payment_notifications, true)
    WHEN 'ORDER'   THEN COALESCE(v_prefs.payment_notifications, true)
    WHEN 'SERVICE' THEN COALESCE(v_prefs.service_notifications, true)
    WHEN 'GAME'    THEN COALESCE(v_prefs.game_notifications, true)
    WHEN 'PRIZE'   THEN COALESCE(v_prefs.prize_notifications, true)
    WHEN 'CHAT'    THEN COALESCE(v_prefs.chat_notifications, true)
    WHEN 'SECURITY' THEN true  -- always enabled
    WHEN 'ACCOUNT'  THEN true  -- always enabled
    WHEN 'MARKETING' THEN COALESCE(v_prefs.marketing_enabled, false)
    ELSE true
  END;

  -- Create outbox jobs for each channel
  FOR v_ch IN SELECT jsonb_array_elements_text(v_channels) LOOP
    -- Skip WEB_PUSH if push disabled or category disabled
    IF v_ch = 'WEB_PUSH' AND (NOT v_prefs.push_enabled OR NOT v_category_enabled) THEN
      INSERT INTO notification_outbox (notification_id, user_id, channel, status, idempotency_key)
      VALUES (v_notif_id, p_user_id, v_ch, 'SUPPRESSED', v_idem_key || ':' || v_ch);
      CONTINUE;
    END IF;

    -- Skip EMAIL if email disabled
    IF v_ch = 'EMAIL' AND NOT v_prefs.email_enabled THEN
      INSERT INTO notification_outbox (notification_id, user_id, channel, status, idempotency_key)
      VALUES (v_notif_id, p_user_id, v_ch, 'SUPPRESSED', v_idem_key || ':' || v_ch);
      CONTINUE;
    END IF;

    -- Skip marketing if opt-out
    IF v_tmpl.category = 'MARKETING' AND NOT v_prefs.marketing_enabled AND v_ch != 'IN_APP' THEN
      INSERT INTO notification_outbox (notification_id, user_id, channel, status, idempotency_key)
      VALUES (v_notif_id, p_user_id, v_ch, 'SUPPRESSED', v_idem_key || ':' || v_ch);
      CONTINUE;
    END IF;

    -- IN_APP is always "delivered" immediately (it's in the inbox)
    IF v_ch = 'IN_APP' THEN
      INSERT INTO notification_outbox (notification_id, user_id, channel, status, idempotency_key, completed_at)
      VALUES (v_notif_id, p_user_id, 'IN_APP', 'DISPLAYED', v_idem_key || ':IN_APP', now());
    ELSE
      INSERT INTO notification_outbox (notification_id, user_id, channel, status, idempotency_key)
      VALUES (v_notif_id, p_user_id, v_ch, 'QUEUED', v_idem_key || ':' || v_ch);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'notification_id', v_notif_id);
END;
$$;

-- ══════════════════════════════════════════════════════════════════
-- register_push_subscription
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION register_push_subscription(
  p_endpoint      text,
  p_p256dh        text,
  p_auth_key      text,
  p_user_agent    text DEFAULT NULL,
  p_platform      text DEFAULT NULL,
  p_browser_family text DEFAULT NULL,
  p_device_label  text DEFAULT NULL,
  p_timezone      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid := auth.uid();
  v_hash         text;
  v_existing     push_subscriptions%ROWTYPE;
  v_sub_id       uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthenticated');
  END IF;

  v_hash := encode(digest(p_endpoint, 'sha256'), 'hex');

  -- Check for existing subscription with this endpoint
  SELECT * INTO v_existing FROM push_subscriptions WHERE endpoint_hash = v_hash;

  IF FOUND THEN
    -- Rebind to current user (handles multi-account device safety)
    UPDATE push_subscriptions SET
      user_id = v_user_id,
      p256dh = p_p256dh,
      auth_key = p_auth_key,
      user_agent = COALESCE(p_user_agent, user_agent),
      platform = COALESCE(p_platform, platform),
      browser_family = COALESCE(p_browser_family, browser_family),
      device_label = COALESCE(p_device_label, device_label),
      timezone = COALESCE(p_timezone, timezone),
      is_active = true,
      failure_count = 0,
      permission_state = 'granted',
      updated_at = now()
    WHERE endpoint_hash = v_hash
    RETURNING id INTO v_sub_id;
  ELSE
    INSERT INTO push_subscriptions (
      user_id, endpoint, endpoint_hash, p256dh, auth_key,
      user_agent, platform, browser_family, device_label, timezone
    )
    VALUES (
      v_user_id, p_endpoint, v_hash, p_p256dh, p_auth_key,
      p_user_agent, p_platform, p_browser_family, p_device_label, p_timezone
    )
    RETURNING id INTO v_sub_id;
  END IF;

  -- Ensure preferences exist
  PERFORM ensure_notification_preferences(v_user_id);

  RETURN jsonb_build_object('success', true, 'subscription_id', v_sub_id);
END;
$$;

-- ══════════════════════════════════════════════════════════════════
-- deactivate_push_subscription (called on logout)
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION deactivate_push_subscription(p_endpoint text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_hash    text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthenticated');
  END IF;

  v_hash := encode(digest(p_endpoint, 'sha256'), 'hex');

  UPDATE push_subscriptions SET
    is_active = false,
    updated_at = now()
  WHERE endpoint_hash = v_hash AND user_id = v_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ══════════════════════════════════════════════════════════════════
-- ack_notification_displayed
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION ack_notification_displayed(
  p_notification_id uuid,
  p_subscription_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update outbox
  UPDATE notification_outbox SET
    status = 'DISPLAYED',
    completed_at = now()
  WHERE notification_id = p_notification_id
    AND user_id = auth.uid()
    AND channel = 'WEB_PUSH'
    AND status IN ('QUEUED','PROCESSING','PROVIDER_ACCEPTED');

  -- Update delivery record
  UPDATE notification_deliveries SET
    displayed_at = now(),
    status = 'DISPLAYED'
  WHERE notification_id = p_notification_id
    AND user_id = auth.uid()
    AND (p_subscription_id IS NULL OR subscription_id = p_subscription_id)
    AND displayed_at IS NULL;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ══════════════════════════════════════════════════════════════════
-- ack_notification_opened
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION ack_notification_opened(p_notification_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Mark inbox as read
  UPDATE notification_inbox SET
    is_read = true,
    read_at = COALESCE(read_at, now())
  WHERE id = p_notification_id AND user_id = auth.uid();

  -- Update outbox
  UPDATE notification_outbox SET
    status = 'OPENED',
    completed_at = COALESCE(completed_at, now())
  WHERE notification_id = p_notification_id AND user_id = auth.uid();

  -- Update deliveries
  UPDATE notification_deliveries SET
    opened_at = now(),
    status = 'OPENED'
  WHERE notification_id = p_notification_id
    AND user_id = auth.uid()
    AND opened_at IS NULL;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ══════════════════════════════════════════════════════════════════
-- mark_notification_read / mark_all_notifications_read
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION mark_notification_read(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE notification_inbox SET
    is_read = true,
    read_at = COALESCE(read_at, now())
  WHERE id = p_notification_id AND user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION mark_all_notifications_read()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE notification_inbox SET
    is_read = true,
    read_at = now()
  WHERE user_id = auth.uid() AND is_read = false;
END;
$$;

-- ══════════════════════════════════════════════════════════════════
-- get_unread_notification_count
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_unread_notification_count()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM notification_inbox
  WHERE user_id = auth.uid()
    AND is_read = false
    AND (expires_at IS NULL OR expires_at > now());
  RETURN v_count;
END;
$$;

-- ══════════════════════════════════════════════════════════════════
-- get_notification_stats (admin dashboard)
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_notification_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT jsonb_build_object(
    'active_push_users', (SELECT COUNT(DISTINCT user_id) FROM push_subscriptions WHERE is_active = true),
    'active_subscriptions', (SELECT COUNT(*) FROM push_subscriptions WHERE is_active = true),
    'android_subs', (SELECT COUNT(*) FROM push_subscriptions WHERE is_active = true AND platform = 'android'),
    'ios_subs', (SELECT COUNT(*) FROM push_subscriptions WHERE is_active = true AND platform = 'ios'),
    'desktop_subs', (SELECT COUNT(*) FROM push_subscriptions WHERE is_active = true AND platform = 'desktop'),
    'queued', (SELECT COUNT(*) FROM notification_outbox WHERE status = 'QUEUED'),
    'processing', (SELECT COUNT(*) FROM notification_outbox WHERE status = 'PROCESSING'),
    'provider_accepted', (SELECT COUNT(*) FROM notification_outbox WHERE status = 'PROVIDER_ACCEPTED'),
    'displayed', (SELECT COUNT(*) FROM notification_outbox WHERE status = 'DISPLAYED'),
    'opened', (SELECT COUNT(*) FROM notification_outbox WHERE status = 'OPENED'),
    'retrying', (SELECT COUNT(*) FROM notification_outbox WHERE status = 'FAILED_RETRYABLE'),
    'failed_permanent', (SELECT COUNT(*) FROM notification_outbox WHERE status = 'FAILED_PERMANENT'),
    'expired_subs', (SELECT COUNT(*) FROM push_subscriptions WHERE is_active = false),
    'total_notifications_24h', (SELECT COUNT(*) FROM notification_inbox WHERE created_at > now() - interval '24 hours'),
    'total_campaigns', (SELECT COUNT(*) FROM notification_campaigns),
    'active_templates', (SELECT COUNT(*) FROM notification_templates WHERE is_active = true)
  ) INTO v_result;

  RETURN jsonb_build_object('success', true, 'stats', v_result);
END;
$$;

-- ══════════════════════════════════════════════════════════════════
-- Seed default notification templates
-- ══════════════════════════════════════════════════════════════════
INSERT INTO notification_templates (template_key, category, title_ar, title_en, body_ar, body_en, default_deep_link, default_priority, allowed_variables, default_channels) VALUES
  ('PAYMENT_SUBMITTED', 'PAYMENT', 'تم إرسال طلب الدفع', 'Payment Submitted', 'تم إرسال طلبك بنجاح وجارٍ المراجعة', 'Your payment request has been submitted for review', '/payments/{{payment_id}}', 'NORMAL', '["payment_id","amount","order_code"]', '["IN_APP"]'),
  ('PAYMENT_APPROVED', 'PAYMENT', 'تم اعتماد طلبك', 'Payment Approved', 'تمت إضافة {{points}} نقطة إلى حسابك', '{{points}} points have been added to your account', '/payments/{{payment_id}}', 'HIGH', '["payment_id","points","order_code"]', '["IN_APP","WEB_PUSH"]'),
  ('PAYMENT_REJECTED', 'PAYMENT', 'تم رفض طلب الدفع', 'Payment Rejected', 'تم رفض طلبك. يرجى مراجعة التفاصيل', 'Your payment request was rejected. Please review details', '/payments/{{payment_id}}', 'HIGH', '["payment_id","reason","order_code"]', '["IN_APP","WEB_PUSH"]'),
  ('PAYMENT_NEEDS_INFO', 'PAYMENT', 'طلب معلومات إضافية', 'Additional Info Needed', 'يرجى تقديم معلومات إضافية لمعالجة طلبك', 'Please provide additional information for your request', '/payments/{{payment_id}}', 'HIGH', '["payment_id","order_code"]', '["IN_APP","WEB_PUSH"]'),
  ('SERVICE_ASSIGNED', 'SERVICE', 'تم تخصيص خدمتك', 'Service Assigned', 'تم تخصيص فني لخدمتك', 'A technician has been assigned to your service', '/fulfillment/{{case_id}}', 'NORMAL', '["case_id","case_code"]', '["IN_APP","WEB_PUSH"]'),
  ('SERVICE_DELIVERED', 'SERVICE', 'تم تسليم الخدمة', 'Service Delivered', 'تم تسليم خدمتك بنجاح', 'Your service has been delivered successfully', '/fulfillment/{{case_id}}', 'HIGH', '["case_id","case_code","prize_name"]', '["IN_APP","WEB_PUSH"]'),
  ('SERVICE_NEEDS_INFO', 'SERVICE', 'مطلوب معلومات للتسليم', 'Info Required for Delivery', 'يرجى تقديم المعلومات المطلوبة لتسليم جائزتك', 'Please provide the required info for your prize delivery', '/fulfillment/{{case_id}}', 'HIGH', '["case_id","case_code"]', '["IN_APP","WEB_PUSH"]'),
  ('FULFILLMENT_MESSAGE', 'CHAT', 'رسالة جديدة', 'New Message', 'لديك رسالة جديدة بخصوص جائزتك', 'You have a new message about your prize', '/fulfillment/{{case_id}}', 'NORMAL', '["case_id","case_code"]', '["IN_APP","WEB_PUSH"]'),
  ('WHEEL_PRIZE_WON', 'PRIZE', 'مبروك! ربحت جائزة', 'Congratulations! You Won', 'ربحت {{prize_name}} في عجلة أكسي', 'You won {{prize_name}} on AXIE Wheel', '/games/wheel', 'NORMAL', '["prize_name","prize_type"]', '["IN_APP"]'),
  ('WHEEL_GRAND_PRIZE', 'PRIZE', 'الجائزة الكبرى!', 'Grand Prize!', 'مبروك! ربحت الجائزة الكبرى: {{prize_name}}', 'Congratulations! You won the grand prize: {{prize_name}}', '/my-prizes', 'CRITICAL', '["prize_name"]', '["IN_APP","WEB_PUSH"]'),
  ('LUCKY_CARD_RESULT', 'GAME', 'نتيجة السحب', 'Draw Result', 'تم الإعلان عن نتيجة السحب في بطاقة الحظ', 'Lucky Card draw results have been announced', '/games/lucky-card', 'HIGH', '["round_name"]', '["IN_APP","WEB_PUSH"]'),
  ('POINTS_CREDITED', 'ACCOUNT', 'تم إضافة نقاط', 'Points Credited', 'تم إضافة {{points}} نقطة إلى رصيدك', '{{points}} points have been added to your balance', NULL, 'NORMAL', '["points","source"]', '["IN_APP"]'),
  ('ACCOUNT_SUSPENDED', 'SECURITY', 'تم تعليق حسابك', 'Account Suspended', 'تم تعليق حسابك. تواصل مع الدعم للمزيد', 'Your account has been suspended. Contact support', NULL, 'CRITICAL', '["reason"]', '["IN_APP"]'),
  ('LOGIN_ALERT', 'SECURITY', 'تسجيل دخول جديد', 'New Login', 'تم تسجيل دخول جديد إلى حسابك', 'A new login was detected on your account', NULL, 'HIGH', '["device","time"]', '["IN_APP","WEB_PUSH"]')
ON CONFLICT (template_key) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════
-- Seed default automation rules
-- ══════════════════════════════════════════════════════════════════
INSERT INTO notification_automation_rules (event_key, template_id, enabled, channels, priority) VALUES
  ('PAYMENT_SUBMITTED', (SELECT id FROM notification_templates WHERE template_key = 'PAYMENT_SUBMITTED'), true, '["IN_APP"]', 'NORMAL'),
  ('PAYMENT_APPROVED', (SELECT id FROM notification_templates WHERE template_key = 'PAYMENT_APPROVED'), true, '["IN_APP","WEB_PUSH"]', 'HIGH'),
  ('PAYMENT_REJECTED', (SELECT id FROM notification_templates WHERE template_key = 'PAYMENT_REJECTED'), true, '["IN_APP","WEB_PUSH"]', 'HIGH'),
  ('PAYMENT_NEEDS_INFO', (SELECT id FROM notification_templates WHERE template_key = 'PAYMENT_NEEDS_INFO'), true, '["IN_APP","WEB_PUSH"]', 'HIGH'),
  ('SERVICE_ASSIGNED', (SELECT id FROM notification_templates WHERE template_key = 'SERVICE_ASSIGNED'), true, '["IN_APP","WEB_PUSH"]', 'NORMAL'),
  ('SERVICE_DELIVERED', (SELECT id FROM notification_templates WHERE template_key = 'SERVICE_DELIVERED'), true, '["IN_APP","WEB_PUSH"]', 'HIGH'),
  ('SERVICE_NEEDS_INFO', (SELECT id FROM notification_templates WHERE template_key = 'SERVICE_NEEDS_INFO'), true, '["IN_APP","WEB_PUSH"]', 'HIGH'),
  ('FULFILLMENT_MESSAGE', (SELECT id FROM notification_templates WHERE template_key = 'FULFILLMENT_MESSAGE'), true, '["IN_APP","WEB_PUSH"]', 'NORMAL'),
  ('WHEEL_PRIZE_WON', (SELECT id FROM notification_templates WHERE template_key = 'WHEEL_PRIZE_WON'), true, '["IN_APP"]', 'NORMAL'),
  ('WHEEL_GRAND_PRIZE', (SELECT id FROM notification_templates WHERE template_key = 'WHEEL_GRAND_PRIZE'), true, '["IN_APP","WEB_PUSH"]', 'CRITICAL'),
  ('LUCKY_CARD_RESULT', (SELECT id FROM notification_templates WHERE template_key = 'LUCKY_CARD_RESULT'), true, '["IN_APP","WEB_PUSH"]', 'HIGH'),
  ('POINTS_CREDITED', (SELECT id FROM notification_templates WHERE template_key = 'POINTS_CREDITED'), true, '["IN_APP"]', 'NORMAL'),
  ('ACCOUNT_SUSPENDED', (SELECT id FROM notification_templates WHERE template_key = 'ACCOUNT_SUSPENDED'), true, '["IN_APP"]', 'CRITICAL'),
  ('LOGIN_ALERT', (SELECT id FROM notification_templates WHERE template_key = 'LOGIN_ALERT'), true, '["IN_APP","WEB_PUSH"]', 'HIGH')
ON CONFLICT (event_key) DO NOTHING;
