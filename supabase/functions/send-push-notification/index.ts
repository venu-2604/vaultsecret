import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    const FCM_SERVER_KEY = Deno.env.get("FCM_SERVER_KEY");
    if (!FCM_SERVER_KEY) {
      return new Response(
        JSON.stringify({ error: "FCM_SERVER_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // Send to all tokens via FCM
    const results = await Promise.allSettled(
      tokens.map(async ({ token }) => {
        const response = await fetch("https://fcm.googleapis.com/fcm/send", {
          method: "POST",
          headers: {
            Authorization: `key=${FCM_SERVER_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: token,
            notification: {
              title,
              body,
              sound: "default",
              click_action: "FLUTTER_NOTIFICATION_CLICK",
            },
            data: {
              type,
              room_id,
              sender_id,
              sender_name: name,
            },
          }),
        });
        const result = await response.json();
        return { token, result, status: response.status };
      })
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;

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
