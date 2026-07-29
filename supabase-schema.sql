-- Run in Supabase: SQL Editor -> New query.
-- Safe to re-run. Lines are kept under 50 chars
-- because long lines get truncated on paste.

create table if not exists people (
  id text primary key,
  user_id uuid not null references auth.users,
  name text not null,
  status text,
  phone text,
  notes text,
  photo_url text,
  starred boolean default false,
  created_at timestamptz default now(),
  last_interaction timestamptz,
  updated_at timestamptz default now(),
  deleted_at timestamptz
);
alter table people enable row level security;
drop policy if exists "users own their people"
  on people;
create policy "users own their people" on people
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table if not exists calendar_events (
  id text primary key,
  user_id uuid not null references auth.users,
  title text not null,
  type text,
  color text,
  date date not null,
  start_time text,
  end_time text,
  notes text,
  recurring boolean default false,
  recurring_rule text,
  recurring_until date,
  excluded_dates jsonb,
  recurring_days jsonb,
  completed boolean default false,
  backup boolean default false,
  updated_at timestamptz default now(),
  deleted_at timestamptz
);
alter table calendar_events
  enable row level security;
-- Columns added after the table first shipped.
-- Kept as separate alters so re-runs on an
-- existing table pick them up too.
alter table calendar_events
  add column if not exists
  recurring_until date;
alter table calendar_events
  add column if not exists
  excluded_dates jsonb;
alter table calendar_events
  add column if not exists
  recurring_days jsonb;
alter table calendar_events
  add column if not exists
  completed boolean default false;
alter table calendar_events
  add column if not exists
  backup boolean default false;
drop policy if exists "users own their events"
  on calendar_events;
create policy "users own their events"
  on calendar_events
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table if not exists indicator_definitions (
  id text primary key,
  user_id uuid not null references auth.users,
  label text not null,
  icon text,
  icon_family text,
  goal int,
  type text,
  color text,
  visible boolean default true,
  built_in boolean default false,
  updated_at timestamptz default now(),
  deleted_at timestamptz
);
alter table indicator_definitions
  enable row level security;
drop policy if exists "users own their indicators"
  on indicator_definitions;
create policy "users own their indicators"
  on indicator_definitions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table if not exists indicator_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  indicator_id text
    references indicator_definitions(id),
  week_key text not null,
  count int default 0,
  updated_at timestamptz default now(),
  unique (user_id, indicator_id, week_key)
);
alter table indicator_entries
  enable row level security;
drop policy if exists "users own their entries"
  on indicator_entries;
create policy "users own their entries"
  on indicator_entries
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table if not exists settings (
  user_id uuid primary key references auth.users,
  week_start text default 'sunday',
  theme text default 'system',
  reminder_enabled boolean default false,
  reminder_time text,
  updated_at timestamptz default now()
);
alter table settings enable row level security;
drop policy if exists "users own their settings"
  on settings;
create policy "users own their settings"
  on settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Backs pullAll() in src/lib/sync.ts, which
-- filters on user_id and updated_at, plus the
-- user_id predicate RLS adds to every query.
create index if not exists
  people_user_updated_idx
  on people (user_id, updated_at);
create index if not exists
  calendar_events_user_updated_idx
  on calendar_events (user_id, updated_at);
create index if not exists
  indicator_definitions_user_updated_idx
  on indicator_definitions (user_id, updated_at);
create index if not exists
  indicator_entries_user_updated_idx
  on indicator_entries (user_id, updated_at);
