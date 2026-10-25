// After deploy: let the matchmaker-agent score the seed data, and schedule the watch-agent sweep (pg_cron).
import { loadEnv } from './env.mts';
import { sql } from './sql.mts';

const env = loadEnv();
const fnUrl = (name: string) => `${env.SUPABASE_URL}/functions/v1/${name}`;

const res = await fetch(fnUrl('matchmaker-agent'), {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-admin-secret': env.ADMIN_SECRET },
  body: JSON.stringify({ action: 'rebuild_all' }),
});
const body = await res.json();
if (!res.ok) console.warn('  ! matchmaker rebuild failed:', body);
else {
  const total = body.results.reduce((a: number, r: { matches?: number }) => a + (r.matches ?? 0), 0);
  console.log(`  ✔ matchmaker scored ${body.results.length} seed requirements → ${total} matches`);
}

try {
  await sql`create extension if not exists pg_cron`;
  await sql`create extension if not exists pg_net`;
  await sql`select cron.unschedule('watch-agent-sweep') where exists (select 1 from cron.job where jobname = 'watch-agent-sweep')`;
  const cmd = `select net.http_post(url := '${fnUrl('watch-agent')}', headers := jsonb_build_object('content-type','application/json','x-admin-secret','${env.ADMIN_SECRET}'), body := '{"action":"sweep"}'::jsonb)`;
  await sql`select cron.schedule('watch-agent-sweep', '*/30 * * * *', ${cmd})`;
  console.log('  ✔ watch-agent sweep scheduled every 30 min');
} catch (e) {
  console.warn('  ! could not schedule cron (enable pg_cron in Dashboard → Database → Extensions):', (e as Error).message);
}
await sql.end();
