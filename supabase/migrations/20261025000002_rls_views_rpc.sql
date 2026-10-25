-- Row Level Security, public views, triggers and RPCs.
-- Agent-owned writes (listings, matches, notifications, agent_runs, conversations, messages)
-- happen in Edge Functions with the service role, which bypasses RLS.

alter table public.business_types     enable row level security;
alter table public.app_config         enable row level security;
alter table public.localities         enable row level security;
alter table public.profiles           enable row level security;
alter table public.contacts           enable row level security;
alter table public.conversations      enable row level security;
alter table public.messages           enable row level security;
alter table public.agent_runs         enable row level security;
alter table public.listings           enable row level security;
alter table public.buyer_requirements enable row level security;
alter table public.matches            enable row level security;
alter table public.interests          enable row level security;
alter table public.stage_history      enable row level security;
alter table public.listing_views      enable row level security;
alter table public.search_events      enable row level security;
alter table public.saved_searches     enable row level security;
alter table public.notifications      enable row level security;
alter table public.events             enable row level security;

-- config: world-readable
create policy "read config" on public.business_types for select using (true);
create policy "read app config" on public.app_config for select using (true);
create policy "read localities" on public.localities for select using (true);

-- identity
create policy "own profile" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "own contact" on public.contacts for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- raw conversation data: owners can read their own; writes go through intake-agent
create policy "own conversations" on public.conversations for select using (user_id = auth.uid());
create policy "own messages" on public.messages for select using (user_id = auth.uid());

-- listings: base table only visible to its seller (public access goes through public_listings)
create policy "own listings" on public.listings for select using (seller_id = auth.uid());
create policy "own requirements" on public.buyer_requirements for select using (buyer_id = auth.uid());

create policy "matches of my listings or requirements" on public.matches for select using (
  exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid())
  or exists (select 1 from public.buyer_requirements r where r.id = requirement_id and r.buyer_id = auth.uid())
);

create policy "interests I sent or received" on public.interests for select using (
  buyer_id = auth.uid()
  or exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid())
);

create policy "history of my entities" on public.stage_history for select using (
  exists (select 1 from public.listings l where l.id = entity_id and l.seller_id = auth.uid())
  or exists (select 1 from public.buyer_requirements r where r.id = entity_id and r.buyer_id = auth.uid())
);

-- behaviour log: insert-only for clients
create policy "log views" on public.listing_views for insert with check (user_id = auth.uid());
create policy "log searches" on public.search_events for insert with check (user_id = auth.uid());
create policy "log events" on public.events for insert with check (user_id = auth.uid());

create policy "own saved searches" on public.saved_searches for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own notifications read" on public.notifications for select using (user_id = auth.uid());
create policy "own notifications mark read" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────────────────────── views ─────────────────────────────
-- Anonymised public catalogue (no seller_id / conversation_id). Owner-privileged view, read-only.
create or replace view public.public_listings with (security_barrier = true) as
select l.id, l.business_type, l.title, l.summary, l.attributes, l.locality_id,
       loc.name as locality_name, l.location_text, l.lat, l.lng, l.annual_revenue,
       l.asking_price, l.valuation_low, l.valuation_high, l.valuation_reasoning,
       l.stage, l.view_count, l.is_seed, l.published_at, l.created_at,
       (l.seller_id is not null and l.seller_id = auth.uid()) as is_mine
from public.listings l
left join public.localities loc on loc.id = l.locality_id
where l.stage <> 'draft' and l.stage <> 'closed';

create or replace view public.my_listings with (security_invoker = true) as
select l.*, loc.name as locality_name,
       (select count(*) from public.matches m where m.listing_id = l.id and m.status <> 'dismissed') as match_count,
       (select count(*) from public.interests i where i.listing_id = l.id) as interest_count
from public.listings l
left join public.localities loc on loc.id = l.locality_id
where l.seller_id = auth.uid();

create or replace view public.my_requirements with (security_invoker = true) as
select r.*,
       (select count(*) from public.matches m where m.requirement_id = r.id and m.status <> 'dismissed') as match_count,
       (select max(score) from public.matches m where m.requirement_id = r.id) as best_score
