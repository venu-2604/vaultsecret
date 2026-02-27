
-- Step 1: Add auth_uid column to users table to link app users to anonymous sessions
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_uid UUID UNIQUE;

-- Step 2: Create security definer function to get app user id from auth session
CREATE OR REPLACE FUNCTION public.get_app_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.users WHERE auth_uid = auth.uid() LIMIT 1;
$$;

-- Step 3: Create security definer function to check room membership
CREATE OR REPLACE FUNCTION public.is_room_member(_room_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_participants
    WHERE room_id = _room_id
      AND user_id = (SELECT id FROM public.users WHERE auth_uid = auth.uid() LIMIT 1)
  );
$$;

-- Step 4: Drop ALL existing RLS policies

-- users
DROP POLICY IF EXISTS "Authenticated users can read users" ON public.users;
DROP POLICY IF EXISTS "Authenticated users can insert users" ON public.users;
DROP POLICY IF EXISTS "Anyone can insert users" ON public.users;
DROP POLICY IF EXISTS "Anyone can read users" ON public.users;

-- messages
DROP POLICY IF EXISTS "Authenticated users can read messages" ON public.messages;
DROP POLICY IF EXISTS "Authenticated users can insert messages" ON public.messages;
DROP POLICY IF EXISTS "Anyone can insert messages" ON public.messages;
DROP POLICY IF EXISTS "Anyone can read messages by room_id" ON public.messages;

-- room_participants
DROP POLICY IF EXISTS "Authenticated users can read room participants" ON public.room_participants;
DROP POLICY IF EXISTS "Authenticated users can join rooms" ON public.room_participants;
DROP POLICY IF EXISTS "Anyone can join rooms" ON public.room_participants;
DROP POLICY IF EXISTS "Anyone can read room participants" ON public.room_participants;

-- message_seen
DROP POLICY IF EXISTS "Authenticated users can read seen status" ON public.message_seen;
DROP POLICY IF EXISTS "Authenticated users can mark as seen" ON public.message_seen;
DROP POLICY IF EXISTS "Anyone can mark as seen" ON public.message_seen;
DROP POLICY IF EXISTS "Anyone can read seen status" ON public.message_seen;

-- Step 5: Create new secure PERMISSIVE RLS policies

-- USERS table
-- Allow authenticated users to read all users (needed for username lookup)
CREATE POLICY "Authed can read users"
ON public.users FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Allow insert only if auth_uid matches the current session
CREATE POLICY "Authed can create own user"
ON public.users FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND auth_uid = auth.uid());

-- Allow user to update their own record (for linking auth_uid)
CREATE POLICY "User can update own record"
ON public.users FOR UPDATE
USING (auth_uid = auth.uid())
WITH CHECK (auth_uid = auth.uid());

-- MESSAGES table
-- Only room participants can read messages in their rooms
CREATE POLICY "Room members can read messages"
ON public.messages FOR SELECT
USING (public.is_room_member(room_id));

-- Only room participants can insert messages, and sender_id must match their app user id
CREATE POLICY "Room members can send messages"
ON public.messages FOR INSERT
WITH CHECK (
  public.is_room_member(room_id)
  AND sender_id = (public.get_app_user_id())::text
);

-- ROOM_PARTICIPANTS table
-- Room members can see who's in their room
CREATE POLICY "Room members can read participants"
ON public.room_participants FOR SELECT
USING (public.is_room_member(room_id));

-- Authenticated users can join rooms (app enforces 2-user limit)
-- user_id must match their app user id
CREATE POLICY "Authed can join rooms"
ON public.room_participants FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND user_id = public.get_app_user_id()
);

-- MESSAGE_SEEN table
-- Only room members can read seen status
CREATE POLICY "Room members can read seen"
ON public.message_seen FOR SELECT
USING (public.is_room_member(room_id));

-- Only room members can mark messages seen, and user_id must be their own
CREATE POLICY "Room members can mark seen"
ON public.message_seen FOR INSERT
WITH CHECK (
  public.is_room_member(room_id)
  AND user_id = public.get_app_user_id()
);
