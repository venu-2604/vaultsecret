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

export async function findUserByName(name: string): Promise<VSUser | null> {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('full_name', name)
    .maybeSingle();
  return data as VSUser | null;
}



/** Link the current anonymous auth session to an app user */
export async function linkAuthUid(userId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const authUid = session.user.id;
  
  // Update the user's auth_uid to the current session
  await supabase
    .from('users')
    .update({ auth_uid: authUid } as any)
    .eq('id', userId);
}

export async function createUser(name: string): Promise<VSUser> {
  // Check if name already exists
  const existing = await findUserByName(name);
  if (existing) {
    throw new Error('NAME_EXISTS');
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No auth session');

  const { data, error } = await supabase
    .from('users')
    .insert({ full_name: name, auth_uid: session.user.id } as any)
    .select()
    .single();
  if (error) throw error;
  return data as VSUser;
}

/** Check if room has space (max 2 participants) */
export async function joinRoom(roomId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  // Check existing participants
  const { data: participants } = await supabase
    .from('room_participants')
    .select('user_id')
    .eq('room_id', roomId);

  const uniqueUsers = new Set((participants || []).map(p => p.user_id));

  // Already in room
  if (uniqueUsers.has(userId)) return { ok: true };

  // Room full
  if (uniqueUsers.size >= 2) return { ok: false, error: 'Room is full (max 2 users)' };

  // Join
  const { error } = await supabase
    .from('room_participants')
    .insert({ room_id: roomId, user_id: userId });

  if (error && error.code !== '23505') return { ok: false, error: error.message };
  return { ok: true };
}

/** Mark messages as seen */
export async function markMessagesSeen(messageIds: string[], userId: string, roomId: string) {
  if (!messageIds.length) return;
  const rows = messageIds.map(mid => ({ message_id: mid, user_id: userId, room_id: roomId }));
  await supabase.from('message_seen').insert(rows).select();
}
