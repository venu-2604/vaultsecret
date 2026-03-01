import { supabase } from '@/integrations/supabase/client';

const USER_KEY = 'vs_user_id';

export interface VSUser {
  id: string;
  full_name: string;
  created_at: string;
  auth_uid?: string;
}

/** Sanitize full_name – preserve original casing, allow numbers & special chars */
export function sanitizeName(name: string): string {
  return name.trim().replace(/<[^>]*>/g, '');
}

export function validateName(name: string): string | null {
  const sanitized = sanitizeName(name);
  if (sanitized.length < 3) return 'Name must be at least 3 characters';
  if (sanitized.length > 50) return 'Name must be less than 50 characters';
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

export async function getUserById(id: string): Promise<VSUser | null> {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single();
  return data as VSUser | null;
}

/**
 * Find user by display name (case-insensitive, trimmed).
 * Uses DB RPC so lookup works regardless of RLS on users table.
 */
export async function findUserByName(name: string): Promise<VSUser | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const { data, error } = await supabase.rpc('get_user_by_name', { _name: trimmed });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.id) return null;
  return row as VSUser;
}



/** Link the current anonymous auth session to an app user */
export async function linkAuthUid(userId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const authUid = session.user.id;
  
  // Update the user's auth_uid to the current session
  await supabase
    .from('users')
    .update({ auth_uid: authUid })
    .eq('id', userId);
}

export async function createUser(name: string): Promise<VSUser> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name is required');

  // Check if name already exists (case-insensitive)
  const existing = await findUserByName(trimmed);
  if (existing) {
    throw new Error('NAME_EXISTS');
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No auth session');

  const { data, error } = await supabase
    .from('users')
    .insert({ full_name: trimmed, auth_uid: session.user.id })
    .select()
    .single();

  if (error) {
    // Unique constraint violation (duplicate username, e.g. race or DB constraint)
    if (error.code === '23505') throw new Error('NAME_EXISTS');
    throw error;
  }
  return data as VSUser;
}

/** Join room (server-side: atomic, enforces 2-user limit). Uses current auth user. */
export async function joinRoom(roomId: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('join_room', { p_room_id: roomId });
  if (error) return { ok: false, error: error.message };
  if (data === false) return { ok: false, error: 'Room is full (max 2 users)' };
  return { ok: true };
}

/** Get the other participant's user id in a 2-user room (null if none or multiple) */
export async function getPeerUserId(roomId: string, currentUserId: string): Promise<string | null> {
  const { data } = await supabase
    .from('room_participants')
    .select('user_id')
    .eq('room_id', roomId);
  const ids = (data || []).map((r) => r.user_id).filter((id) => id !== currentUserId);
  return ids.length === 1 ? ids[0]! : null;
}

/** Mark messages as seen by the current user */
export async function markMessagesSeen(messageIds: string[], userId: string, roomId: string) {
  if (!messageIds.length) return;
  const rows = messageIds.map((mid) => ({ message_id: mid, user_id: userId, room_id: roomId }));
  await supabase.from('message_seen').insert(rows).select();
}

/** Fetch message IDs that a given user has seen in a room (for "seen by peer" on our messages) */
export async function getSeenMessageIds(roomId: string, userId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('message_seen')
    .select('message_id')
    .eq('room_id', roomId)
    .eq('user_id', userId);
  return new Set((data || []).map((r) => r.message_id));
}
