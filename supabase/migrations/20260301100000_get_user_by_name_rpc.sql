-- Username lookup that works regardless of RLS (SECURITY DEFINER).
-- Enables "Verify" / Continue to find existing user by name even when
-- RLS would block reading other users' rows.

CREATE OR REPLACE FUNCTION public.get_user_by_name(_name text)
RETURNS SETOF public.users
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.users
  WHERE LOWER(TRIM(full_name)) = LOWER(TRIM(_name))
  LIMIT 1;
$$;

-- Allow authenticated (including anonymous) users to call this
GRANT EXECUTE ON FUNCTION public.get_user_by_name(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_by_name(text) TO anon;
