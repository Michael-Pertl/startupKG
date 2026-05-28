-- Supabase/Postgres schema for Ask paywall, metering, and Stripe credit packs.
-- Apply in the Supabase SQL editor or through the Supabase CLI.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  plan text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ask_credit_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  credits_remaining integer not null default 0 check (credits_remaining >= 0),
  lifetime_credits_purchased integer not null default 0 check (lifetime_credits_purchased >= 0),
  lifetime_credits_used integer not null default 0 check (lifetime_credits_used >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.ask_credit_ledger (
  ledger_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,
  balance_after integer not null check (balance_after >= 0),
  reason text not null check (reason in ('trial_grant', 'stripe_purchase', 'ask_usage', 'manual_adjustment', 'refund')),
  stripe_event_id text,
  ask_usage_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ask_usage_events (
  usage_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  model text not null,
  credits_charged integer not null check (credits_charged > 0),
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  selected_entity_id text,
  selected_entity_label text,
  question_chars integer,
  status text not null default 'ok' check (status in ('ok', 'model_error', 'blocked', 'insufficient_credits')),
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.stripe_events (
  stripe_event_id text primary key,
  event_type text not null,
  user_id uuid references auth.users(id) on delete set null,
  credits_granted integer,
  amount_total_cents integer,
  currency text,
  processed_at timestamptz not null default now(),
  payload jsonb not null
);

create index if not exists idx_ask_credit_ledger_user_created
  on public.ask_credit_ledger (user_id, created_at desc);

create index if not exists idx_ask_usage_events_user_created
  on public.ask_usage_events (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.ask_credit_accounts enable row level security;
alter table public.ask_credit_ledger enable row level security;
alter table public.ask_usage_events enable row level security;
alter table public.stripe_events enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "credit_accounts_select_own" on public.ask_credit_accounts;
create policy "credit_accounts_select_own"
  on public.ask_credit_accounts for select
  using (auth.uid() = user_id);

drop policy if exists "credit_ledger_select_own" on public.ask_credit_ledger;
create policy "credit_ledger_select_own"
  on public.ask_credit_ledger for select
  using (auth.uid() = user_id);

drop policy if exists "usage_events_select_own" on public.ask_usage_events;
create policy "usage_events_select_own"
  on public.ask_usage_events for select
  using (auth.uid() = user_id);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  trial_credits integer := 10;
begin
  insert into public.profiles (user_id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', new.email))
  on conflict (user_id) do nothing;

  insert into public.ask_credit_accounts (
    user_id,
    credits_remaining,
    lifetime_credits_purchased,
    lifetime_credits_used
  )
  values (new.id, trial_credits, trial_credits, 0)
  on conflict (user_id) do nothing;

  insert into public.ask_credit_ledger (user_id, delta, balance_after, reason, metadata)
  values (new.id, trial_credits, trial_credits, 'trial_grant', '{"source":"signup"}'::jsonb);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

create or replace function public.get_ask_credit_balance(target_user_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  select coalesce(credits_remaining, 0)
  from public.ask_credit_accounts
  where user_id = target_user_id;
$$;

create or replace function public.grant_ask_credits(
  target_user_id uuid,
  credit_amount integer,
  grant_reason text,
  stripe_event_id text default null,
  grant_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance integer;
begin
  if credit_amount <= 0 then
    raise exception 'credit_amount must be positive';
  end if;

  insert into public.ask_credit_accounts (user_id, credits_remaining, lifetime_credits_purchased)
  values (target_user_id, credit_amount, credit_amount)
  on conflict (user_id) do update
    set credits_remaining = public.ask_credit_accounts.credits_remaining + excluded.credits_remaining,
        lifetime_credits_purchased = public.ask_credit_accounts.lifetime_credits_purchased + excluded.lifetime_credits_purchased,
        updated_at = now()
  returning credits_remaining into new_balance;

  insert into public.ask_credit_ledger (
    user_id,
    delta,
    balance_after,
    reason,
    stripe_event_id,
    metadata
  )
  values (
    target_user_id,
    credit_amount,
    new_balance,
    grant_reason,
    stripe_event_id,
    grant_metadata
  );

  return new_balance;
end;
$$;

create or replace function public.consume_ask_credits(
  target_user_id uuid,
  credit_amount integer,
  usage_metadata jsonb default '{}'::jsonb
)
returns table(usage_id uuid, balance_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_balance integer;
  new_balance integer;
  new_usage_id uuid;
begin
  if credit_amount <= 0 then
    raise exception 'credit_amount must be positive';
  end if;

  select credits_remaining
  into current_balance
  from public.ask_credit_accounts
  where user_id = target_user_id
  for update;

  if current_balance is null or current_balance < credit_amount then
    insert into public.ask_usage_events (
      user_id,
      model,
      credits_charged,
      selected_entity_id,
      selected_entity_label,
      question_chars,
      status,
      error_message
    )
    values (
      target_user_id,
      coalesce(usage_metadata->>'model', 'unknown'),
      credit_amount,
      usage_metadata->>'selected_entity_id',
      usage_metadata->>'selected_entity_label',
      nullif(usage_metadata->>'question_chars', '')::integer,
      'insufficient_credits',
      'Insufficient Ask credits'
    );
    raise exception 'insufficient Ask credits';
  end if;

  new_balance := current_balance - credit_amount;

  update public.ask_credit_accounts
  set credits_remaining = new_balance,
      lifetime_credits_used = lifetime_credits_used + credit_amount,
      updated_at = now()
  where user_id = target_user_id;

  insert into public.ask_usage_events (
    user_id,
    model,
    credits_charged,
    prompt_tokens,
    completion_tokens,
    total_tokens,
    selected_entity_id,
    selected_entity_label,
    question_chars,
    status
  )
  values (
    target_user_id,
    coalesce(usage_metadata->>'model', 'unknown'),
    credit_amount,
    nullif(usage_metadata->>'prompt_tokens', '')::integer,
    nullif(usage_metadata->>'completion_tokens', '')::integer,
    nullif(usage_metadata->>'total_tokens', '')::integer,
    usage_metadata->>'selected_entity_id',
    usage_metadata->>'selected_entity_label',
    nullif(usage_metadata->>'question_chars', '')::integer,
    'ok'
  )
  returning public.ask_usage_events.usage_id into new_usage_id;

  insert into public.ask_credit_ledger (
    user_id,
    delta,
    balance_after,
    reason,
    ask_usage_id,
    metadata
  )
  values (
    target_user_id,
    -credit_amount,
    new_balance,
    'ask_usage',
    new_usage_id,
    usage_metadata
  );

  return query select new_usage_id, new_balance;
end;
$$;
