/**
 * Native push (Android via Capacitor + FCM).
 * Supabase token sync is off until DB + Edge Function exist.
 */
export const PUSH_REGISTER_WITH_SUPABASE =
  import.meta.env.VITE_PUSH_REGISTER_WITH_SUPABASE === 'true';

/** When false, foreground push still fires JS listeners but we skip extra UI noise */
export const PUSH_FOREGROUND_TOAST =
  import.meta.env.VITE_PUSH_FOREGROUND_TOAST !== 'false';

/** When true, show extra debug toasts/logs for native push */
export const PUSH_DEBUG =
  import.meta.env.VITE_PUSH_DEBUG === 'true';
