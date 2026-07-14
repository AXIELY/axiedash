import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

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
    "jwk", privJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]
  );
  return { privateKey, publicKeyRaw: pubRaw };
}

async function createVapidAuthHeader(
  endpoint: string, vapidPrivateKey: CryptoKey,
  vapidPublicKeyRaw: Uint8Array, subject: string
): Promise<string> {
  const aud = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const enc = new TextEncoder();
  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify({ aud, exp, sub: subject })));
  const unsignedToken = `${headerB64}.${payloadB64}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, vapidPrivateKey, enc.encode(unsignedToken)
  );
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
  return `vapid t=${jwt}, k=${base64UrlEncode(vapidPublicKeyRaw)}`;
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
  for (const b of bufs) { result.set(b, offset); offset += b.length; }
  return result;
}

async function encryptPayload(payload: string, subP256dh: string, subAuth: string) {
  const clientPubKey = base64UrlDecode(subP256dh);
  const authSecret = base64UrlDecode(subAuth);
  const localKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]
  );
  const localPubRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", localKeyPair.publicKey)
  );
  const clientKey = await crypto.subtle.importKey(
    "raw", clientPubKey, { name: "ECDH", namedCurve: "P-256" }, false, []
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: clientKey }, localKeyPair.privateKey, 256
    )
  );
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const authInfo = enc.encode("WebPush: info\0");
  const authInfoBuf = new Uint8Array(authInfo.length + 65 + 65);
  authInfoBuf.set(authInfo);
  authInfoBuf.set(clientPubKey, authInfo.length);
  authInfoBuf.set(localPubRaw, authInfo.length + 65);
  const prkAuth = await hmacSha256(authSecret, sharedSecret);
  const ikm = await hmacSha256(prkAuth, concatBuffers(authInfoBuf, new Uint8Array([1])));
  const prk = await hmacSha256(salt, ikm);
  const cekInfo = enc.encode("Content-Encoding: aes128gcm\0");
  const cek = (await hmacSha256(prk, concatBuffers(cekInfo, new Uint8Array([1])))).slice(0, 16);
  const nonceInfo = enc.encode("Content-Encoding: nonce\0");
  const nonce = (await hmacSha256(prk, concatBuffers(nonceInfo, new Uint8Array([1])))).slice(0, 12);
  const paddedPayload = concatBuffers(enc.encode(payload), new Uint8Array([2]));
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, paddedPayload)
  );
  const rs = new DataView(new ArrayBuffer(4));
  rs.setUint32(0, 4096);
  const header = concatBuffers(salt, new Uint8Array(rs.buffer), new Uint8Array([65]), localPubRaw);
  return { body: concatBuffers(header, encrypted) };
}

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
        JSON.stringify({ success: false, code: "NO_ACTIVE_SUBSCRIPTION" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { privateKey, publicKeyRaw } = await importVapidKeys(vapidPublicKey, vapidPrivateKey);

    const pushPayload = JSON.stringify({
      title: "AXIE - إشعار تجريبي",
      body: "هذا إشعار تجريبي من لوحة الإدارة. نظام الإشعارات يعمل بنجاح!",
      icon: "/icons/icon-192.png",
      tag: `axie-test-${Date.now()}`,
      url: "/notifications",
      priority: "NORMAL",
      timestamp: Date.now(),
    });

    let sent = 0;
    let failed = 0;
    let deactivated = 0;

    for (const sub of subs as PushSub[]) {
      try {
        const { body: encrypted } = await encryptPayload(pushPayload, sub.p256dh, sub.auth_key);
        const vapidAuth = await createVapidAuthHeader(sub.endpoint, privateKey, publicKeyRaw, vapidSubject);

        const resp = await fetch(sub.endpoint, {
          method: "POST",
          headers: {
            Authorization: vapidAuth,
            "Content-Encoding": "aes128gcm",
            "Content-Type": "application/octet-stream",
            TTL: "3600",
            Urgency: "high",
          },
          body: encrypted,
        });

        if (resp.status >= 200 && resp.status < 300) {
          sent++;
          await adminClient
            .from("push_subscriptions")
            .update({ failure_count: 0, last_success_at: new Date().toISOString() })
            .eq("id", sub.id);
        } else if (resp.status === 404 || resp.status === 410) {
          deactivated++;
          await adminClient
            .from("push_subscriptions")
            .update({ is_active: false, last_failure_at: new Date().toISOString(), last_failure_code: "GONE" })
            .eq("id", sub.id);
        } else {
          failed++;
          await adminClient
            .from("push_subscriptions")
            .update({
              failure_count: sub.failure_count + 1,
              last_failure_at: new Date().toISOString(),
              last_failure_code: `HTTP_${resp.status}`,
            })
            .eq("id", sub.id);
        }
      } catch {
        failed++;
      }
    }

    return new Response(
      JSON.stringify({
        success: sent > 0,
        targeted: subs.length,
        sent,
        failed,
        deactivated,
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
