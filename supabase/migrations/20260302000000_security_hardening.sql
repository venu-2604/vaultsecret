-- 1) get_user_by_name: return only safe columns (no auth_uid)
CREATE OR REPLACE FUNCTION public.get_user_by_name(_name text)
RETURNS TABLE(id uuid, full_name text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.full_name, u.created_at
  FROM public.users u
  WHERE LOWER(TRIM(u.full_name)) = LOWER(TRIM(_name))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_by_name(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_by_name(text) TO anon;

-- 2) RLS on users: allow reading only your own row (no enumeration)
DROP POLICY IF EXISTS "Authed can read users" ON public.users;
DROP POLICY IF EXISTS "Authenticated users can read users" ON public.users;
CREATE POLICY "Users can read own row only"
ON public.users FOR SELECT
USING (auth_uid = auth.uid());

-- 3) Unique (room_id, user_id) for atomic join and ON CONFLICT
CREATE UNIQUE INDEX IF NOT EXISTS room_participants_room_user_unique
  ON public.room_participants (room_id, user_id);

-- 4) Atomic join_room with server-side 2-user limit (no race)
CREATE OR REPLACE FUNCTION public.join_room(p_room_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_count   int;
BEGIN
  v_user_id := public.get_app_user_id();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Serialize concurrent joins for this room
  PERFORM pg_advisory_xact_lock(hashtext(p_room_id));

  SELECT COUNT(DISTINCT user_id) INTO v_count
  FROM public.room_participants
  WHERE room_id = p_room_id;

  IF v_count >= 2 THEN
    RETURN false;
  END IF;

  INSERT INTO public.room_participants (room_id, user_id)
  VALUES (p_room_id, v_user_id)
  ON CONFLICT (room_id, user_id) DO NOTHING;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_room(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_room(text) TO anon;
