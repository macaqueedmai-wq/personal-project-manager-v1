-- 007_m6_backup_tokens.sql
-- Short-lived preview tokens for the restore flow. Never exported.

create table restore_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  session_id text not null,
  file_hash text not null,
  revision bigint not null,
  data_epoch uuid not null,
  expires_at timestamptz not null,
  downloaded_at timestamptz,
  downloaded_revision bigint,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint restore_tokens_revision_non_negative check (revision >= 0)
);

create index restore_tokens_session_idx on restore_tokens (session_id);
create index restore_tokens_expire_idx on restore_tokens (expires_at);
