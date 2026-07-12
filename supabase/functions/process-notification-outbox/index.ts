import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 5;

interface OutboxJob {
  id: string;
  notification_id: string;
  user_id: string;
  channel: string;
  status: string;
  attempt_count: number;
  idempotency_key: string;
}

interface PushSub {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  failure_count: number;
}

interface Notification {
  id: string;
  title_ar: string;
  body_ar: string;
  icon_url: string | null;
  image_url: string | null;
  deep_link: string | null;
  entity_type: string | null;
  entity_id: string | null;
  priority: string;
  category: string;
}

// ── VAPID helpers (RFC 8292 / RFC 8291) ───────────────────────────
function base64UrlDecode(str: string): Uint8Array {
  const pad = "=".repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function base64UrlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importVapidKeys(publicKeyB64: string, privateKeyB64: string) {
  const pubRaw = base64UrlDecode(publicKeyB64);
  const privRaw = base64UrlDecode(privateKeyB64);

  const privJwk = {
    kty: "EC",
    crv: "P-256",
    x: base64UrlEncode(pubRaw.slice(1, 33)),
    y: base64UrlEncode(pubRaw.slice(33, 65)),
    d: base64UrlEncode(privRaw),
  };

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    privJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  return { privateKey, publicKeyRaw: pubRaw };
}

async function createVapidAuthHeader(
  endpoint: string,
  vapidPrivateKey: CryptoKey,
  vapidPublicKeyRaw: Uint8Array,
  subject: string
): Promise<string> {
  const aud = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;

  const header = { typ: "JWT", alg: "ES256" };
  const payload = { aud, exp, sub: subject };

  const enc = new TextEncoder();
  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    vapidPrivateKey,
    enc.encode(unsignedToken)
  );

  // Convert DER signature to raw r||s (64 bytes)
  const derSig = new Uint8Array(sig);
  let rawSig: Uint8Array;

  if (derSig[0] === 0x30) {
    const rLen = derSig[3];
    const rStart = 4 + (rLen > 32 ? 1 : 0);
    const r = derSig.slice(rStart, 4 + rLen);
    const sLenIdx = 4 + rLen + 1;
    const sLen = derSig[sLenIdx];
    const sStart = sLenIdx + 1 + (sLen > 32 ? 1 : 0);
    const s = derSig.slice(sStart, sLenIdx + 1 + sLen);

    rawSig = new Uint8Array(64);
    rawSig.set(r.length <= 32 ? r : r.slice(r.length - 32), 32 - Math.min(r.length, 32));
    rawSig.set(s.length <= 32 ? s : s.slice(s.length - 32), 64 - Math.min(s.length, 32));
  } else {
    rawSig = derSig.length === 64 ? derSig : derSig.slice(0, 64);
  }

  const jwt = `${unsignedToken}.${base64UrlEncode(rawSig)}`;
  const keyB64 = base64UrlEncode(vapidPublicKeyRaw);

  return `vapid t=${jwt}, k=${keyB64}`;
}

// ── Web Push encryption (RFC 8291 / aes128gcm) ───────────────────
async function encryptPayload(
  payload: string,
  subP256dh: string,
  subAuth: string
): Promise<{ body: Uint8Array; salt: Uint8Array }> {
  const clientPubKey = base64UrlDecode(subP256dh);
  const authSecret = base64UrlDecode(subAuth);

  const localKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  const localPubRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", localKeyPair.publicKey)
  );

  const clientKey = await crypto.subtle.importKey(
    "raw",
    clientPubKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: clientKey },
      localKeyPair.privateKey,
      256
    )
  );

  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // IKM from auth secret
  const authInfo = enc.encode("WebPush: info\0");
  const authInfoBuf = new Uint8Array(authInfo.length + 65 + 65);
  authInfoBuf.set(authInfo);
  authInfoBuf.set(clientPubKey, authInfo.length);
  authInfoBuf.set(localPubRaw, authInfo.length + 65);

  const prkAuth = await hmacSha256(authSecret, sharedSecret);
  const ikm = await hmacSha256(prkAuth, concatBuffers(authInfoBuf, new Uint8Array([1])));

  // PRK
  const prk = await hmacSha256(salt, ikm);

  // CEK
  const cekInfo = enc.encode("Content-Encoding: aes128gcm\0");
  const cek = (await hmacSha256(prk, concatBuffers(cekInfo, new Uint8Array([1])))).slice(0, 16);

  // Nonce
  const nonceInfo = enc.encode("Content-Encoding: nonce\0");
  const nonce = (await hmacSha256(prk, concatBuffers(nonceInfo, new Uint8Array([1])))).slice(0, 12);

  // Encrypt
  const paddedPayload = concatBuffers(enc.encode(payload), new Uint8Array([2]));

  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, paddedPayload)
  );

  // aes128gcm header: salt(16) + rs(4) + idlen(1) + keyid(65) + ciphertext
  const rs = new DataView(new ArrayBuffer(4));
  rs.setUint32(0, 4096);

  const header = concatBuffers(
    salt,
    new Uint8Array(rs.buffer),
    new Uint8Array([65]),
    localPubRaw
  );

  return { body: concatBuffers(header, encrypted), salt };
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, data));
}

