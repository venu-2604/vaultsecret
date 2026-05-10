ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_type text;

CREATE OR REPLACE FUNCTION public.set_user_avatar_type(p_user_id uuid, p_avatar_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_avatar_type NOT IN ('boy', 'girl') THEN
    RAISE EXCEPTION 'Invalid avatar_type: %', p_avatar_type;
  END IF;
  UPDATE public.users
  SET avatar_type = p_avatar_type
  WHERE id = p_user_id;
END;
$$;
