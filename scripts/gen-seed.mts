// Generates supabase/seed.sql from shared/*.json + the fictional demo data below.
// Run: npm run db:seed:gen   (Node >= 22.18, native TS type-stripping)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bt = JSON.parse(readFileSync(join(root, 'shared/business-types.json'), 'utf8'));
const loc = JSON.parse(readFileSync(join(root, 'shared/localities.json'), 'utf8'));

type Attrs = Record<string, string | number | boolean>;
type SeedListing = { type: string; at: string; title: string; summary: string; attrs: Attrs };
type SeedReq = { type: string; title: string; areas: string[]; budget_min?: number; budget_max: number; criteria: Attrs };

const L = 100_000; // 1 lakh
const CR = 100 * L;

// All businesses below are fictional demo data.
const listings: SeedListing[] = [
  // Pubs
  { type: 'pub', at: 'cyber-hub', title: 'Craft-beer pub with rooftop at a premium hub', summary: 'High-energy microbrewery-style pub popular with the corporate crowd; weekend nights run at full capacity.', attrs: { daily_footfall: 260, daily_billing: 145000, lease_remaining_years: 6, monthly_rent: 650000, years_running: 5, seating_capacity: 140, liquor_license: true, asking_price: 3.5 * CR } },
  { type: 'pub', at: 'ambience-mall', title: 'Sports bar inside a large NH-48 mall', summary: 'Sports-screening bar with steady mall footfall, strong match-day sales and a loyal weekday after-work crowd.', attrs: { daily_footfall: 100, daily_billing: 10000 * 6, lease_remaining_years: 3, monthly_rent: 300000, years_running: 4, seating_capacity: 90, liquor_license: true } },
  { type: 'pub', at: 'sector-29', title: 'Live-music lounge in the Sector 29 nightlife strip', summary: 'Lounge bar with live acts four nights a week, a trained bar team and an established events calendar.', attrs: { daily_footfall: 180, daily_billing: 95000, lease_remaining_years: 4, monthly_rent: 420000, years_running: 7, seating_capacity: 120, liquor_license: true, asking_price: 1.8 * CR } },
  { type: 'pub', at: 'golf-course-road', title: 'Boutique cocktail bar on Golf Course Road', summary: 'Intimate premium cocktail bar with high average ticket size and strong Instagram presence.', attrs: { daily_footfall: 70, daily_billing: 68000, lease_remaining_years: 2, monthly_rent: 280000, years_running: 3, seating_capacity: 55, liquor_license: true } },
  { type: 'pub', at: 'm3m-65th-avenue', title: 'Family-friendly gastropub on the GCER corridor', summary: 'Newer gastropub in a high-street mall serving the fast-growing Golf Course Extension residential belt.', attrs: { daily_footfall: 120, daily_billing: 52000, lease_remaining_years: 8, monthly_rent: 240000, years_running: 2, seating_capacity: 110, liquor_license: true, asking_price: 95 * L } },

  // Restaurants
  { type: 'restaurant', at: 'galleria-market', title: 'North-Indian family restaurant in a popular market', summary: 'Two-floor family dining with a busy delivery channel; repeat-customer base built over a decade.', attrs: { daily_footfall: 220, daily_billing: 72000, lease_remaining_years: 5, monthly_rent: 350000, cuisine: 'North Indian', years_running: 11, seating_capacity: 80 } },
  { type: 'restaurant', at: 'sohna-road', title: 'South-Indian QSR with strong delivery share', summary: 'Quick-service outlet; ~55% of revenue from aggregators, compact kitchen, low staff cost.', attrs: { daily_footfall: 300, daily_billing: 38000, lease_remaining_years: 4, monthly_rent: 120000, cuisine: 'South Indian', years_running: 6, seating_capacity: 30, asking_price: 45 * L } },
  { type: 'restaurant', at: 'cyber-hub', title: 'Pan-Asian casual dining at a corporate food hub', summary: 'Busy weekday lunches from surrounding offices; fully equipped kitchen and trained chefs.', attrs: { daily_footfall: 240, daily_billing: 110000, lease_remaining_years: 3, monthly_rent: 520000, cuisine: 'Pan-Asian', years_running: 5, seating_capacity: 100 } },
  { type: 'restaurant', at: 'sector-14', title: 'Neighbourhood café & bakery in old Gurgaon', summary: 'Café with in-house bakery, strong morning trade and custom-cake orders.', attrs: { daily_footfall: 150, daily_billing: 22000, lease_remaining_years: 6, monthly_rent: 65000, cuisine: 'Café & bakery', years_running: 8, seating_capacity: 28, asking_price: 28 * L } },
  { type: 'restaurant', at: 'airia-mall', title: 'Food-court kiosk cluster in a Sohna Road mall', summary: 'Two adjoining food-court counters (rolls & biryani) with shared kitchen staff.', attrs: { daily_footfall: 400, daily_billing: 30000, lease_remaining_years: 2, monthly_rent: 90000, cuisine: 'Rolls & biryani', years_running: 3, seating_capacity: 0 } },
  { type: 'restaurant', at: 'dwarka-expressway', title: 'Fine-dine restaurant on Dwarka Expressway', summary: 'Large-format fine-dine with banquet space serving new residential townships.', attrs: { daily_footfall: 90, daily_billing: 55000, lease_remaining_years: 9, monthly_rent: 210000, cuisine: 'Multi-cuisine', years_running: 2, seating_capacity: 120, asking_price: 1.1 * CR } },

  // Doctors
  { type: 'doctor', at: 'south-city-1', title: '20-year general physician practice', summary: 'Well-known family-medicine practice with multi-generational patient relationships and in-house pharmacy tie-up.', attrs: { specialty: 'General physician', years_running: 20, patient_count: 2000, monthly_billing: 2 * L, premises: 'rented' } },
  { type: 'doctor', at: 'dlf-phase-4', title: 'Dental clinic with 3 chairs', summary: 'Modern dental clinic with digital X-ray, two associate dentists and steady implant/aligner work.', attrs: { specialty: 'Dental', years_running: 9, patient_count: 3500, monthly_billing: 6.5 * L, premises: 'rented', asking_price: 1.2 * CR } },
  { type: 'doctor', at: 'sushant-lok-1', title: 'Paediatric clinic near a residential hub', summary: 'Paediatric OPD with vaccination programme and tie-ups with two nearby hospitals.', attrs: { specialty: 'Paediatrics', years_running: 12, patient_count: 4200, monthly_billing: 4 * L, premises: 'owned' } },
  { type: 'doctor', at: 'sector-56', title: 'Physiotherapy & sports-rehab centre', summary: 'Rehab centre with modern equipment, three physiotherapists and corporate wellness contracts.', attrs: { specialty: 'Physiotherapy', years_running: 6, patient_count: 900, monthly_billing: 3.2 * L, premises: 'rented', asking_price: 55 * L } },
  { type: 'doctor', at: 'palam-vihar', title: 'Dermatology & cosmetology clinic', summary: 'Skin and hair clinic with laser equipment and a growing aesthetic-procedures book.', attrs: { specialty: 'Dermatology', years_running: 8, patient_count: 2600, monthly_billing: 5 * L, premises: 'rented' } },
  { type: 'doctor', at: 'sector-31', title: 'Eye clinic with optical store', summary: 'Ophthalmology practice with attached optical retail and minor-procedure room.', attrs: { specialty: 'Ophthalmology', years_running: 15, patient_count: 5000, monthly_billing: 4.5 * L, premises: 'owned', asking_price: 90 * L } },

  // CA practices
  { type: 'ca', at: 'mg-road', title: 'Audit & tax CA practice with SME clients', summary: 'Established practice focused on SME audit, GST and income-tax filings; recurring retainer base.', attrs: { client_count: 120, annual_billing: 45 * L, years_running: 14, staff_count: 9, services: 'Audit, GST, ITR' } },
  { type: 'ca', at: 'sector-14', title: 'Small CA practice with salaried & small-business clients', summary: 'Owner-run practice handling ITR, GST returns and bookkeeping; owner relocating.', attrs: { client_count: 55, annual_billing: 2.4 * L, years_running: 7, staff_count: 2, services: 'ITR, GST, bookkeeping', asking_price: 3 * L } },
  { type: 'ca', at: 'udyog-vihar', title: 'Manufacturing-focused CA firm near the industrial belt', summary: 'Statutory audit and costing work for manufacturing clients in the Udyog Vihar cluster.', attrs: { client_count: 80, annual_billing: 32 * L, years_running: 18, staff_count: 7, services: 'Statutory audit, costing, GST', asking_price: 48 * L } },
  { type: 'ca', at: 'golf-course-ext-road', title: 'Start-up advisory CA practice', summary: 'Virtual-CFO and compliance practice serving funded start-ups; mostly monthly retainers.', attrs: { client_count: 40, annual_billing: 28 * L, years_running: 5, staff_count: 5, services: 'Virtual CFO, compliance, valuations' } },

  // CS practices
  { type: 'cs', at: 'cyber-city', title: 'Corporate secretarial practice with listed-company work', summary: 'CS practice handling secretarial audit and board compliance for mid-size corporates.', attrs: { client_count: 65, annual_billing: 22 * L, years_running: 10, staff_count: 4, services: 'Secretarial audit, board compliance', asking_price: 30 * L } },
  { type: 'cs', at: 'sohna-road', title: 'ROC-filing & incorporation CS practice', summary: 'High-volume incorporation and annual ROC filings for small companies and LLPs.', attrs: { client_count: 150, annual_billing: 12 * L, years_running: 6, staff_count: 3, services: 'Incorporation, ROC filings' } },
  { type: 'cs', at: 'dlf-phase-1', title: 'Boutique CS practice for family-owned groups', summary: 'Long-standing relationships with family business groups; FEMA and restructuring work.', attrs: { client_count: 30, annual_billing: 18 * L, years_running: 16, staff_count: 3, services: 'FEMA, restructuring, compliance', asking_price: 25 * L } },
  { type: 'cs', at: 'sector-45', title: 'Solo CS practice with retainer clients', summary: 'Owner-run practice with steady annual-compliance retainers; ideal for a young CS.', attrs: { client_count: 35, annual_billing: 6 * L, years_running: 4, staff_count: 1, services: 'Annual compliance, ROC' } },
];

