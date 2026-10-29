// Closed-test health dashboard in the terminal: daily active testers, agent calls, fallback rate, errors.
// Run: npm run stats              last 14 days (IST)
//      npm run stats -- --days 3
import { sql } from './sql.mts';

const i = process.argv.indexOf('--days');
const days = i > -1 ? Number(process.argv[i + 1]) : 14;
const FALLBACK = sql`(provider = 'deterministic' and (model like '%fallback%' or model = 'pre-score-only'))`;

const daily = await sql`
  with d as (select generate_series((now() at time zone 'Asia/Kolkata')::date - ${days - 1}::int, (now() at time zone 'Asia/Kolkata')::date, '1 day')::date as dt),
  ev as (select (created_at at time zone 'Asia/Kolkata')::date dt, user_id, name from events where created_at > now() - make_interval(days => ${days + 1})),
  ar as (select (created_at at time zone 'Asia/Kolkata')::date dt, provider, model, ok, latency_ms from agent_runs where created_at > now() - make_interval(days => ${days + 1}))
  select d.dt,
    (select count(distinct user_id) from ev where ev.dt = d.dt)::int as active,
    (select count(*) from profiles p where (p.created_at at time zone 'Asia/Kolkata')::date = d.dt)::int as new_users,
    (select count(*) from ar where ar.dt = d.dt and provider not in ('deterministic', 'cache') and ok)::int as llm_ok,
    (select count(*) from ar where ar.dt = d.dt and provider = 'cache')::int as cache,
    (select count(*) from ar where ar.dt = d.dt and provider not in ('deterministic', 'cache') and not ok)::int as llm_failed,
    (select count(*) from ar where ar.dt = d.dt and ${FALLBACK})::int as fallbacks,
    (select percentile_cont(0.5) within group (order by latency_ms) from ar where ar.dt = d.dt and provider not in ('deterministic', 'cache') and ok)::int as p50_ms,
    (select count(*) from ev where ev.dt = d.dt and name = 'client_error')::int as app_errors,
    (select count(*) from ev where ev.dt = d.dt and name = 'agent_error')::int as agent_errors,
    (select count(*) from feedback f where (f.created_at at time zone 'Asia/Kolkata')::date = d.dt)::int as feedback
  from d order by d.dt desc`;

const rows = daily.map((r) => {
  const answered = r.llm_ok + r.cache + r.fallbacks;
  return {
    day: r.dt.toISOString().slice(5, 10),
    'active testers': r.active,
    new: r.new_users,
    'AI calls': r.llm_ok + r.cache,
    'cache hits': r.cache,
    'LLM failed tries': r.llm_failed,
    'fallback %': answered ? Math.round((r.fallbacks / answered) * 100) : 0,
    'p50 ms': r.p50_ms ?? '—',
    'app errors': r.app_errors,
    'agent errors': r.agent_errors,
    feedback: r.feedback,
  };
});

const [tot] = await sql`
  select count(distinct user_id)::int testers from events where created_at > now() - make_interval(days => ${days})`;
const [ever] = await sql`select count(distinct user_id)::int n from events where name = 'app_open'`;

console.log(`\nBizSwap closed-test stats — last ${days} days (IST)\n`);
console.table(rows);
console.log(`Distinct active testers in period: ${tot.testers} · ever opened the app: ${ever.n}`);

const topErrors = await sql`
  select coalesce(props->>'message', props->>'detail') msg, count(*)::int n, max(screen) screen
  from events where name in ('client_error', 'agent_error') and created_at > now() - make_interval(days => ${days})
  group by 1 order by 2 desc limit 8`;
if (topErrors.length) {
  console.log('\nTop errors:');
  for (const e of topErrors) console.log(`  ${String(e.n).padStart(3)}× [${e.screen ?? '—'}] ${String(e.msg).slice(0, 120)}`);
}
const llmErrors = await sql`
  select left(error, 90) err, count(*)::int n from agent_runs
  where not ok and created_at > now() - make_interval(days => ${days}) group by 1 order by 2 desc limit 5`;
if (llmErrors.length) {
  console.log('\nTop LLM errors (each was retried or fell back to quick mode):');
  for (const e of llmErrors) console.log(`  ${String(e.n).padStart(3)}× ${e.err}`);
}
await sql.end();
