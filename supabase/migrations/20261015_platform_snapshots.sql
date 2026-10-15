-- Only service-role clients can read/write evidence and published snapshots.
-- Public browsers receive graph assets through the application server.
create table if not exists public.platform_snapshots (
  id text primary key check (id = 'current'),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.platform_snapshots enable row level security;
revoke all on public.platform_snapshots from anon, authenticated;
grant select, insert, update on public.platform_snapshots to service_role;