const requirements: SeedReq[] = [
  { type: 'ca', title: 'CA practice with 50+ clients', areas: [], budget_max: 5 * L, criteria: { min_client_count: 50, min_annual_billing: 2 * L } },
  { type: 'ca', title: 'Audit-heavy CA firm near MG Road / Udyog Vihar', areas: ['mg-road', 'udyog-vihar'], budget_min: 30 * L, budget_max: 70 * L, criteria: { min_client_count: 70, min_annual_billing: 25 * L } },
  { type: 'cs', title: 'CS practice with corporate clients', areas: ['cyber-city', 'dlf-phase-1', 'golf-course-road'], budget_max: 35 * L, criteria: { min_client_count: 25, min_annual_billing: 10 * L } },
  { type: 'pub', title: 'Pub in a mall with 3+ year lease', areas: ['ambience-mall', 'cyber-hub', 'mgf-metropolitan'], budget_max: 2 * CR, criteria: { min_daily_billing: 50000, min_lease_remaining_years: 3 } },
  { type: 'pub', title: 'Lounge bar in Sector 29 or Golf Course Road', areas: ['sector-29', 'golf-course-road'], budget_min: 80 * L, budget_max: 2.5 * CR, criteria: { min_daily_footfall: 100 } },
  { type: 'restaurant', title: 'QSR or café on Sohna Road', areas: ['sohna-road', 'omaxe-celebration', 'airia-mall'], budget_max: 60 * L, criteria: { min_daily_billing: 20000 } },
  { type: 'restaurant', title: 'Family restaurant, any area', areas: [], budget_max: 1.5 * CR, criteria: { min_daily_footfall: 150, cuisine: 'North Indian' } },
  { type: 'doctor', title: 'General physician practice with 1500+ patients', areas: ['south-city-1', 'sushant-lok-1', 'sector-31'], budget_max: 50 * L, criteria: { specialty: 'General physician', min_patient_count: 1500 } },
  { type: 'doctor', title: 'Dental clinic in DLF / Golf Course Road', areas: ['dlf-phase-4', 'dlf-phase-5', 'golf-course-road'], budget_max: 1.5 * CR, criteria: { specialty: 'Dental', min_monthly_billing: 4 * L } },
  { type: 'doctor', title: 'Any specialty clinic, monthly billing ₹3L+', areas: [], budget_max: 80 * L, criteria: { min_monthly_billing: 3 * L } },
];