from public.buyer_requirements r
where r.buyer_id = auth.uid();

-- Buyer side: my matches with the (public) listing details
create or replace view public.my_buyer_matches with (security_barrier = true) as
select m.id as match_id, m.requirement_id, m.score, m.reasons, m.status, m.created_at,
       l.id as listing_id, l.business_type, l.title, l.summary, l.attributes, l.lat, l.lng,
       loc.name as locality_name, l.asking_price, l.valuation_low, l.valuation_high, l.stage as listing_stage
from public.matches m
join public.buyer_requirements r on r.id = m.requirement_id
join public.listings l on l.id = m.listing_id
left join public.localities loc on loc.id = l.locality_id
where r.buyer_id = auth.uid() and m.status <> 'dismissed';

-- Seller side: anonymised buyers matched to my listings
create or replace view public.my_seller_matches with (security_barrier = true) as
select m.id as match_id, m.listing_id, m.score, m.reasons, m.status, m.created_at,
       r.id as requirement_id, r.title as requirement_title, r.criteria, r.budget_min, r.budget_max,
       exists (select 1 from public.interests i where i.listing_id = m.listing_id and i.buyer_id = r.buyer_id) as buyer_interested
from public.matches m
join public.listings l on l.id = m.listing_id
join public.buyer_requirements r on r.id = m.requirement_id
where l.seller_id = auth.uid() and m.status <> 'dismissed';

grant select on public.public_listings, public.my_listings, public.my_requirements,
                public.my_buyer_matches, public.my_seller_matches to anon, authenticated;

-- ───────────────────────────── triggers ─────────────────────────────
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger t_conv_touch before update on public.conversations for each row execute function public.touch_updated_at();
create trigger t_list_touch before update on public.listings for each row execute function public.touch_updated_at();
create trigger t_req_touch  before update on public.buyer_requirements for each row execute function public.touch_updated_at();
create trigger t_match_touch before update on public.matches for each row execute function public.touch_updated_at();

create or replace function public.log_stage_change() returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_from text; v_to text; v_entity text := tg_argv[0];
begin
  if v_entity = 'match' then
    v_from := case when tg_op = 'UPDATE' then old.status::text end; v_to := new.status::text;
  else
    v_from := case when tg_op = 'UPDATE' then old.stage::text end; v_to := new.stage::text;
  end if;
  if tg_op = 'INSERT' or v_from is distinct from v_to then
    insert into public.stage_history (entity_type, entity_id, from_stage, to_stage, actor)
    values (v_entity, new.id, v_from, v_to, coalesce(nullif(current_setting('app.actor', true), ''), 'system'));
  end if;
  return new;
end $$;

create trigger t_list_stage after insert or update of stage on public.listings for each row execute function public.log_stage_change('listing');
create trigger t_req_stage  after insert or update of stage on public.buyer_requirements for each row execute function public.log_stage_change('requirement');
create trigger t_match_stage after insert or update of status on public.matches for each row execute function public.log_stage_change('match');

create or replace function public.bump_view_count() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.listings set view_count = view_count + 1 where id = new.listing_id;
  return new;
end $$;
create trigger t_view_count after insert on public.listing_views for each row execute function public.bump_view_count();

-- ───────────────────────────── RPCs ─────────────────────────────
create or replace function public.ensure_profile(p_device_id text, p_platform text, p_app_version text, p_role_pref text default null)
returns void language sql security invoker as $$
  insert into public.profiles (id, device_id, platform, app_version, role_pref)
  values (auth.uid(), p_device_id, p_platform, p_app_version, p_role_pref)
  on conflict (id) do update set device_id = excluded.device_id, platform = excluded.platform,
    app_version = excluded.app_version, last_seen_at = now(),
    role_pref = coalesce(excluded.role_pref, public.profiles.role_pref);
$$;

