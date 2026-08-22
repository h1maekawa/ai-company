create table if not exists public.knowledge_index (
  knowledge_id text not null,
  path text primary key,
  title text not null,
  domain text,
  tags text[] not null default '{}',
  summary text not null default '',
  managed_by text not null default 'human',
  source text,
  created_at timestamptz,
  updated_at timestamptz,
  indexed_at timestamptz not null default now()
);
create index if not exists knowledge_index_domain_idx on public.knowledge_index(domain);
create index if not exists knowledge_index_updated_at_idx on public.knowledge_index(updated_at desc);
create index if not exists knowledge_index_tags_idx on public.knowledge_index using gin(tags);

create table if not exists public.system_sync_status (
  service text primary key,
  status text not null check (status in ('connected','warning','disconnected','not_configured','unknown')),
  last_checked_at timestamptz not null,
  last_success_at timestamptz,
  last_sync_at timestamptz,
  item_count bigint,
  message text,
  last_error text,
  metadata jsonb not null default '{}'
);
alter table public.knowledge_index enable row level security;
alter table public.system_sync_status enable row level security;
-- Phase 1 is server-only via service_role, which bypasses RLS. No anon/authenticated policies are created.
