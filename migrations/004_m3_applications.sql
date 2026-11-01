-- 004_m3_applications.sql
-- Course extensions and the single shared application aggregate.

create table course_details (
  project_id uuid primary key references projects (id) on update cascade on delete cascade,
  course_code text not null default '',
  term text not null default '',
  instructor_name text not null default ''
);

create table applications (
  project_id uuid primary key references projects (id) on update cascade on delete cascade,
  application_type text not null,
  organization_name text not null,
  role_or_program text not null,
  degree_level text,
  work_type text,
  location text not null default '',
  posting_url text not null default '',
  portal_url text not null default '',
  stage text not null default 'exploring',
  outcome text,
  applied_on date,
  receipt_verified boolean not null default false,
  next_follow_up_on date,
  notes text not null default '',
  constraint applications_type_allowed check (application_type in ('degree', 'job')),
  constraint applications_stage_allowed check (
    stage in ('exploring', 'preparing', 'submitted', 'assessment', 'interview', 'decision', 'closed')
  ),
  constraint applications_outcome_allowed check (
    outcome is null or outcome in ('offered', 'accepted', 'rejected', 'withdrawn', 'declined', 'unknown')
  ),
  constraint applications_degree_level_allowed check (
    degree_level is null or degree_level in ('master', 'phd')
  ),
  constraint applications_work_type_allowed check (
    work_type is null or work_type in ('full_time', 'internship')
  ),
  constraint applications_type_fields check (
    (application_type = 'degree' and work_type is null)
    or (application_type = 'job' and degree_level is null)
  ),
  constraint applications_stage_outcome check (
    (stage = 'closed' and outcome is not null)
    or (stage = 'decision' and (outcome is null or outcome = 'offered'))
    or (stage not in ('closed', 'decision') and outcome is null)
  ),
  constraint applications_organization_length check (char_length(btrim(organization_name)) between 1 and 200),
  constraint applications_role_length check (char_length(btrim(role_or_program)) between 1 and 200),
  constraint applications_notes_length check (char_length(notes) <= 20000)
);

create table application_stage_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on update cascade on delete cascade,
  from_stage text,
  to_stage text not null,
  changed_at timestamptz not null default now(),
  note text not null default '',
  constraint application_history_from_allowed check (
    from_stage is null or from_stage in ('exploring', 'preparing', 'submitted', 'assessment', 'interview', 'decision', 'closed')
  ),
  constraint application_history_to_allowed check (
    to_stage in ('exploring', 'preparing', 'submitted', 'assessment', 'interview', 'decision', 'closed')
  ),
  constraint application_history_note_length check (char_length(note) <= 20000)
);

create index application_history_project_idx on application_stage_history (project_id, changed_at desc);
