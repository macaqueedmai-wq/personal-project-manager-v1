-- 003_m2_focus.sql
-- Daily focus lists are transactional and capped at three positions.

create table focus_days (
  local_date date primary key,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint focus_days_version_positive check (version >= 1)
);

create table daily_focus (
  local_date date not null references focus_days (local_date) on update cascade on delete cascade,
  task_id uuid not null references tasks (id) on update cascade on delete cascade,
  position smallint not null,
  primary key (local_date, task_id),
  constraint daily_focus_position_range check (position between 1 and 3),
  constraint daily_focus_position_unique unique (local_date, position)
);

create index daily_focus_task_idx on daily_focus (task_id);
