-- Enforce unique usernames (case-insensitive, trimmed).
-- "John", "john", " John " are treated as the same and only one is allowed.
-- Run this after resolving any existing duplicate full_name values if needed.

CREATE UNIQUE INDEX IF NOT EXISTS users_full_name_lower_unique
  ON public.users (LOWER(TRIM(full_name)));
