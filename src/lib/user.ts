import { supabase } from '@/integrations/supabase/client';

const USER_KEY = 'vs_user_id';

export interface VSUser {
  id: string;
  full_name: string;
  created_at: string;
}

/** Sanitize and validate full_name */
export function sanitizeName(name: string): string {
  return name.trim().replace(/<[^>]*>/g, '').replace(/[&<>"'/]/g, '');
}

export function validateName(name: string): string | null {
  const sanitized = sanitizeName(name);
  if (sanitized.length < 3) return 'Name must be at least 3 characters';
  if (sanitized.length > 50) return 'Name must be less than 50 characters';
  if (/^\d+$/.test(sanitized)) return 'Name cannot be only numbers';
  return null;
}

export function getStoredUserId(): string | null {
  return localStorage.getItem(USER_KEY);
}

export function storeUserId(id: string) {
  localStorage.setItem(USER_KEY, id);
}

export function clearUserId() {
  localStorage.removeItem(USER_KEY);
}

/** Ensure anonymous auth session exists */
async function ensureAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw new Error('Authentication failed');
  }
}

/** Get user by ID using get_app_user_id + direct SELECT (RLS-safe since auth_uid matches) */
export async function getUserById(id: string): Promise<VSUser | null> {
  await ensureAuth();
  // Try direct select — works if auth_uid is linked to current session
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single();
  if (data) return data as VSUser;
  
  // If RLS blocked it (session changed), the user needs to re-login
  return null;
}

/** Find user by name using SECURITY DEFINER RPC (bypasses RLS) */
export async function findUserByName(name: string): Promise<VSUser | null> {
  await ensureAuth();
  const { data, error } = await supabase.rpc('get_user_by_name', { _name: name });
  if (error || !data || data.length === 0) return null;
  return data[0] as VSUser;
}

/** Link current auth session to an existing user */
export async function linkAuthToUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('link_user_auth', { p_user_id: userId });
  if (error) throw error;
}

/** Create a new user with auth_uid set to current anonymous session */
export async function createUser(name: string): Promise<VSUser> {
  await ensureAuth();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No auth session');

  const { data, error } = await supabase
    .from('users')
    .insert({ full_name: name, auth_uid: session.user.id })
    .select()
    .single();
  if (error) throw error;
  return data as VSUser;
}

/** Join room using SECURITY DEFINER RPC (handles max 2 participants) */
export async function joinRoom(roomId: string, _userId: string): Promise<{ ok: boolean; error?: string }> {
  await ensureAuth();
  const { data, error } = await supabase.rpc('join_room', { p_room_id: roomId });
  if (error) return { ok: false, error: error.message };
  if (data === false) return { ok: false, error: 'Room is full (max 2 users)' };
  return { ok: true };
}

/** Mark messages as seen */
export async function markMessagesSeen(messageIds: string[], userId: string, roomId: string) {
  if (!messageIds.length) return;
  const rows = messageIds.map(mid => ({ message_id: mid, user_id: userId, room_id: roomId }));
  await supabase.from('message_seen').insert(rows).select();
}
