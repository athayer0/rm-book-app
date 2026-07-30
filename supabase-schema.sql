-- Run in Supabase: SQL Editor -> New query.
-- Lines are kept under 50 chars because long
-- lines get truncated on paste.

-- ── updated_at is stamped server-side ──────
-- Column defaults do NOT fire on UPDATE, so a
-- tombstone written by drainQueue would keep
-- its old updated_at and never show up in the
-- incremental pull -- i.e. deletes made on one
-- device would be invisible to every other.
-- Stamping here also keeps the sync watermark
-- on a single clock.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

-- ── people ─────────────────────────────────
-- PK is (user_id, id) everywhere: ids are
-- generated client-side and are not namespaced
-- per user, so a bare id PK would let one
-- account's row block another's.
create table if not exists people (
  user_id uuid not null references auth.users,
  id text not null,
  name text not null,
  status text,
  phone text,
  -- Optional contact methods. NULL means the
  -- person has no such section in the editor;
  -- '' means the section exists but is empty.
  whatsapp text,
  -- Whatever identifies the Facebook profile:
  -- an m.me/facebook.com link or a username.
  -- Parsed into an m.me handle client-side by
  -- toMessengerHandle() in phoneUtils.ts.
  messenger text,
  notes text,
  starred boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);
-- create-if-not-exists skips an existing table
-- outright, so columns added after the first
-- run need their own alter.
alter table people
  add column if not exists whatsapp text;
alter table people
  add column if not exists messenger text;
alter table people enable row level security;
drop policy if exists "users own their people"
  on people;
create policy "users own their people" on people
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop trigger if exists people_set_updated_at
  on people;
create trigger people_set_updated_at
  before insert or update on people
  for each row
  execute function set_updated_at();

-- ── calendar_events ────────────────────────
create table if not exists calendar_events (
  user_id uuid not null references auth.users,
  id text not null,
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
  backup boolean default false,
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);
alter table calendar_events
  enable row level security;
drop policy if exists "users own their events"
  on calendar_events;
create policy "users own their events"
  on calendar_events
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop trigger if exists
  calendar_events_set_updated_at
  on calendar_events;
create trigger calendar_events_set_updated_at
  before insert or update on calendar_events
  for each row
  execute function set_updated_at();

-- ── goal_definitions ───────────────────────
-- Identity and presentation only: label, icon,
-- colour, visibility, and the existence of a
-- custom goal. Targets are NOT here -- they are
-- per-week and live on goal_entries.target.
-- There is deliberately no per-definition
-- default target; an unset week resolves to 0.
--
-- Built-in goal ids ('morning_prayer', ...)
-- are the same literal for every user, so the
-- composite PK is load-bearing here: a bare id
-- PK would let the first account to sync claim
-- them and lock everyone else out for good.
create table if not exists goal_definitions (
  user_id uuid not null references auth.users,
  id text not null,
  label text not null,
  icon text,
  icon_family text,
  color text,
  visible boolean default true,
  built_in boolean default false,
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);
alter table goal_definitions
  enable row level security;
drop policy if exists "users own their goals"
  on goal_definitions;
create policy "users own their goals"
  on goal_definitions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop trigger if exists
  goal_definitions_set_updated_at
  on goal_definitions;
create trigger goal_definitions_set_updated_at
  before insert or update on goal_definitions
  for each row
  execute function set_updated_at();

-- ── goal_entries ───────────────────────────
-- count (how many) and target (how many were
-- aimed for) share a grain, so they share a
-- row. Both nullable and undefaulted, because
-- resolveGoal() distinguishes "unset" from 0 --
-- a target-only row for a future week must not
-- fabricate a count of 0.
--
-- Each writer sends ONLY its own column.
-- PostgREST builds SET col = EXCLUDED.col just
-- for keys present in the payload, so a count
-- write cannot null out a target. Do not
-- "helpfully" send the full row from either.
--
-- Deliberately no FK to goal_definitions: the
-- built-in definitions are not pushed until
-- the user edits them, so an FK would make the
-- very first increment() fail and re-queue
-- forever. Orphan entries are harmless -- the
-- UI iterates definitions, never entries.
create table if not exists goal_entries (
  user_id uuid not null references auth.users,
  goal_id text not null,
  week_key text not null,
  count int,
  target int,
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  primary key (user_id, goal_id, week_key),
  constraint goal_entries_week_key_format
    check (week_key ~ '^[0-9]{4}-W[0-9]{2}$')
);
alter table goal_entries
  enable row level security;
