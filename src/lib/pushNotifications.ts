import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';

const isNative = Capacitor.isNativePlatform();

/**
 * Register push notifications on native platforms only.
 * Stores the FCM token in device_tokens table.
 */
export async function registerPushNotifications(
  userId: string,
  roomId: string
): Promise<void> {
  if (!isNative) return;

  try {
    // Request permission
    const permStatus = await PushNotifications.requestPermissions();
    if (permStatus.receive !== 'granted') {
      console.log('[Push] Permission not granted');
      return;
    }

    // Register with FCM/APNs
    await PushNotifications.register();

    // Listen for registration
    PushNotifications.addListener('registration', async (token) => {
      console.log('[Push] Token received:', token.value);
      
      // Upsert token into device_tokens
      const { error } = await (supabase as any).from('device_tokens').upsert(
        {
          user_id: userId,
          token: token.value,
          room_id: roomId,
          platform: Capacitor.getPlatform(), // 'android' or 'ios'
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,token,room_id' }
      );
      if (error) console.error('[Push] Token save error:', error);
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('[Push] Registration error:', err);
    });

    // Handle foreground notifications
    PushNotifications.addListener(
      'pushNotificationReceived',
      (notification) => {
        console.log('[Push] Foreground notification:', notification);
        // Don't show system notification in foreground — the app is already open
      }
    );

    // Handle notification tap (when app is in background)
    PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (action) => {
        console.log('[Push] Notification tapped:', action);
        const data = action.notification.data;
        if (data?.room_id) {
          // Could navigate to the room — but user is likely already there
          console.log('[Push] Room:', data.room_id);
        }
      }
    );
  } catch (err) {
    console.error('[Push] Setup error:', err);
  }
}

/**
 * Unregister device token when leaving a room.
 */
export async function unregisterPushToken(
  userId: string,
  roomId: string
): Promise<void> {
  if (!isNative) return;
  
  try {
    await (supabase as any)
      .from('device_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('room_id', roomId);
  } catch (err) {
    console.error('[Push] Unregister error:', err);
  }
}

/**
 * Send a push notification via the edge function.
 * Only triggers on native platforms.
 */
export async function sendPushNotification(
  type: 'message' | 'typing' | 'online',
  roomId: string,
  senderId: string,
  senderName: string
): Promise<void> {
  // Send from any platform — the recipient might be on native
  try {
    await supabase.functions.invoke('send-push-notification', {
      body: {
        type,
        room_id: roomId,
        sender_id: senderId,
        sender_name: senderName,
      },
    });
  } catch (err) {
    // Non-critical — don't block the UI
    console.error('[Push] Send error:', err);
  }
}
