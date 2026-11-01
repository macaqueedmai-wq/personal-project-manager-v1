-- 006_m5_habits_health.sql
-- Habits, idempotent check-ins, health records and fixed application settings.

create table habits (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  schedule_type text not null,
  weekdays integer[] not null default '{}'::integer[],
  start_on date not null,
  end_on date,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint habits_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint habits_schedule_allowed check (schedule_type in ('daily', 'weekly')),
  constraint habits_weekday_values check (weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::integer[]),
  constraint habits_schedule_shape check (
    (schedule_type = 'daily' and cardinality(weekdays) = 0)
    or (schedule_type = 'weekly' and cardinality(weekdays) between 1 and 7)
  ),
  constraint habits_date_range check (end_on is null or end_on >= start_on),
  constraint habits_description_length check (char_length(description) <= 20000),
  constraint habits_version_positive check (version >= 1)
);

create table habit_entries (
  habit_id uuid not null references habits (id) on update cascade on delete cascade,
  local_date date not null,
  status text not null,
  note text not null default '',
  primary key (habit_id, local_date),
  constraint habit_entries_status_allowed check (status in ('done', 'skipped')),
  constraint habit_entries_note_length check (char_length(note) <= 20000)
);

create index habit_entries_date_idx on habit_entries (local_date);

create table health_entries (
  id uuid primary key default gen_random_uuid(),
  local_date date not null,
  kind text not null,
  activity_name text,
  duration_minutes integer,
  sleep_hours numeric(4, 2),
  note text not null default '',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_entries_kind_allowed check (kind in ('exercise', 'sleep', 'note')),
  constraint health_entries_exercise check (
    kind <> 'exercise'
    or (duration_minutes is not null and duration_minutes > 0)
  ),
  constraint health_entries_sleep check (
    kind <> 'sleep'
    or (sleep_hours is not null and sleep_hours >= 0 and sleep_hours <= 24)
  ),
  constraint health_entries_note check (
    kind <> 'note' or char_length(btrim(note)) > 0
  ),
  constraint health_entries_note_length check (char_length(note) <= 20000),
  constraint health_entries_version_positive check (version >= 1)
);

create unique index health_entries_sleep_unique on health_entries (local_date) where kind = 'sleep';
create index health_entries_date_idx on health_entries (local_date);

create table app_settings (
  id smallint primary key,
  locale text not null,
  timezone text not null,
  week_starts_on smallint not null,
  constraint app_settings_single_row check (id = 1),
  constraint app_settings_fixed_locale check (locale = 'zh-HK'),
  constraint app_settings_fixed_timezone check (timezone = 'Asia/Hong_Kong'),
  constraint app_settings_fixed_week_start check (week_starts_on = 1)
);

insert into app_settings (id, locale, timezone, week_starts_on)
values (1, 'zh-HK', 'Asia/Hong_Kong', 1)
on conflict (id) do nothing;