// ───────────────────────── helpers ─────────────────────────
const q = (v: unknown) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const j = (v: unknown) => `${q(JSON.stringify(v))}::jsonb`;
const arr = (v: string[]) => `array[${v.map(q).join(',')}]::text[]`;

// Deterministic jitter (≈ ±250 m) so seed pins don't stack and don't reveal exact premises.
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const jitter = () => (rand() - 0.5) * 0.0045;

const types: any[] = bt.types;
const bySlug = new Map<string, any>(loc.localities.map((l: any, i: number) => [l.slug, { ...l, id: i + 1 }]));

function valuation(type: any, attrs: Attrs) {
  const annual = Math.round(Number(attrs[type.revenue.field] ?? 0) * type.revenue.annual_factor);
  let { multiple_low: lo, multiple_high: hi } = type.valuation;
  const lease = Number(attrs.lease_remaining_years ?? 99);
  if (lease < 2) { lo *= 0.8; hi *= 0.8; }
  const round = (n: number) => Math.round(n / 50000) * 50000;
  return { annual, low: round(annual * lo), high: round(annual * hi), lo, hi };
}

const out: string[] = [
  '-- GENERATED by scripts/gen-seed.ts — do not edit by hand.',
  '-- Config (idempotent upserts)',
];

types.forEach((t, i) => {
  out.push(`insert into public.business_types (key,label,plural,icon,color,aliases,fields,buyer_fields,revenue,valuation,sort)
values (${q(t.key)},${q(t.label)},${q(t.plural)},${q(t.icon)},${q(t.color)},${arr(t.aliases)},${j(t.fields)},${j(t.buyer_fields)},${j(t.revenue)},${j(t.valuation)},${i})
on conflict (key) do update set label=excluded.label, plural=excluded.plural, icon=excluded.icon, color=excluded.color, aliases=excluded.aliases,
  fields=excluded.fields, buyer_fields=excluded.buyer_fields, revenue=excluded.revenue, valuation=excluded.valuation, sort=excluded.sort, updated_at=now();`);
});
out.push(`insert into public.app_config (key,value) values ('buyer_common_fields', ${j(bt.buyer_common_fields)}), ('city', ${j(loc.city)})
on conflict (key) do update set value = excluded.value;`);

