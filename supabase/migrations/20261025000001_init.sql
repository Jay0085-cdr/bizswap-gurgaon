-- BizSwap Gurgaon — core schema / data lake
-- Every user-owned row carries user_id = auth.uid() of the anonymous Supabase user.

create extension if not exists pg_trgm;

-- ───────────────────────────── config ─────────────────────────────
create table public.business_types (
  key          text primary key,
  label        text not null,
  plural       text not null,
  icon         text not null default 'business',
  color        text not null default '#64748B',
  aliases      text[] not null default '{}',
  fields       jsonb not null,            -- [{key,label,type,unit,required,ask,hint}]
  buyer_fields jsonb not null default '[]',
  revenue      jsonb not null,            -- {field, annual_factor}
  valuation    jsonb not null,            -- {multiple_low, multiple_high, basis, notes}
  sort         int not null default 0,
  active       boolean not null default true,
  updated_at   timestamptz not null default now()
);

create table public.app_config (
  key   text primary key,
  value jsonb not null
);

create table public.localities (
  id      serial primary key,
  slug    text unique not null,
  name    text not null,
  kind    text not null check (kind in ('mall','market','road','sector','area')),
  lat     double precision not null,
  lng     double precision not null,
  aliases text[] not null default '{}'
);

-- ───────────────────────────── identity ─────────────────────────────
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  device_id    text,
  platform     text,
  app_version  text,
  role_pref    text check (role_pref in ('seller','buyer','browse')),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.contacts (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  phone         text,
  email         text,
  watch_enabled boolean not null default true,
  consent_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (phone is not null or email is not null)
);

-- ───────────────────────────── conversations (raw) ─────────────────────────────
create type public.party_role as enum ('seller','buyer');

create table public.conversations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  role           public.party_role not null,
  business_type  text references public.business_types(key),
  status         text not null default 'open' check (status in ('open','complete','published','abandoned')),
  extracted      jsonb not null default '{}',
  missing        text[] not null default '{}',
  listing_id     uuid,
  requirement_id uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.conversations (user_id, created_at desc);

create table public.messages (
  id                 bigserial primary key,
  conversation_id    uuid not null references public.conversations(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  sender             text not null check (sender in ('user','agent')),
  text               text not null,
  input_mode         text check (input_mode in ('voice','text')),
  raw_transcript     text,
  stt_confidence     real,
  stt_alternatives   jsonb,
  extracted_snapshot jsonb,
  created_at         timestamptz not null default now()
);
create index on public.messages (conversation_id, id);

create table public.agent_runs (
  id              bigserial primary key,
  agent           text not null,
  conversation_id uuid,
  entity_id       uuid,
  user_id         uuid,
  provider        text,
  model           text,
  input           jsonb,
  output          jsonb,
  ok              boolean not null default true,
  error           text,
  latency_ms      int,
  tokens_in       int,
  tokens_out      int,
  created_at      timestamptz not null default now()
);
create index on public.agent_runs (agent, created_at desc);

-- ───────────────────────────── marketplace ─────────────────────────────
create type public.deal_stage as enum ('draft','listed','matched','contacted','in_discussion','closed');

create table public.listings (
  id                  uuid primary key default gen_random_uuid(),
  seller_id           uuid references auth.users(id) on delete cascade,  -- null for seed rows
  conversation_id     uuid references public.conversations(id) on delete set null,
  business_type       text not null references public.business_types(key),
  title               text not null,
  summary             text not null,
  attributes          jsonb not null default '{}',
  locality_id         int references public.localities(id),
  location_text       text,
  lat                 double precision not null,
  lng                 double precision not null,
  annual_revenue      bigint,
  asking_price        bigint,
  valuation_low       bigint,
  valuation_high      bigint,
  valuation_reasoning text,
  stage               public.deal_stage not null default 'draft',
  view_count          int not null default 0,
  is_seed             boolean not null default false,
  created_at          timestamptz not null default now(),
  published_at        timestamptz,
  updated_at          timestamptz not null default now()
);
create index on public.listings (business_type, stage);
create index on public.listings (seller_id);
create index listings_search_trgm on public.listings using gin ((title || ' ' || summary || ' ' || coalesce(location_text,'')) gin_trgm_ops);

create table public.buyer_requirements (
  id              uuid primary key default gen_random_uuid(),
  buyer_id        uuid references auth.users(id) on delete cascade,  -- null for seed rows
  conversation_id uuid references public.conversations(id) on delete set null,
  business_type   text not null references public.business_types(key),
  title           text not null,
  criteria        jsonb not null default '{}',
  locality_ids    int[] not null default '{}',   -- empty = anywhere in Gurgaon
  budget_min      bigint,
  budget_max      bigint,
  stage           public.deal_stage not null default 'listed',
  watch           boolean not null default true,
  is_seed         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.buyer_requirements (business_type, stage);
create index on public.buyer_requirements (buyer_id);

alter table public.conversations
  add constraint conversations_listing_fk foreign key (listing_id) references public.listings(id) on delete set null,
  add constraint conversations_requirement_fk foreign key (requirement_id) references public.buyer_requirements(id) on delete set null;

create type public.match_status as enum ('new','seen','contacted','in_discussion','closed','dismissed');

create table public.matches (
  id             uuid primary key default gen_random_uuid(),
  listing_id     uuid not null references public.listings(id) on delete cascade,
  requirement_id uuid not null references public.buyer_requirements(id) on delete cascade,
  score          int not null check (score between 0 and 100),
  reasons        jsonb not null default '[]',
  pre_score      int,
  status         public.match_status not null default 'new',
  created_by     text not null default 'matchmaker-agent',
  notified_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (listing_id, requirement_id)
);

create table public.interests (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_id   uuid not null references auth.users(id) on delete cascade,
  match_id   uuid references public.matches(id) on delete set null,
  note       text,
  created_at timestamptz not null default now(),
  unique (listing_id, buyer_id)
);

create table public.stage_history (
  id          bigserial primary key,
  entity_type text not null check (entity_type in ('listing','requirement','match')),
  entity_id   uuid not null,
  from_stage  text,
  to_stage    text not null,
  actor       text not null default 'system',
  reason      text,
  created_at  timestamptz not null default now()
);
create index on public.stage_history (entity_id, created_at);

-- ───────────────────────────── behaviour log ─────────────────────────────
create table public.listing_views (
  id         bigserial primary key,
  listing_id uuid not null references public.listings(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source     text check (source in ('map','search','match','inbox','dashboard','link')),
  created_at timestamptz not null default now()
);

create table public.search_events (
  id           bigserial primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  query        text,
  filters      jsonb not null default '{}',
  map_bbox     jsonb,
  result_count int,
  created_at   timestamptz not null default now()
);

create table public.saved_searches (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source           text not null check (source in ('requirement','query')),
  requirement_id   uuid references public.buyer_requirements(id) on delete cascade,
  criteria         jsonb not null default '{}',
  last_checked_at  timestamptz,
  last_notified_at timestamptz,
  created_at       timestamptz not null default now(),
  unique (user_id, requirement_id)
);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text not null,
  payload    jsonb not null default '{}',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);

create table public.events (
  id         bigserial primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  device_id  text,
  name       text not null,
  screen     text,
  props      jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.events (name, created_at desc);
