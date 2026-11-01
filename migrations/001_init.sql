-- 001_init.sql
-- M1 baseline: fixed areas, workspace state, projects, tasks and server sessions.

create table areas (
  id text primary key,
  name text not null,
  sort_order integer not null unique,
  constraint areas_id_allowed check (
    id in ('study', 'degree', 'career-hk', 'internship-sz', 'health', 'social', 'outreach')
  ),
  constraint areas_name_not_blank check (char_length(btrim(name)) between 1 and 100)
);

create table system_state (
  id smallint primary key,
  revision bigint not null default 0,
  data_epoch uuid not null default gen_random_uuid(),
  constraint system_state_single_row check (id = 1),
  constraint system_state_revision_non_negative check (revision >= 0)
);

insert into system_state (id) values (1);

create table projects (
  id uuid primary key default gen_random_uuid(),
  primary_area_id text not null references areas (id) on update cascade on delete restrict,
  title text not null,
  description text not null default '',
  kind text not null default 'general',
  status text not null default 'active',
  due_on date,
  due_at timestamptz,
  due_timezone text,
  next_step text,
  tags text[] not null default '{}'::text[],
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint projects_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint projects_kind_allowed check (
    kind in ('general', 'course', 'degree_application', 'job_application')
  ),
  constraint projects_status_allowed check (
    status in ('active', 'paused', 'completed', 'cancelled')
  ),
  constraint projects_due_exclusive check (not (due_on is not null and due_at is not null)),
  constraint projects_due_timezone check (
    (due_at is null and due_timezone is null)
    or (due_at is not null and due_timezone is not null)
  ),
  constraint projects_tags_limit check (cardinality(tags) <= 10),
  constraint projects_version_positive check (version >= 1)
);

create index projects_primary_area_idx on projects (primary_area_id);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  project_id uuid references projects (id) on update cascade on delete restrict,
  area_id text references areas (id) on update cascade on delete restrict,
  status text not null default 'todo',
  priority text not null default 'normal',
  planned_on date,
  due_on date,
  due_at timestamptz,
  due_timezone text,
  follow_up_on date,
  estimated_minutes integer,
  completed_at timestamptz,
  tags text[] not null default '{}'::text[],
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint tasks_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint tasks_status_allowed check (
    status in ('todo', 'doing', 'waiting', 'done', 'cancelled')
  ),
  constraint tasks_priority_allowed check (priority in ('low', 'normal', 'high')),
  constraint tasks_project_area_exclusive check (project_id is null or area_id is null),
  constraint tasks_due_exclusive check (not (due_on is not null and due_at is not null)),
  constraint tasks_due_timezone check (
    (due_at is null and due_timezone is null)
    or (due_at is not null and due_timezone is not null)
  ),
  constraint tasks_estimated_minutes_positive check (
    estimated_minutes is null or estimated_minutes > 0
  ),
  constraint tasks_completed_at_matches_status check (
    (status = 'done') = (completed_at is not null)
  ),
  constraint tasks_tags_limit check (cardinality(tags) <= 10),
  constraint tasks_version_positive check (version >= 1)
);

create index tasks_created_idx on tasks (created_at desc);
create index tasks_status_planned_idx on tasks (status, planned_on);
create index tasks_due_on_idx on tasks (due_on);
create index tasks_project_idx on tasks (project_id);
create index tasks_area_idx on tasks (area_id);

-- express-session storage (connect-pg-simple schema).
create table sessions (
  sid varchar primary key,
  sess json not null,
  expire timestamp(6) without time zone not null
);

create index sessions_expire_idx on sessions (expire);
