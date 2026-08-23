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
  -- 'male' / 'female', only ever asked for on
  -- the covenant path tab -- see gender on
  -- Person in src/hooks/usePeople.ts.
  gender text,
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
  -- Free-text postal address, opened in a maps
  -- app as typed. Same NULL/'' convention as
  -- the contact methods above.
  address text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);
-- create-if-not-exists skips an existing table
-- outright, so columns added after the first
-- run need their own alter.
alter table people
  add column if not exists gender text;
alter table people
  add column if not exists whatsapp text;
alter table people
  add column if not exists messenger text;
alter table people
  add column if not exists address text;
-- Favourites are gone from the app, so the
-- column goes with them. A project created
-- before this still has it; nothing writes it
-- any more, so it would only ever be dead
-- weight. Only runs if the file is re-run.
alter table people
  drop column if exists starred;
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
  -- Person ids this event involves. jsonb for
  -- the same reason as the two arrays above: a
  -- join table would need its own sync path,
  -- and the list only ever moves with its event.
  -- No FK either -- queue ordering across
  -- devices cannot guarantee the person lands
  -- first.
  people jsonb,
  -- Contact events only: which channel it went
  -- through. Keys come from CONTACT_METHODS in
  -- src/constants/contactMethods.ts; left
  -- unconstrained so adding one there needs no
  -- migration.
  contact_method text,
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);
alter table calendar_events
  add column if not exists people jsonb;
alter table calendar_events
  add column if not exists contact_method text;
-- How many times this occurred in one event -- e.g. 5 for a "Miles Run"
-- event covering 5 miles. Only meaningful for a type whose goal_mode is
-- 'quantity'; feeds getGoalContribution() the same way start_time/end_time
-- already do for 'hours' mode.
alter table calendar_events
  add column if not exists quantity integer;
-- What that quantity counts -- 'miles', 'reps'. Free text, and per event rather
-- than per type: nothing reads it but the block that draws it beside the number,
-- so there is no list for a constraint to hold it to.
alter table calendar_events
  add column if not exists units text;
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
-- per-week/per-month and live on goal_entries.target
-- / goal_monthly_entries.target. There is
-- deliberately no per-definition default target;
-- an unset week or month resolves to 0.
--
-- `visible` and `monthly_visible` are independent:
-- a goal can show on the weekly grid, the monthly
-- grid, neither, or both. There is no separate
-- monthly goal list -- just the one definition
-- with a second visibility flag.
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
  monthly_visible boolean default false,
  built_in boolean default false,
  -- Tombstone: a built-in goal is always regenerated from the app's shipped
  -- defaults unless this is set, so deleting one has to be remembered rather
  -- than expressed by the row's absence.
  removed boolean not null default false,
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
-- This goal's position in the weekly grid / monthly grid, independent of each
-- other — dragging a card in one grid says nothing about the other. `order`
-- is a reserved SQL word, hence `sort_order` here mapped from the app's
-- `order`/`monthlyOrder` fields (see rowMappers.ts FIELD_MAPS).
alter table goal_definitions
  add column if not exists sort_order int;
alter table goal_definitions
  add column if not exists monthly_sort_order int;

-- ── event_type_definitions ─────────────────
-- No icon here, unlike goal_definitions -- a type
-- has no icon of its own; the only place one is
-- ever shown is a quick-add bubble, and that icon
-- is set per selection in settings.quick_add_types
-- instead. Otherwise mirrors goal_definitions:
-- identity/visibility for event types, plus which
-- goal their completions feed and how. Built-in
-- types carry goal_id/goal_mode
-- too (seeded from BUILTIN_GOAL_LINKS) -- the
-- hardcoded-per-type contribution in
-- getGoalContribution() is gone entirely, prayer's
-- morning/nightly split included: that pair is now
-- late_goal_id + goal_split_time below, so no goal
-- id is written into app code anywhere.
--
-- Built-in type ids are the same literal for
-- every user, so the composite PK is
-- load-bearing here for the same reason it is
-- on goal_definitions.
create table if not exists event_type_definitions (
  user_id uuid not null references auth.users,
  id text not null,
  label text not null,
  visible boolean default true,
  built_in boolean default false,
  goal_id text,
  goal_mode text,
  removed boolean not null default false,
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);
-- A type can split its completions across two goals by time of day:
-- goal_id takes the earlier half, late_goal_id everything from
-- goal_split_time ('2:00 PM' form, same as calendar_events.start_time)
-- onward. Both null means no split and goal_id takes the lot.
--
-- A null here is meaningful, not merely absent: a stored definition is
-- merged over the type's shipped default, so a null goal_id is what
-- records that the user unlinked a built-in, where a missing one would
-- re-seed it. See NULLABLE_COLUMNS in rowMappers.ts.
alter table event_type_definitions
  add column if not exists late_goal_id text;
