-- Run this in your Supabase project: SQL Editor → New query → paste → Run

create table if not exists people (
  id            text primary key,
  user_id       uuid references auth.users not null,
  name          text not null,
  status        text,
  phone         text,
  notes         text,
  photo_url     text,
  starred       boolean default false,
  created_at    timestamptz default now(),
  last_interaction timestamptz,
  updated_at    timestamptz default now(),
  deleted_at    timestamptz
);
alter table people enable row level security;
create policy "users own their people" on people using (auth.uid() = user_id);

create table if not exists calendar_events (
  id             text primary key,
  user_id        uuid references auth.users not null,
  title          text not null,
  type           text,
  color          text,
  date           date not null,
  start_time     text,
  end_time       text,
  notes          text,
  recurring      boolean default false,
  recurring_rule text,
  updated_at     timestamptz default now(),
  deleted_at     timestamptz
);
alter table calendar_events enable row level security;
create policy "users own their events" on calendar_events using (auth.uid() = user_id);

create table if not exists indicator_definitions (
  id          text primary key,
  user_id     uuid references auth.users not null,
  label       text not null,
  icon        text,
  icon_family text,
  goal        int,
  type        text,
  color       text,
  visible     boolean default true,
  built_in    boolean default false,
  updated_at  timestamptz default now(),
  deleted_at  timestamptz
);
alter table indicator_definitions enable row level security;
create policy "users own their indicators" on indicator_definitions using (auth.uid() = user_id);

create table if not exists indicator_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users not null,
  indicator_id text references indicator_definitions(id),
  week_key     text not null,
  count        int default 0,
  updated_at   timestamptz default now(),
  unique (user_id, indicator_id, week_key)
);
alter table indicator_entries enable row level security;
create policy "users own their entries" on indicator_entries using (auth.uid() = user_id);

create table if not exists settings (
  user_id          uuid primary key references auth.users,
  week_start       text default 'sunday',
  theme            text default 'system',
  reminder_enabled boolean default false,
  reminder_time    text,
  updated_at       timestamptz default now()
);
alter table settings enable row level security;
create policy "users own their settings" on settings using (auth.uid() = user_id);
