-- Tester feedback (closed test → V1.1) and the feedback-agent's theme reports.

create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  device_id   text,
  app_version text not null,
  build       text,
  platform    text not null,
  screen      text not null,
  message     text not null check (char_length(message) between 2 and 4000),
  input_mode  text not null default 'text' check (input_mode in ('text', 'voice')),
  context     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index on public.feedback (created_at desc);

alter table public.feedback enable row level security;
create policy "send feedback" on public.feedback for insert with check (user_id = auth.uid());
create policy "read own feedback" on public.feedback for select using (user_id = auth.uid());

-- Written only by feedback-agent (service role); no client policies.
create table public.feedback_reports (
  id             bigserial primary key,
  created_at     timestamptz not null default now(),
  since          timestamptz not null,
  until          timestamptz not null,
  feedback_count int not null,
  themes         jsonb not null,
  summary        text not null,
  top_actions    jsonb not null default '[]',
  stats          jsonb not null default '{}',
  provider       text,
  model          text
);
alter table public.feedback_reports enable row level security;
