
## Migration: Add push notification triggers

1. Add unique constraint on device_tokens(user_id, room_id, token) for upsert support
2. Enable pg_net extension for HTTP calls from triggers
3. Create trigger function on messages INSERT to call send-push-notification edge function
4. Create trigger function on room_participants UPDATE (is_online change) to call edge function
5. Create the triggers on the respective tables

```sql
-- Enable pg_net for HTTP requests from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Add unique constraint for upsert
ALTER TABLE public.device_tokens 
ADD CONSTRAINT device_tokens_user_room_token_unique 
UNIQUE (user_id, room_id, token);

-- Trigger function for new messages
CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sender_name text;
BEGIN
  -- Get sender name
  SELECT full_name INTO sender_name 
  FROM public.users 
  WHERE id::text = NEW.sender_id 
  LIMIT 1;

  -- Call edge function via pg_net
  PERFORM net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1) || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1)
    ),
    body := jsonb_build_object(
      'type', 'new_message',
      'room_id', NEW.room_id,
      'sender_id', NEW.sender_id,
      'sender_name', COALESCE(sender_name, 'Someone')
    )
  );

  RETURN NEW;
END;
$$;

-- Trigger function for presence changes
CREATE OR REPLACE FUNCTION public.notify_presence_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_name text;
BEGIN
  -- Only trigger when user goes online
  IF NEW.is_online = true AND (OLD.is_online IS NULL OR OLD.is_online = false) THEN
    SELECT full_name INTO user_name 
    FROM public.users 
    WHERE id = NEW.user_id 
    LIMIT 1;

    PERFORM net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1) || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1)
      ),
      body := jsonb_build_object(
        'type', 'user_online',
        'room_id', NEW.room_id,
        'sender_id', NEW.user_id::text,
        'sender_name', COALESCE(user_name, 'Someone')
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create triggers
CREATE TRIGGER on_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_message();

CREATE TRIGGER on_presence_change
  AFTER UPDATE ON public.room_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_presence_change();
```
