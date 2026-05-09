create extension if not exists pgcrypto;

do $$
begin
  create type item_type as enum ('task', 'thought', 'journal_seed', 'note');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type item_status as enum ('inbox', 'todo', 'doing', 'done', 'archived');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type item_horizon as enum ('now', 'soon', 'later', 'long_term');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type item_source as enum ('telegram', 'chat_input', 'brain_dump', 'manual', 'system');
exception
  when duplicate_object then null;
end $$;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  raw_text text not null default '',
  structured_text text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  export_md_path text
);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  item_type item_type not null,
  title text not null,
  content text not null default '',
  status item_status not null default 'inbox',
  horizon item_horizon not null default 'now',
  priority integer not null default 3 check (priority between 1 and 5),
  source item_source not null default 'manual',
  project text not null default '',
  tags jsonb not null default '[]'::jsonb,
  scheduled_date date,
  due_date date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  session_id uuid references sessions(id) on delete set null,
  external_ref text
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references items(id) on delete set null,
  session_id uuid references sessions(id) on delete set null,
  event_type text not null,
  from_status item_status,
  to_status item_status,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists worklogs (
  id uuid primary key default gen_random_uuid(),
  log_date date not null,
  title text not null,
  content_md text not null,
  source_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists prompt_registry (
  role text primary key,
  prompt_id text not null default '',
  prompt_path text not null default '',
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists telegram_offsets (
  bot_key text primary key,
  offset bigint not null default 0,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists item_links (
  id uuid primary key default gen_random_uuid(),
  source_item_id uuid not null references items(id) on delete cascade,
  target_item_id uuid not null references items(id) on delete cascade,
  link_type text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_items_status_horizon on items(status, horizon);
create index if not exists idx_items_created_at on items(created_at desc);
create index if not exists idx_items_updated_at on items(updated_at desc);
create index if not exists idx_items_completed_at on items(completed_at desc);
create index if not exists idx_events_created_at on events(created_at desc);
create index if not exists idx_events_item_id on events(item_id);
create index if not exists idx_worklogs_log_date on worklogs(log_date desc);

drop trigger if exists sessions_set_updated_at on sessions;
create trigger sessions_set_updated_at
before update on sessions
for each row execute function set_updated_at();

drop trigger if exists items_set_updated_at on items;
create trigger items_set_updated_at
before update on items
for each row execute function set_updated_at();

drop trigger if exists worklogs_set_updated_at on worklogs;
create trigger worklogs_set_updated_at
before update on worklogs
for each row execute function set_updated_at();
