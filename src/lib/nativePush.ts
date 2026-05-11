import { Capacitor } from '@capacitor/core';
import { PushNotifications, type Token, type PushNotificationSchema, type ActionPerformed } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';
import { getStoredUserId } from '@/lib/user';
import { PUSH_REGISTER_WITH_SUPABASE } from '@/lib/pushConfig';

const FCM_TOKEN_STORAGE_KEY = 'vaultsecret_fcm_token_last';

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function registerAndroidPush(): Promise<void> {
  if (!isNativeAndroid()) return;

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive !== 'granted') {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== 'granted') return;

  await PushNotifications.register();
}

/** Call after login so token is linked to user_id in Supabase. */
export async function syncStoredFcmTokenToSupabase(): Promise<void> {
  if (!PUSH_REGISTER_WITH_SUPABASE || !isNativeAndroid()) return;
  try {
    const t = localStorage.getItem(FCM_TOKEN_STORAGE_KEY);
    if (t) await persistFcmToken(t);
  } catch {
    // ignore
  }
}

export async function persistFcmToken(token: string): Promise<void> {
  try {
    localStorage.setItem(FCM_TOKEN_STORAGE_KEY, token);
  } catch {
    // ignore
  }

  if (!PUSH_REGISTER_WITH_SUPABASE) return;

  const userId = getStoredUserId();
  if (!userId) return;

  const { error } = await supabase.from('user_push_tokens')
    .upsert(
      {
        user_id: userId,
        fcm_token: token,
        platform: 'android',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,platform' }
    );

  if (error) {
    console.warn('[push] user_push_tokens upsert failed (table or RLS not ready yet):', error.message);
  } else {
    console.log('[push] user_push_tokens upsert ok');
  }
}

/**
 * Register device token for a specific room (legacy function compatibility).
 * Some deployed Edge Functions expect tokens to be stored in `device_tokens` scoped by room_id.
 */
export async function registerDeviceTokenForRoom(roomId: string): Promise<void> {
  if (!PUSH_REGISTER_WITH_SUPABASE || !isNativeAndroid()) return;
  const userId = getStoredUserId();
  if (!userId || !roomId) return;

  let token: string | null = null;
  try {
    token = localStorage.getItem(FCM_TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
  if (!token) return;

  const { error } = await supabase.from('device_tokens').upsert(
    {
      room_id: roomId,
      user_id: userId,
      token,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'room_id,user_id' }
  );

  if (error) {
    console.warn('[push] device_tokens upsert failed:', error.message);
  } else {
    console.log('[push] device_tokens upsert ok');
  }
}

/** Deep link or universal link containing `/open-room/<roomId>`. */
export function parseOpenRoomPath(url: string): string | null {
  const m = url.match(/\/open-room\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function roomIdFromPushData(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  const raw = data.room_id ?? data.roomId;
  if (typeof raw === 'string' && raw.length > 0) return raw;
  return null;
}

export type PushListeners = {
  onRegistration?: (token: Token) => void;
  onForeground?: (notification: PushNotificationSchema) => void;
  onAction?: (action: ActionPerformed) => void;
};

export async function attachPushListeners(handlers: PushListeners): Promise<() => void> {
  if (!isNativeAndroid()) return () => {};

  const subs: Array<{ remove: () => Promise<void> }> = [];

  if (handlers.onRegistration) {
    const sub = await PushNotifications.addListener('registration', handlers.onRegistration);
    subs.push(sub);
  }
  if (handlers.onForeground) {
    const sub = await PushNotifications.addListener('pushNotificationReceived', handlers.onForeground);
    subs.push(sub);
  }
  if (handlers.onAction) {
    const sub = await PushNotifications.addListener('pushNotificationActionPerformed', handlers.onAction);
    subs.push(sub);
  }

  return async () => {
    for (const s of subs) {
      await s.remove();
    }
  };
}
