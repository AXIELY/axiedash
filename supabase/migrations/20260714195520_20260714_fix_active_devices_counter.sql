-- Fix: get_notification_stats returns active_subscriptions but frontend reads active_devices
-- Add active_devices as an alias field for backward compatibility
CREATE OR REPLACE FUNCTION public.get_notification_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_result jsonb;
BEGIN
IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true) THEN
RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
END IF;

SELECT jsonb_build_object(
'active_push_users', (SELECT COUNT(DISTINCT user_id) FROM push_subscriptions WHERE is_active = true),
'active_subscriptions', (SELECT COUNT(*) FROM push_subscriptions WHERE is_active = true),
'active_devices', (SELECT COUNT(*) FROM push_subscriptions WHERE is_active = true),
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
$function$;
