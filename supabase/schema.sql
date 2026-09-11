-- Techlysis — Supabase schema (run this in the Supabase SQL editor)
--
-- Creates: profiles, user_settings, trade_journal, saved_analyses
-- Enables row-level security (users can only touch their own rows) and a
-- trigger that creates a profile + empty settings row on sign-up.
--
-- ONLY the anon key is ever used by the frontend. Never grant service_role
-- to client code.
--
-- After running: the editor should print "Success. No rows returned".
-- That message means the schema applied successfully.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.trade_journal (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  asset text,
  timeframe text,
  direction text,
  entry_price numeric,
  stop_price numeric,
  targets jsonb,
  rr numeric,
  plan_text text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.saved_analyses (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  asset text,
  timeframe text,
  snapshot jsonb,
  created_at timestamptz not null default now()
);

create index if not exists trade_journal_user_idx on public.trade_journal (user_id, created_at desc);
create index if not exists saved_analyses_user_idx on public.saved_analyses (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row-level security: each user can only see/modify their own rows
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.trade_journal enable row level security;
alter table public.saved_analyses enable row level security;

drop policy if exists "profiles_own" on public.profiles;
create policy "profiles_own" on public.profiles
  for all using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "user_settings_own" on public.user_settings;
create policy "user_settings_own" on public.user_settings
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "trade_journal_own" on public.trade_journal;
create policy "trade_journal_own" on public.trade_journal
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "saved_analyses_own" on public.saved_analyses;
create policy "saved_analyses_own" on public.saved_analyses
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Trigger: on auth.users insert → create profile + empty settings
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  insert into public.user_settings (user_id, settings)
  values (new.id, '{}'::jsonb)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
