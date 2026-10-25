// End-to-end agent smoke test with a fresh anonymous user, using the brief's example sentences.
// Run: npm run smoke   (cleans up its own data at the end)
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { root } from './env.mts';

const appEnv = Object.fromEntries(
  readFileSync(join(root, '.env'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
const sb = createClient(appEnv.EXPO_PUBLIC_SUPABASE_URL, appEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let failures = 0;
const check = (cond: unknown, msg: string) => {
  console.log(`   ${cond ? '✔' : '✖'} ${msg}`);
  if (!cond) failures++;
};

async function intake(role: 'seller' | 'buyer', text: string, conversation_id?: string) {
  const t0 = Date.now();
  const { data, error } = await sb.functions.invoke('intake-agent', { body: { action: 'message', role, text, conversation_id, input_mode: 'text' } });
  if (error) throw new Error(`${error.message}: ${await (error as any).context?.text?.()}`);
  console.log(`\n  » ${text}\n  « ${data.reply}  (${Date.now() - t0} ms)\n    type=${data.business_type} fields=${JSON.stringify(data.fields)} missing=[${data.missing.map((m: any) => m.key)}]`);
  return data;
}

const { error: authErr } = await sb.auth.signInAnonymously();
if (authErr) throw authErr;
await sb.rpc('ensure_profile', { p_device_id: 'smoke-test', p_platform: 'node', p_app_version: 'smoke' });

console.log('\n① Seller — pub (brief example 1)');
let r = await intake('seller', 'I want to sell my pub located at Ambience Mall, Gurgaon. Its got a footfall of 100 people a day, daily billings of Rs 10,000. Lease runs for 3 years and is Rs 30,000/month');
check(r.business_type === 'pub', 'detected pub');
check(r.fields.daily_footfall === 100, 'footfall = 100');
check(r.fields.daily_billing === 10000, 'daily billing = ₹10,000');
check(r.fields.lease_remaining_years === 3, 'lease = 3 yrs');
check(r.fields.monthly_rent === 30000, 'rent = ₹30,000');
check(r.is_complete, 'all required fields captured → complete');
const { data: pub, error: pubErr } = await sb.functions.invoke('intake-agent', { body: { action: 'confirm', conversation_id: r.conversation_id } });
if (pubErr) throw pubErr;
console.log(`  » [Publish]\n  « "${pub.listing.title}" — ${pub.listing.summary}\n    value ₹${pub.listing.valuation_low}–${pub.listing.valuation_high}: ${pub.listing.valuation_reasoning}\n    at ${pub.listing.locality_name} (${pub.listing.lat.toFixed(4)}, ${pub.listing.lng.toFixed(4)}) matches=${JSON.stringify(pub.listing.match_summary)}`);
check(pub.listing.locality_name === 'Ambience Mall', 'geocoded to Ambience Mall');
check(pub.listing.valuation_low > 0, 'valuation range computed');

console.log('\n② Seller — doctor with missing fields (brief example 2)');
r = await intake('seller', 'I want to sell my 20 year general physician practice with over 2000 patients and monthly billing of Rs 2 lacs');
check(r.business_type === 'doctor', 'detected doctor');
check(r.fields.patient_count === 2000 && r.fields.monthly_billing === 200000 && r.fields.years_running === 20, 'patients 2000, ₹2L/month, 20 yrs');
check(!r.is_complete && r.missing.some((m: any) => m.key === 'location'), 'asks for missing location');
r = await intake('seller', 'It is in South City 1', r.conversation_id);
check(r.is_complete, 'complete after follow-up');

console.log('\n③ Buyer — CA practice (brief example 3)');
r = await intake('buyer', 'I want to buy a CA practice in Gurgaon with 50 clients with annual billing of Rs 2 lacs');
check(r.business_type === 'ca', 'detected CA');
check(r.fields.min_client_count === 50 && r.fields.min_annual_billing === 200000, 'min 50 clients, ₹2L billing');
check(r.missing.some((m: any) => m.key === 'budget_max'), 'asks for budget');
r = await intake('buyer', 'Anywhere is fine, budget up to 5 lakh', r.conversation_id);
check(r.is_complete, 'complete after budget + area');
const { data: buy, error: buyErr } = await sb.functions.invoke('intake-agent', { body: { action: 'confirm', conversation_id: r.conversation_id } });
if (buyErr) throw buyErr;
console.log(`  » [Find matches]\n  « requirement "${buy.requirement.title}" → ${buy.matches.length} matches`);
for (const m of buy.matches) console.log(`    ${m.score}%  ${m.title}  — ${m.reasons.join('; ')}`);
check(buy.matches.length >= 1, 'found at least one matching CA practice');

const { data: notes } = await sb.from('notifications').select('kind,title').order('created_at');
console.log(`\n  inbox: ${notes?.map((n) => n.kind).join(', ')}`);

await sb.rpc('delete_my_data');
console.log(failures ? `\n✖ ${failures} check(s) failed` : '\n✔ all smoke checks passed');
process.exit(failures ? 1 : 0);
