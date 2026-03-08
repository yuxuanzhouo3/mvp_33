alter table public.user_devices
  add column if not exists push_provider text,
  add column if not exists push_token text,
  add column if not exists push_token_updated_at timestamptz,
  add column if not exists app_package text,
  add column if not exists app_flavor text;

create index if not exists idx_user_devices_push_token
  on public.user_devices (push_token)
  where push_token is not null;

create index if not exists idx_user_devices_user_client_type
  on public.user_devices (user_id, client_type);
