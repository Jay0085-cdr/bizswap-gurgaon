-- Cache of validated LLM outputs keyed by a hash of (schema, system prompt, input). Service role only.
create table public.llm_cache (
  key         text primary key,
  schema_name text not null,
  output      jsonb not null,
  provider    text,
  model       text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index on public.llm_cache (expires_at);
alter table public.llm_cache enable row level security;

-- Daily cleanup of expired entries (pg_cron is already enabled for the watch sweep).
select cron.schedule('llm-cache-cleanup', '17 3 * * *', $$delete from public.llm_cache where expires_at < now()$$);