alter table event_type_definitions
  add column if not exists goal_split_time text;
-- Whether/how completing an event of this type shows a status control:
-- 'checkbox', 'status' (failed/pending/completed), or 'none'. Independent of
-- goal_id/goal_mode -- linking separately decides whether that status also
-- feeds a goal.
alter table event_type_definitions
  add column if not exists report_style text;
-- This type's position in every vertical list it appears in — one shared
-- order, unlike a goal's grain pair. Same reserved-word reasoning as
-- goal_definitions.sort_order above.
alter table event_type_definitions
  add column if not exists sort_order int;
-- A type has no icon of its own -- see the
-- comment on this table above. A project
-- created before that was decided still has
-- these; nothing writes them any more, so they
-- would only ever be dead weight. Only runs if
-- the file is re-run.
alter table event_type_definitions
  drop column if exists icon;
alter table event_type_definitions
  drop column if exists icon_family;
alter table event_type_definitions
  enable row level security;
drop policy if exists "users own their event types"
  on event_type_definitions;
create policy "users own their event types"
  on event_type_definitions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop trigger if exists
  event_type_definitions_set_updated_at
  on event_type_definitions;
create trigger event_type_definitions_set_updated_at
  before insert or update on event_type_definitions
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

-- ── goal_monthly_entries ───────────────────
-- Same shape and reasoning as goal_entries, one
-- grain up: month_key ("2025-08") instead of
-- week_key. A goal's count/target here are
-- tracked independently of its weekly ones --
-- completing an event contributes to whichever
-- of this table and goal_entries the goal is
-- currently visible in, derived client-side from
-- events falling in the calendar month.
create table if not exists goal_monthly_entries (
  user_id uuid not null references auth.users,
  goal_id text not null,
  month_key text not null,
  count int,
  target int,
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  primary key (user_id, goal_id, month_key),
  constraint goal_monthly_entries_month_key_format
    check (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
alter table goal_monthly_entries
  enable row level security;
drop policy if exists "users own their monthly entries"
  on goal_monthly_entries;
create policy "users own their monthly entries"
  on goal_monthly_entries
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop trigger if exists
  goal_monthly_entries_set_updated_at
  on goal_monthly_entries;
create trigger goal_monthly_entries_set_updated_at
  before insert or update on goal_monthly_entries
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

-- ── convert_progress ───────────────────────
-- One row per convert: id is the person's own
-- id, since there's only ever one path per
-- person. No FK to people -- same reasoning as
-- calendar_events.people and goal_entries:
-- queue ordering across devices can't
-- guarantee the person row lands first.
create table if not exists convert_progress (
  user_id uuid not null references auth.users,
  id text not null,
  -- Milestone ids the convert has completed,
  -- out of COVENANT_PATH_MILESTONES in
  -- src/constants/covenantPath.ts. Whether
  -- priesthood ordination belongs on the list
  -- at all comes from people.gender instead.
  completed jsonb default '[]'::jsonb,
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);
alter table convert_progress
  enable row level security;
drop policy if exists
  "users own their convert progress"
  on convert_progress;
create policy
  "users own their convert progress"
  on convert_progress
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop trigger if exists
  convert_progress_set_updated_at
  on convert_progress;
create trigger convert_progress_set_updated_at
  before insert or update on convert_progress
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
  language text default 'en',
  -- Undefaulted, like event_size: the shipped
  -- starting colour has moved once already and
  -- a copy here would silently drift from
  -- DEFAULT_THEME_COLOR. fromRow skips nulls,
  -- so a null lands on the client default.
  theme_color text,
  -- Same reasoning as theme_color: light/dark are
  -- independent settings (no auto dark-mode lift),
  -- so each gets its own undefaulted column mirroring
  -- DEFAULT_SECONDARY_COLOR_LIGHT/DARK and
  -- DEFAULT_TERTIARY_COLOR_LIGHT/DARK in useSettings.ts.
  secondary_color_light text,
  secondary_color_dark text,
  tertiary_color_light text,
  tertiary_color_dark text,
  grid_start_hour int default 6,
  grid_end_hour int default 24,
  event_size text,
  event_type_colors jsonb
    default '{}'::jsonb,
  event_type_default_minutes jsonb
    default '{}'::jsonb,
  -- Up to 8 {id, icon, iconFamily} objects, in
  -- bubble order -- see QuickAddTypesModal.
  quick_add_types jsonb
    default '[]'::jsonb,
  default_country_code text default '+1',
  default_contact_method text
    default 'phone',
  -- iOS only: which app an address opens in.
  -- Android always uses Google Maps.
  maps_app text default 'apple',
  daily_review_enabled boolean default false,
  daily_review_hour int default 22,
  daily_review_minute int default 0,
  event_reminder_enabled boolean default false,
  event_reminder_minutes int default 5,
  -- Event type ids excluded from reminders. Absence (the
  -- default empty array) means every type reminds -- see
  -- AppSettings.eventReminderExcludedTypeIds.
  event_reminder_excluded_type_ids jsonb
    default '[]'::jsonb,
  -- Whether this account has completed (or skipped) the
  -- welcome flow -- see AppSettings.hasOnboarded. Synced
  -- per-account on purpose: onboarding seeds real account
  -- data, so it must not replay on a second device or after
  -- a sign-out/sign-in, only for a genuinely fresh account.
  has_onboarded boolean default false,
  updated_at timestamptz default now()
);
alter table settings
  add column if not exists
  quick_add_types jsonb default '[]'::jsonb;
alter table settings
  add column if not exists
  default_country_code text default '+1';
alter table settings
  add column if not exists
  maps_app text default 'apple';
alter table settings
  add column if not exists
  theme_color text;
alter table settings
  add column if not exists
  default_contact_method text
  default 'phone';
alter table settings
  add column if not exists
  secondary_color_light text;
alter table settings
  add column if not exists
  secondary_color_dark text;
alter table settings
  add column if not exists
  tertiary_color_light text;
alter table settings
  add column if not exists
  tertiary_color_dark text;
alter table settings
  add column if not exists
  daily_review_enabled boolean default false;
alter table settings
  add column if not exists
  daily_review_hour int default 22;
alter table settings
  add column if not exists
  daily_review_minute int default 0;
alter table settings
  add column if not exists
  event_reminder_enabled boolean default false;
alter table settings
  add column if not exists
  event_reminder_minutes int default 5;
alter table settings
  add column if not exists
  event_reminder_excluded_type_ids jsonb default '[]'::jsonb;
alter table settings
  add column if not exists
  language text default 'en';
alter table settings
  add column if not exists
  time_format text default '12h';
alter table settings
  add column if not exists
  has_onboarded boolean default false;
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
     event_type_definitions,
     goal_entries,
     goal_monthly_entries,
     event_statuses,
     convert_progress,
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
  event_type_definitions_user_updated_idx
  on event_type_definitions (user_id, updated_at);
create index if not exists
  goal_entries_user_updated_idx
  on goal_entries (user_id, updated_at);
create index if not exists
  goal_monthly_entries_user_updated_idx
  on goal_monthly_entries (user_id, updated_at);
create index if not exists
  event_statuses_user_updated_idx
  on event_statuses (user_id, updated_at);
create index if not exists
  convert_progress_user_updated_idx
  on convert_progress (user_id, updated_at);