function concatBuffers(...bufs: Uint8Array[]): Uint8Array {
  const total = bufs.reduce((s, b) => s + b.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const b of bufs) {
    result.set(b, offset);
    offset += b.length;
  }
  return result;
}

// ── Send push to a single subscription ───────────────────────────
async function sendWebPush(
  sub: PushSub,
  notification: Notification,
  vapidPrivateKey: CryptoKey,
  vapidPublicKeyRaw: Uint8Array,
  vapidSubject: string
): Promise<{ success: boolean; status: number; gone: boolean }> {
  const pushPayload = JSON.stringify({
    title: notification.title_ar,
    body: notification.body_ar,
    icon: notification.icon_url || "/icons/icon-192.png",
    image: notification.image_url || undefined,
    tag: `axie-${notification.category}-${notification.id.slice(0, 8)}`,
    notification_id: notification.id,
    url: notification.deep_link || "/",
    entity_type: notification.entity_type,
    entity_id: notification.entity_id,
    priority: notification.priority,
    timestamp: Date.now(),
  });

  const { body: encrypted } = await encryptPayload(
    pushPayload,
    sub.p256dh,
    sub.auth_key
  );

  const authHeader = await createVapidAuthHeader(
    sub.endpoint,
    vapidPrivateKey,
    vapidPublicKeyRaw,
    vapidSubject
  );

  const resp = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: notification.priority === "CRITICAL" ? "86400" : "3600",
      Urgency: notification.priority === "LOW" ? "low" : "high",
    },
    body: encrypted,
  });

  return {
    success: resp.status >= 200 && resp.status < 300,
    status: resp.status,
    gone: resp.status === 404 || resp.status === 410,
  };
}

