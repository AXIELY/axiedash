import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webPush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface PushSub {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  failure_count: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@axie.app";

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({ success: false, code: "VAPID_NOT_CONFIGURED" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    // Authenticate the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, code: "UNAUTHORIZED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ success: false, code: "UNAUTHORIZED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify admin
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const { data: adminRow } = await adminClient
      .from("admins")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!adminRow) {
      return new Response(
        JSON.stringify({ success: false, code: "PERMISSION_DENIED" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get active push subscriptions for this admin
    const { data: subs } = await adminClient
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth_key, failure_count")
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (!subs || subs.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          code: "NO_ACTIVE_SUBSCRIPTION",
          authenticated_user: true,
          active_subscription_count: 0,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const pushPayload = JSON.stringify({
      title: "AXIE - إشعار تجريبي",
      body: "هذا إشعار تجريبي من لوحة الإدارة. نظام الإشعارات يعمل بنجاح!",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: `axie-test-${Date.now()}`,
      url: "/notifications",
      timestamp: Date.now(),
    });

    let sent = 0;
    let failed = 0;
    let deactivated = 0;

    for (const sub of subs as PushSub[]) {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth_key },
      };

      try {
        await webPush.sendNotification(pushSubscription, pushPayload, {
          TTL: 3600,
          urgency: "high",
        } as any);

        sent++;
        await adminClient
          .from("push_subscriptions")
          .update({
            failure_count: 0,
            last_success_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", sub.id);

        // Write delivery log
        await adminClient
          .from("push_delivery_log")
          .insert({
            target_user_id: user.id,
            subscription_id: sub.id,
            channel: "WEB_PUSH",
            status: "SENT",
            sent_at: new Date().toISOString(),
          });
      } catch (err: any) {
        const statusCode = err?.statusCode ?? 0;

        if (statusCode === 404 || statusCode === 410) {
          deactivated++;
          await adminClient
            .from("push_subscriptions")
            .update({
              is_active: false,
              deactivated_at: new Date().toISOString(),
              deactivation_reason: "SUBSCRIPTION_EXPIRED",
              last_failure_at: new Date().toISOString(),
              last_failure_code: `HTTP_${statusCode}`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", sub.id);

          await adminClient
            .from("push_delivery_log")
            .insert({
              target_user_id: user.id,
              subscription_id: sub.id,
              channel: "WEB_PUSH",
              status: "EXPIRED_SUBSCRIPTION",
              safe_error_code: `HTTP_${statusCode}`,
            });
        } else {
          failed++;
          await adminClient
            .from("push_subscriptions")
            .update({
              failure_count: sub.failure_count + 1,
              last_failure_at: new Date().toISOString(),
              last_failure_code: `HTTP_${statusCode}`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", sub.id);

          await adminClient
            .from("push_delivery_log")
            .insert({
              target_user_id: user.id,
              subscription_id: sub.id,
              channel: "WEB_PUSH",
              status: "FAILED",
              safe_error_code: `HTTP_${statusCode}`,
              provider_status: statusCode,
            });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: sent > 0,
        targeted: subs.length,
        sent,
        failed,
        deactivated,
        authenticated_user: true,
        active_subscription_count: subs.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ success: false, code: "PUSH_SEND_FAILED", error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
