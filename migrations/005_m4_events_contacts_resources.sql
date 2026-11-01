-- 005_m4_events_contacts_resources.sql
-- Events, people, interactions, document links and cross-area relations.

create table contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organization text not null default '',
  role text not null default '',
  email text not null default '',
  phone text not null default '',
  profile_url text not null default '',
  relationship_tags text[] not null default '{}'::text[],
  how_met text not null default '',
  notes text not null default '',
  next_contact_on date,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint contacts_name_length check (char_length(btrim(name)) between 1 and 200),
  constraint contacts_notes_length check (char_length(notes) <= 20000),
  constraint contacts_tags_limit check (cardinality(relationship_tags) <= 10),
  constraint contacts_version_positive check (version >= 1)
);

create index contacts_name_idx on contacts (name);

create table events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  primary_area_id text not null references areas (id) on update cascade on delete restrict,
  project_id uuid references projects (id) on update cascade on delete restrict,
  kind text not null default 'other',
  location text not null default '',
  url text not null default '',
  all_day boolean not null default false,
  start_on date,
  end_on date,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  registration_status text not null default 'not_needed',
  registration_due_on date,
  registration_due_at timestamptz,
  registration_due_timezone text,
  attendance_status text not null default 'planned',
  notes text not null default '',
  tags text[] not null default '{}'::text[],
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint events_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint events_kind_allowed check (kind in ('class', 'interview', 'meeting', 'exercise', 'social', 'outreach', 'other')),
  constraint events_registration_allowed check (
    registration_status in ('not_needed', 'interested', 'applied', 'confirmed', 'waitlisted', 'rejected', 'cancelled')
  ),
  constraint events_attendance_allowed check (attendance_status in ('planned', 'attended', 'missed', 'cancelled')),
  constraint events_shape check (
    (
      all_day
      and start_on is not null and end_on is not null and end_on >= start_on
      and starts_at is null and ends_at is null and timezone is null
    )
    or
    (
      not all_day
      and starts_at is not null and ends_at is not null and ends_at > starts_at
      and timezone is not null
      and start_on is null and end_on is null
    )
  ),
  constraint events_registration_due_exclusive check (
    not (registration_due_on is not null and registration_due_at is not null)
  ),
  constraint events_registration_due_timezone check (
    (registration_due_at is null and registration_due_timezone is null)
    or (registration_due_at is not null and registration_due_timezone is not null)
  ),
  constraint events_notes_length check (char_length(notes) <= 20000),
  constraint events_tags_limit check (cardinality(tags) <= 10),
  constraint events_version_positive check (version >= 1)
);

create index events_primary_area_idx on events (primary_area_id);
create index events_project_idx on events (project_id);
create index events_start_on_idx on events (start_on);
create index events_starts_at_idx on events (starts_at);

create table interactions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts (id) on update cascade on delete cascade,
  occurred_at timestamptz not null,
  kind text not null default 'other',
  summary text not null,
  project_id uuid references projects (id) on update cascade on delete set null,
  event_id uuid references events (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interactions_kind_allowed check (kind in ('message', 'call', 'meeting', 'other')),
  constraint interactions_summary_length check (char_length(btrim(summary)) between 1 and 20000)
);

create index interactions_contact_idx on interactions (contact_id, occurred_at desc);

create table project_related_areas (
  project_id uuid not null references projects (id) on update cascade on delete cascade,
  area_id text not null references areas (id) on update cascade on delete restrict,
  primary key (project_id, area_id)
);

create table project_contacts (
  project_id uuid not null references projects (id) on update cascade on delete cascade,
  contact_id uuid not null references contacts (id) on update cascade on delete cascade,
  primary key (project_id, contact_id)
);

create table event_related_areas (
  event_id uuid not null references events (id) on update cascade on delete cascade,
  area_id text not null references areas (id) on update cascade on delete restrict,
  primary key (event_id, area_id)
);

create table event_contacts (
  event_id uuid not null references events (id) on update cascade on delete cascade,
  contact_id uuid not null references contacts (id) on update cascade on delete cascade,
  primary key (event_id, contact_id)
);

create table resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null,
  target text not null,
  version_label text not null default '',
  notes text not null default '',
  tags text[] not null default '{}'::text[],
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint resources_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint resources_kind_allowed check (kind in ('web_link', 'local_path')),
  constraint resources_target_length check (char_length(btrim(target)) between 1 and 2000),
  constraint resources_web_protocol check (
    kind <> 'web_link' or target ~* '^https?://'
  ),
  constraint resources_notes_length check (char_length(notes) <= 20000),
  constraint resources_tags_limit check (cardinality(tags) <= 10),
  constraint resources_version_positive check (version >= 1)
);

create table resource_links (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references resources (id) on update cascade on delete cascade,
  project_id uuid references projects (id) on update cascade on delete cascade,
  task_id uuid references tasks (id) on update cascade on delete cascade,
  event_id uuid references events (id) on update cascade on delete cascade,
  contact_id uuid references contacts (id) on update cascade on delete cascade,
  constraint resource_links_exactly_one check (
    (case when project_id is not null then 1 else 0 end)
    + (case when task_id is not null then 1 else 0 end)
    + (case when event_id is not null then 1 else 0 end)
    + (case when contact_id is not null then 1 else 0 end) = 1
  )
);

create unique index resource_links_project_unique on resource_links (resource_id, project_id) where project_id is not null;
create unique index resource_links_task_unique on resource_links (resource_id, task_id) where task_id is not null;
create unique index resource_links_event_unique on resource_links (resource_id, event_id) where event_id is not null;
create unique index resource_links_contact_unique on resource_links (resource_id, contact_id) where contact_id is not null;
create index resource_links_resource_idx on resource_links (resource_id);

alter table tasks
  add column contact_id uuid references contacts (id) on update cascade on delete set null,
  add column event_id uuid references events (id) on update cascade on delete set null;

create index tasks_contact_idx on tasks (contact_id);
create index tasks_event_idx on tasks (event_id);
