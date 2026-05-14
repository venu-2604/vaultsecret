const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/**
 * Best-effort `room_participants` offline write when the page is unloading (tab ×, browser quit).
 * Uses `fetch(..., { keepalive: true })` so the browser may still deliver the request after JS is torn down.
 * A normal `supabase-js` call from `pagehide` is often aborted before the HTTP request finishes.
 */
export function flushRoomParticipantOfflineKeepalive(
  roomId: string,
  userId: string,
  lastActiveIso: string
): void {
  const base = SUPABASE_URL?.replace(/\/$/, '');
  if (!base || !SUPABASE_ANON_KEY) return;

  const endpoint = `${base}/rest/v1/room_participants?on_conflict=room_id,user_id`;
  const row = {
    room_id: roomId,
    user_id: userId,
    is_online: false,
    last_active: lastActiveIso,
  };

  try {
    void fetch(endpoint, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify([row]),
    });
  } catch {
    // ignore
  }
}
