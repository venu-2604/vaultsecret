-- Add unique constraint on full_name to enforce exact-match uniqueness at DB level
ALTER TABLE public.users ADD CONSTRAINT users_full_name_unique UNIQUE (full_name);