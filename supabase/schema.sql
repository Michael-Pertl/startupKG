-- Optional Supabase market-event review storage. Ask needs no database or account.
create extension if not exists pgcrypto;

create table if not exists public.market_event_candidates (
  candidate_id text primary key,
  company_name text not null,
  event_type text not null,
  ipo_stage text check (ipo_stage is null or ipo_stage in ('watch', 'filing', 'pricing', 'listed')),
  event_date date,
  year integer,
  country text,
  region text,
  amount_usd bigint,
  valuation_usd bigint,
  source_url text not null,
  source_type text not null,
  confidence text not null default 'medium',
  status text not null default 'needs_review'
    check (status in ('auto_ingested', 'needs_review', 'staged', 'approved', 'rejected', 'promotion_ready', 'promoted')),
  linked_startup_id text,
  linked_startup_label text,
  summary text,
  notes text,
  raw_payload jsonb not null default '{}'::jsonb,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.market_event_candidates
  add column if not exists ipo_stage text check (ipo_stage is null or ipo_stage in ('watch', 'filing', 'pricing', 'listed')),
  add column if not exists linked_startup_id text,
  add column if not exists linked_startup_label text;

alter table public.market_event_candidates
  drop constraint if exists market_event_candidates_status_check;

alter table public.market_event_candidates
  add constraint market_event_candidates_status_check
  check (status in ('auto_ingested', 'needs_review', 'staged', 'approved', 'rejected', 'promotion_ready', 'promoted'));

create table if not exists public.market_event_reviews (
  review_id uuid primary key default gen_random_uuid(),
  candidate_id text not null references public.market_event_candidates(candidate_id) on delete cascade,
  reviewer_user_id uuid references auth.users(id) on delete set null,
  reviewer_email text,
  previous_status text,
  next_status text not null,
  review_notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_market_event_candidates_status_date
  on public.market_event_candidates (status, event_date desc);

create index if not exists idx_market_event_candidates_linked_startup
  on public.market_event_candidates (linked_startup_id)
  where linked_startup_id is not null;

create index if not exists idx_market_event_reviews_candidate_created
  on public.market_event_reviews (candidate_id, created_at desc);

alter table public.market_event_candidates enable row level security;
alter table public.market_event_reviews enable row level security;
