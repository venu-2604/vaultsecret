
-- Drop all existing permissive policies on users
DROP POLICY IF EXISTS "Anyone can insert users" ON public.users;
DROP POLICY IF EXISTS "Anyone can read users" ON public.users;

-- Drop all existing permissive policies on messages
DROP POLICY IF EXISTS "Anyone can insert messages" ON public.messages;
DROP POLICY IF EXISTS "Anyone can read messages by room_id" ON public.messages;

-- Drop all existing permissive policies on room_participants
DROP POLICY IF EXISTS "Anyone can join rooms" ON public.room_participants;
DROP POLICY IF EXISTS "Anyone can read room participants" ON public.room_participants;

-- Drop all existing permissive policies on message_seen
DROP POLICY IF EXISTS "Anyone can mark as seen" ON public.message_seen;
DROP POLICY IF EXISTS "Anyone can read seen status" ON public.message_seen;

-- Secure policies for users
CREATE POLICY "Authenticated users can read users"
ON public.users FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert users"
ON public.users FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Secure policies for messages
CREATE POLICY "Authenticated users can read messages"
ON public.messages FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert messages"
ON public.messages FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Secure policies for room_participants
CREATE POLICY "Authenticated users can read room participants"
ON public.room_participants FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can join rooms"
ON public.room_participants FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Secure policies for message_seen
CREATE POLICY "Authenticated users can read seen status"
ON public.message_seen FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can mark as seen"
ON public.message_seen FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);