-- Free-text + filter search over the public catalogue
create or replace function public.search_listings(p_query text default null, p_types text[] default null)
returns setof public.public_listings language sql stable as $$
  select pl.* from public.public_listings pl
  left join public.localities loc on loc.id = pl.locality_id
  left join public.business_types bt on bt.key = pl.business_type
  where (p_types is null or cardinality(p_types) = 0 or pl.business_type = any(p_types))
    and (
      p_query is null or btrim(p_query) = ''
      or pl.title ilike '%' || p_query || '%'
      or pl.summary ilike '%' || p_query || '%'
      or coalesce(pl.location_text, '') ilike '%' || p_query || '%'
      or coalesce(loc.name, '') ilike '%' || p_query || '%'
      or exists (select 1 from unnest(coalesce(loc.aliases, '{}')) a where a ilike '%' || p_query || '%' or p_query ilike '%' || a || '%')
      or bt.label ilike '%' || p_query || '%'
      or exists (select 1 from unnest(bt.aliases) a where p_query ilike '%' || a || '%')
    )
  order by pl.published_at desc nulls last
  limit 200;
$$;

-- Seller moves own listing along the pipeline (in_discussion / closed / back to listed)
create or replace function public.set_listing_stage(p_listing_id uuid, p_stage public.deal_stage)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.actor', 'seller', true);
  update public.listings set stage = p_stage where id = p_listing_id and seller_id = auth.uid();
  if not found then raise exception 'not your listing'; end if;
end $$;

create or replace function public.set_requirement_stage(p_requirement_id uuid, p_stage public.deal_stage)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.actor', 'buyer', true);
  update public.buyer_requirements set stage = p_stage where id = p_requirement_id and buyer_id = auth.uid();
  if not found then raise exception 'not your requirement'; end if;
end $$;

-- Buyer taps "I'm interested": records interest, advances match + listing + requirement to "contacted",
-- and drops a notification in the seller's inbox.
create or replace function public.express_interest(p_listing_id uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_match uuid; v_req uuid; v_interest uuid; v_seller uuid; v_title text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  perform set_config('app.actor', 'buyer', true);

  select m.id, m.requirement_id into v_match, v_req
  from public.matches m join public.buyer_requirements r on r.id = m.requirement_id
  where m.listing_id = p_listing_id and r.buyer_id = v_uid
  order by m.score desc limit 1;

  insert into public.interests (listing_id, buyer_id, match_id, note)
  values (p_listing_id, v_uid, v_match, p_note)
  on conflict (listing_id, buyer_id) do update set note = coalesce(excluded.note, public.interests.note)
  returning id into v_interest;

  if v_match is not null then
    update public.matches set status = 'contacted' where id = v_match and status in ('new','seen');
    update public.buyer_requirements set stage = 'contacted' where id = v_req and stage in ('listed','matched');
  end if;

  update public.listings set stage = 'contacted' where id = p_listing_id and stage in ('listed','matched')
  returning seller_id, title into v_seller, v_title;
  if v_seller is null then
    select seller_id, title into v_seller, v_title from public.listings where id = p_listing_id;
  end if;

  if v_seller is not null and v_seller <> v_uid then
    insert into public.notifications (user_id, kind, title, body, payload)
    values (v_seller, 'interest', 'A buyer is interested',
            'Someone wants to talk about "' || v_title || '".',
            jsonb_build_object('listing_id', p_listing_id, 'interest_id', v_interest));
  end if;
  return v_interest;
end $$;

create or replace function public.mark_match_seen(p_match_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.matches m set status = 'seen'
  where m.id = p_match_id and m.status = 'new'
    and exists (select 1 from public.buyer_requirements r where r.id = m.requirement_id and r.buyer_id = auth.uid());
$$;

-- Play Store requirement: in-app data deletion. Removes the anonymous user and cascades everything.
create or replace function public.delete_my_data()
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke execute on function public.delete_my_data() from anon;
grant execute on function public.ensure_profile, public.search_listings, public.set_listing_stage,
  public.set_requirement_stage, public.express_interest, public.mark_match_seen, public.delete_my_data to authenticated;
