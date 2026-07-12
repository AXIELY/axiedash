/*
# Add admin broadcast notification templates

1. New Templates
  - ADMIN_BROADCAST — for admin-sent broadcast notifications
  - ADMIN_DIRECT — for admin-sent direct notifications
*/

INSERT INTO notification_templates (template_key, category, title_ar, title_en, body_ar, body_en, default_channels, default_priority, is_active)
VALUES
  ('ADMIN_BROADCAST', 'game', '{{title_ar}}', '{{title_en}}', '{{body_ar}}', '{{body_en}}', '["in_app", "push"]'::jsonb, 'NORMAL', true),
  ('ADMIN_DIRECT', 'game', '{{title_ar}}', '{{title_en}}', '{{body_ar}}', '{{body_en}}', '["in_app", "push"]'::jsonb, 'NORMAL', true)
ON CONFLICT (template_key) DO NOTHING;
