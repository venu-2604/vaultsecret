import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Base64url encode
function base64url(input: Uint8Array): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let result = "";
  for (let i = 0; i < input.length; i += 3) {
    const a = input[i];
    const b = input[i + 1] ?? 0;
    const c = input[i + 2] ?? 0;
    result += chars[a >> 2];
    result += chars[((a & 3) << 4) | (b >> 4)];
    if (i + 1 < input.length) result += chars[((b & 15) << 2) | (c >> 6)];
    if (i + 2 < input.length) result += chars[c & 63];
  }
  return result;
}

function base64urlStr(str: string): string {
  return base64url(new TextEncoder().encode(str));
}

// Convert PEM private key to CryptoKey
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binaryStr = atob(pemBody);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

// Generate a signed JWT for Google OAuth2
async function createSignedJwt(
  serviceAccount: { client_email: string; private_key: string; token_uri: string }
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64urlStr(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64urlStr(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: serviceAccount.token_uri,
      iat: now,
      exp: now + 3600,
    })
  );
  const unsignedToken = `${header}.${payload}`;
  const key = await importPrivateKey(serviceAccount.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedToken)
  );
  return `${unsignedToken}.${base64url(new Uint8Array(signature))}`;
}

// Exchange signed JWT for an access token
async function getAccessToken(
  serviceAccount: { client_email: string; private_key: string; token_uri: string }
): Promise<string> {
  const jwt = await createSignedJwt(serviceAccount);
  const resp = await fetch(serviceAccount.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token exchange failed: ${resp.status} ${text}`);
  }
  const data = await resp.json();
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { type, room_id, sender_id, sender_name } = await req.json();

    if (!type || !room_id || !sender_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!serviceAccountJson) {
      return new Response(
        JSON.stringify({ error: "FIREBASE_SERVICE_ACCOUNT not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serviceAccount = JSON.parse(serviceAccountJson);
    const projectId = serviceAccount.project_id;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all device tokens for this room, excluding the sender
    const { data: tokens, error } = await supabase
      .from("device_tokens")
      .select("token")
      .eq("room_id", room_id)
      .neq("user_id", sender_id);

    if (error) {
      console.error("Error fetching tokens:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch tokens" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: "No tokens found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get OAuth2 access token
    const accessToken = await getAccessToken(serviceAccount);

    const name = sender_name || "Someone";
    let title = "VaultSecret";
    let body = "";

    switch (type) {
      case "message":
        title = `New message from ${name}`;
        body = "You have a new secret message 🔐";
        break;
      case "typing":
        title = "VaultSecret";
        body = `${name} is typing...`;
        break;
      case "online":
        title = "VaultSecret";
        body = `${name} is now online`;
        break;
      default:
        body = "New activity in your chat";
    }

    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    // Send to all tokens via FCM HTTP v1
    const results = await Promise.allSettled(
      tokens.map(async ({ token }) => {
        const response = await fetch(fcmUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title, body },
              data: {
                type,
                room_id,
                sender_id,
                sender_name: name,
              },
              android: {
                priority: "high",
                notification: { sound: "default", channel_id: "vaultsecret_chat" },
              },
              apns: {
                payload: { aps: { sound: "default", badge: 1 } },
              },
            },
          }),
        });
        const result = await response.json();
        if (!response.ok) {
          console.error(`FCM error for token ${token.slice(0, 10)}...:`, result);
        }
        return { token, result, status: response.status };
      })
    );

    const sent = results.filter(
      (r) => r.status === "fulfilled" && (r as PromiseFulfilledResult<any>).value.status === 200
    ).length;

    return new Response(
      JSON.stringify({ sent, total: tokens.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Push notification error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
