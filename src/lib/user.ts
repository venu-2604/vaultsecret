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

/** Ensure we have an anonymous Supabase session */
export async function ensureAnonSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw new Error('Failed to create session: ' + error.message);
  }
}

/** Look up user by full_name using SECURITY DEFINER RPC (bypasses RLS) */
export async function findUserByName(name: string): Promise<VSUser | null> {
  const { data, error } = await supabase.rpc('get_user_by_name', { _name: name });
  if (error || !data || data.length === 0) return null;
  return data[0] as VSUser;
}

/** Get user by ID — requires auth session linked to this user */
export async function getUserById(id: string): Promise<VSUser | null> {
  const { data } = await supabase
    .from('users')
    .select('id, full_name, created_at')
    .eq('id', id)
    .maybeSingle();
  return data as VSUser | null;
}

/** Create a new user and link to current anonymous auth session */
export async function createUser(name: string): Promise<VSUser> {
  await ensureAnonSession();

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No auth session');

  const { data, error } = await supabase
    .from('users')
    .insert({ full_name: name, auth_uid: session.user.id })
    .select('id, full_name, created_at')
    .single();

  if (error) throw error;
  return data as VSUser;
}

/** Link existing user to current anonymous auth session */
export async function linkUserToSession(userId: string): Promise<void> {
  await ensureAnonSession();
  const { error } = await supabase.rpc('link_user_auth', { p_user_id: userId });
  if (error) throw new Error('Failed to link user: ' + error.message);
}

/** Join room using SECURITY DEFINER RPC (enforces max 2 participants) */
export async function joinRoom(roomId: string, _userId: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('join_room', { p_room_id: roomId });
  if (error) return { ok: false, error: error.message };
  if (data === false) return { ok: false, error: 'Room is full (max 2 users)' };
  return { ok: true };
}

/** Mark messages as seen */
export async function markMessagesSeen(messageIds: string[], _userId: string, roomId: string) {
  if (!messageIds.length) return;

  // get_app_user_id is used by RLS, so we just need to insert with correct user_id
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  // Get our app user id
  const { data: appUserId } = await supabase.rpc('get_app_user_id');
  if (!appUserId) return;

  const rows = messageIds.map(mid => ({
    message_id: mid,
    user_id: appUserId,
    room_id: roomId,
  }));

  await supabase.from('message_seen').insert(rows).select();
}