// ── Main handler ─────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@axie.app";

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({ error: "VAPID keys not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { privateKey, publicKeyRaw } = await importVapidKeys(
      vapidPublicKey,
      vapidPrivateKey
    );

    // Claim a batch of pending outbox jobs
    const { data: jobs, error: claimErr } = await supabase.rpc(
      "claim_notification_outbox_batch",
      { p_batch_size: BATCH_SIZE, p_worker_id: `edge-${crypto.randomUUID().slice(0, 8)}` }
    );

    if (claimErr) {
      return new Response(
        JSON.stringify({ error: claimErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const job of jobs as OutboxJob[]) {
      try {
        if (job.channel === "in_app") {
          // In-app already inserted by create_notification_event, mark done
          await supabase
            .from("notification_outbox")
            .update({ status: "DELIVERED", completed_at: new Date().toISOString() })
            .eq("id", job.id);
          sent++;
          continue;
        }

        if (job.channel !== "push") {
          await supabase
            .from("notification_outbox")
            .update({ status: "SKIPPED", completed_at: new Date().toISOString() })
            .eq("id", job.id);
          skipped++;
          continue;
        }

        // Load notification details
        const { data: notif } = await supabase
          .from("notification_inbox")
          .select("id, title_ar, body_ar, icon_url, image_url, deep_link, entity_type, entity_id, priority, category")
          .eq("id", job.notification_id)
          .maybeSingle();

        if (!notif) {
          await supabase
            .from("notification_outbox")
            .update({
              status: "FAILED",
              last_error_code: "NOTIF_NOT_FOUND",
              last_error_message: "Notification record missing",
              completed_at: new Date().toISOString(),
            })
            .eq("id", job.id);
          failed++;
          continue;
        }

        // Get active push subscriptions for this user
        const { data: subs } = await supabase
          .from("push_subscriptions")
          .select("id, endpoint, p256dh, auth_key, failure_count")
          .eq("user_id", job.user_id)
          .eq("is_active", true);

        if (!subs || subs.length === 0) {
          await supabase
            .from("notification_outbox")
            .update({
              status: "SKIPPED",
              last_error_code: "NO_SUBSCRIPTIONS",
              last_error_message: "User has no active push subscriptions",
              completed_at: new Date().toISOString(),
            })
            .eq("id", job.id);
          skipped++;
          continue;
        }

        let anySuccess = false;

        for (const sub of subs as PushSub[]) {
          try {
            const result = await sendWebPush(
              sub,
              notif as Notification,
              privateKey,
              publicKeyRaw,
              vapidSubject
            );

            // Record delivery attempt
            await supabase.from("notification_deliveries").insert({
              notification_id: job.notification_id,
              outbox_id: job.id,
              user_id: job.user_id,
              subscription_id: sub.id,
              channel: "push",
              attempt_number: job.attempt_count + 1,
              status: result.success ? "SENT" : "FAILED",
              provider_status: `HTTP ${result.status}`,
              sent_at: result.success ? new Date().toISOString() : null,
              failed_at: result.success ? null : new Date().toISOString(),
              failure_code: result.success ? null : `HTTP_${result.status}`,
            });

            if (result.gone) {
              // Subscription expired — deactivate
              await supabase
                .from("push_subscriptions")
                .update({
                  is_active: false,
                  last_failure_at: new Date().toISOString(),
                  last_failure_code: "GONE",
                })
                .eq("id", sub.id);
            } else if (!result.success) {
              // Increment failure count
              await supabase
                .from("push_subscriptions")
                .update({
                  failure_count: sub.failure_count + 1,
                  last_failure_at: new Date().toISOString(),
                  last_failure_code: `HTTP_${result.status}`,
                  is_active: sub.failure_count + 1 < 10,
                })
                .eq("id", sub.id);
            } else {
              anySuccess = true;
              await supabase
                .from("push_subscriptions")
                .update({
                  failure_count: 0,
                  last_success_at: new Date().toISOString(),
                })
                .eq("id", sub.id);
            }
          } catch (pushErr) {
            await supabase.from("notification_deliveries").insert({
              notification_id: job.notification_id,
              outbox_id: job.id,
              user_id: job.user_id,
              subscription_id: sub.id,
              channel: "push",
              attempt_number: job.attempt_count + 1,
              status: "FAILED",
              failed_at: new Date().toISOString(),
              failure_code: "ENCRYPT_ERROR",
            });
          }
        }

        if (anySuccess) {
          await supabase
            .from("notification_outbox")
            .update({ status: "DELIVERED", completed_at: new Date().toISOString() })
            .eq("id", job.id);
          sent++;
        } else {
          // Retry with backoff
          const nextAttempt = job.attempt_count + 1;
          if (nextAttempt >= MAX_ATTEMPTS) {
            await supabase
              .from("notification_outbox")
              .update({
                status: "FAILED",
                attempt_count: nextAttempt,
                last_error_code: "MAX_RETRIES",
                last_error_message: "All delivery attempts exhausted",
                completed_at: new Date().toISOString(),
              })
              .eq("id", job.id);
            failed++;
          } else {
            const backoffSec = Math.pow(2, nextAttempt) * 30;
            await supabase
              .from("notification_outbox")
              .update({
                status: "PENDING",
                attempt_count: nextAttempt,
                locked_at: null,
                locked_by: null,
                available_at: new Date(Date.now() + backoffSec * 1000).toISOString(),
                last_error_code: "ALL_SUBS_FAILED",
                last_error_message: `Retry ${nextAttempt}/${MAX_ATTEMPTS}`,
              })
              .eq("id", job.id);
            failed++;
          }
        }
      } catch (jobErr) {
        const msg = jobErr instanceof Error ? jobErr.message : String(jobErr);
        await supabase
          .from("notification_outbox")
          .update({
            status: "PENDING",
            attempt_count: job.attempt_count + 1,
            locked_at: null,
            locked_by: null,
            available_at: new Date(
              Date.now() + Math.pow(2, job.attempt_count + 1) * 30000
            ).toISOString(),
            last_error_message: msg.slice(0, 500),
          })
          .eq("id", job.id);
        failed++;
      }
    }

    // Log run
    await supabase.from("notification_audit_log").insert({
      actor_type: "system",
      action: "outbox_batch_processed",
      metadata: { sent, failed, skipped, batch_size: jobs.length },
    });

    return new Response(
      JSON.stringify({ processed: jobs.length, sent, failed, skipped }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
