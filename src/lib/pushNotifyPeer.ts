/**
 * Notify the other participant via Edge Function (typing / online).
 * Message pushes still come from the DB trigger on `messages` insert.
 *
 * Requires Edge Function `send-push-notification` with verify_jwt disabled (or anon allowed).
 * If PUSH_WEBHOOK_SECRET is set on the function, set VITE_PUSH_WEBHOOK_SECRET to match.
 */
export type PeerPushKind = 'user_typing' | 'user_online';

export async function invokePeerPushNotification(params: {
  kind: PeerPushKind;
  roomId: string;
  senderId: string;
  senderName?: string;
}): Promise<void> {
  if (import.meta.env.VITE_ENABLE_PEER_PUSH_NOTIFICATIONS === 'false') return;

  const base = import.meta.env.VITE_SUPABASE_URL;
  const anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!base || !anon || !params.roomId || !params.senderId) return;

  const url = `${String(base).replace(/\/$/, '')}/functions/v1/send-push-notification`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${anon}`,
    apikey: anon,
  };

  const webhookSecret = import.meta.env.VITE_PUSH_WEBHOOK_SECRET;
  if (webhookSecret) headers['x-webhook-secret'] = webhookSecret;

  const body = {
    type: params.kind,
    room_id: params.roomId,
    sender_id: params.senderId,
    ...(params.senderName ? { sender_name: params.senderName } : {}),
  };

  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) {
      console.warn('[peer-push]', res.status, await res.text());
    }
  } catch (e) {
    console.warn('[peer-push]', e);
  }
}
