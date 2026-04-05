import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { App } from '@capacitor/app';
import { supabase } from '@/integrations/supabase/client';

let isAppInForeground = true;

export function getIsAppInForeground() {
  return isAppInForeground;
}

/**
 * Initialize push notifications for native platforms.
 * Call once at app startup.
 */
export async function initPushNotifications(
  userId: string,
  roomId: string,
  onNotificationClick?: (roomId: string) => void
) {
  if (!Capacitor.isNativePlatform()) return;

  // Track foreground/background state
  App.addListener('appStateChange', ({ isActive }) => {
    isAppInForeground = isActive;
  });

  // Request permission
  const permResult = await PushNotifications.requestPermissions();
  if (permResult.receive !== 'granted') {
    console.warn('Push notification permission not granted');
    return;
  }

  // Register with the OS
  await PushNotifications.register();

  // On successful registration, store the token
  PushNotifications.addListener('registration', async (token) => {
    console.log('FCM Token:', token.value);
    await storeDeviceToken(userId, roomId, token.value);
  });

  PushNotifications.addListener('registrationError', (err) => {
    console.error('Push registration error:', err);
  });

  // Handle notification received while app is in foreground (suppress it, realtime handles it)
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('Push received in foreground (suppressed):', notification);
    // Don't show anything — Supabase realtime is active
  });

  // Handle notification tap (app was in background/closed)
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const data = action.notification.data;
    if (data?.roomId && onNotificationClick) {
      onNotificationClick(data.roomId);
    }
  });
}

/**
 * Store or update the FCM device token in Supabase.
 */
async function storeDeviceToken(userId: string, roomId: string, token: string) {
  const platform = Capacitor.getPlatform(); // 'android' | 'ios'

  // Upsert: if same user+room+token exists, update; otherwise insert
  const { error } = await supabase
    .from('device_tokens')
    .upsert(
      {
        user_id: userId,
        room_id: roomId,
        token,
        platform,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,room_id,token' }
    );

  if (error) {
    console.error('Failed to store device token:', error);
  }
}

/**
 * Remove device tokens when user logs out.
 */
export async function removeDeviceToken(userId: string, roomId: string) {
  if (!Capacitor.isNativePlatform()) return;

  await supabase
    .from('device_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('room_id', roomId);
}