for (const l of bySlug.values()) {
  out.push(`insert into public.localities (id,slug,name,kind,lat,lng,aliases) values (${l.id},${q(l.slug)},${q(l.name)},${q(l.kind)},${l.lat},${l.lng},${arr(l.aliases)})
on conflict (slug) do update set name=excluded.name, kind=excluded.kind, lat=excluded.lat, lng=excluded.lng, aliases=excluded.aliases;`);
}
out.push(`select setval('public.localities_id_seq', (select max(id) from public.localities));`);

out.push('', '-- Demo data (fictional). Re-running replaces previous seed rows.');
out.push('delete from public.listings where is_seed; delete from public.buyer_requirements where is_seed;');

listings.forEach((s, i) => {
  const t = types.find((x) => x.key === s.type);
  const l = bySlug.get(s.at);
  if (!t || !l) throw new Error(`bad seed row ${i}: ${s.type}/${s.at}`);
  const v = valuation(t, s.attrs);
  const attrs = { ...s.attrs, location: l.name };
  const reasoning = `Indicative ${v.lo.toFixed(1)}–${v.hi.toFixed(1)}× ${t.valuation.basis} of ₹${(v.annual / L).toFixed(1)}L for a ${t.label.toLowerCase()}${Number(s.attrs.lease_remaining_years ?? 99) < 2 ? ', discounted for short lease' : ''}.`;
  const daysAgo = Math.floor(rand() * 40);
  out.push(`insert into public.listings (business_type,title,summary,attributes,locality_id,location_text,lat,lng,annual_revenue,asking_price,valuation_low,valuation_high,valuation_reasoning,stage,view_count,is_seed,published_at)
values (${q(s.type)},${q(s.title)},${q(s.summary)},${j(attrs)},${l.id},${q(l.name)},${(l.lat + jitter()).toFixed(6)},${(l.lng + jitter()).toFixed(6)},${v.annual},${s.attrs.asking_price ?? 'null'},${v.low},${v.high},${q(reasoning)},'listed',${Math.floor(rand() * 180) + 5},true,now() - interval '${daysAgo} days');`);
});

requirements.forEach((r) => {
  const ids = r.areas.map((a) => {
    const l = bySlug.get(a);
    if (!l) throw new Error(`bad area ${a}`);
    return l.id;
  });
  out.push(`insert into public.buyer_requirements (business_type,title,criteria,locality_ids,budget_min,budget_max,stage,is_seed)
values (${q(r.type)},${q(r.title)},${j({ ...r.criteria, areas: r.areas.map((a) => bySlug.get(a).name) })},array[${ids.join(',')}]::int[],${r.budget_min ?? 'null'},${r.budget_max},'listed',true);`);
});

writeFileSync(join(root, 'supabase/seed.sql'), out.join('\n') + '\n');
console.log(`seed.sql: ${types.length} business types, ${bySlug.size} localities, ${listings.length} listings, ${requirements.length} requirements`);