drop policy if exists "users own their entries"
  on goal_entries;
create policy "users own their entries"
  on goal_entries
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop trigger if exists
  goal_entries_set_updated_at
  on goal_entries;
create trigger goal_entries_set_updated_at
  before insert or update on goal_entries
  for each row
  execute function set_updated_at();

-- ── event_statuses ─────────────────────────
-- One row per occurrence rather than a jsonb
-- blob: the blob would be rewritten whole on
-- every tap, and two devices marking different
-- days of the same week would clobber each
-- other -- the exact failure this table exists
-- to avoid. occurrence_date is a real date, so
-- PostgREST serialises it as yyyy-MM-dd, which
-- is byte-identical to the dateStr half of the
-- local `${eventId}::${dateStr}` key.
--
-- No FK to calendar_events: queue ordering
-- across devices cannot guarantee the event
-- row lands first.
create table if not exists event_statuses (
  user_id uuid not null references auth.users,
  event_id text not null,
  occurrence_date date not null,
  status text not null,
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  primary key
    (user_id, event_id, occurrence_date),
  constraint event_statuses_status_values
    check (status in
      ('completed', 'failed', 'pending'))
);
alter table event_statuses
  enable row level security;
drop policy if exists
  "users own their statuses"
  on event_statuses;
create policy "users own their statuses"
  on event_statuses
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop trigger if exists
  event_statuses_set_updated_at
  on event_statuses;
create trigger event_statuses_set_updated_at
  before insert or update on event_statuses
  for each row
  execute function set_updated_at();

-- ── settings ───────────────────────────────
-- Scalars get real columns. The two maps are
-- keyed by arbitrary event-type strings, so a
-- column per type is unmaintainable -> jsonb,
-- matching the precedent set by excluded_dates
-- and recurring_days above.
--
-- Defaults mirror DEFAULT_SETTINGS in
-- src/hooks/useSettings.ts.
create table if not exists settings (
  user_id uuid primary key
    references auth.users,
  week_start text default 'monday',
  theme text default 'light',
  grid_start_hour int default 6,
  grid_end_hour int default 24,
  event_size text,
  event_type_colors jsonb
    default '{}'::jsonb,
  event_type_default_minutes jsonb
    default '{}'::jsonb,
  default_country_code text default '+1',
  updated_at timestamptz default now()
);
alter table settings
  add column if not exists
  default_country_code text default '+1';
alter table settings enable row level security;
drop policy if exists "users own their settings"
  on settings;
create policy "users own their settings"
  on settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop trigger if exists settings_set_updated_at
  on settings;
create trigger settings_set_updated_at
  before insert or update on settings
  for each row
  execute function set_updated_at();

-- ── grants ─────────────────────────────────
-- Two separate gates: GRANT decides whether the
-- role may touch the TABLE at all, RLS decides
-- which ROWS it then sees. Enabling RLS without
-- granting means every request fails 42501
-- before the policy is ever consulted.
--
-- Supabase applies default privileges to new
-- tables in public, but "drop table" takes the
-- existing grants down with it, so a recreate
-- has to reapply them explicitly.
grant usage on schema public to authenticated;
grant select, insert, update, delete
  on people,
     calendar_events,
     goal_definitions,
     goal_entries,
     event_statuses,
     settings
  to authenticated;

-- ── indexes ────────────────────────────────
-- Backs pullAll() in src/lib/sync.ts, which
-- filters on user_id and updated_at, plus the
-- user_id predicate RLS adds to every query.
-- settings needs none: one row per user, and
-- user_id is already its primary key.
create index if not exists
  people_user_updated_idx
  on people (user_id, updated_at);
create index if not exists
  calendar_events_user_updated_idx
  on calendar_events (user_id, updated_at);
create index if not exists
  goal_definitions_user_updated_idx
  on goal_definitions (user_id, updated_at);
create index if not exists
  goal_entries_user_updated_idx
  on goal_entries (user_id, updated_at);
create index if not exists
  event_statuses_user_updated_idx
  on event_statuses (user_id, updated_at);
