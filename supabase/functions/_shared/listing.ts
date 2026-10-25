// listing-agent core: geocode against the static gazetteer, write anonymised copy, value, publish, match.
// Also turns a completed buyer conversation into a saved requirement.
import { z } from 'npm:zod@4';

import { loadConfig, type BusinessType, type Locality } from './config.ts';
import { admin } from './db.ts';
import { fmtField, inr } from './fmt.ts';
import { generateJSON, logStep } from './llm/index.ts';
import { runMatchmaker } from './match.ts';
import { matchLocality } from './parse.ts';
import { valuate } from './valuation.ts';

type Conv = {
  id: string;
  user_id: string;
  role: 'seller' | 'buyer';
  business_type: string | null;
  status: string;
  extracted: { fields?: Record<string, unknown>; locality_id?: number | null; locality_ids?: number[] };
  missing: string[];
  listing_id: string | null;
  requirement_id: string | null;
};

const PickOut = z.object({ slug: z.string().nullable() });

/** Map a free-text place to a gazetteer entry: exact alias match first, then let the LLM pick the nearest known place. */
export async function geocode(text: string, localities: Locality[], ctx: { conversationId?: string; userId?: string }) {
  const hit = matchLocality(text, localities);
  if (hit) {
    await logStep({ agent: 'listing-agent', ...ctx }, { geocode: text }, { slug: hit.slug, via: 'alias' }, 'gazetteer');
    return hit;
  }
  try {
    const out = await generateJSON({ agent: 'listing-agent', ...ctx }, {
      system:
        'You geocode places in Gurgaon (Gurugram), India. Pick the single closest known place from the list for the user-described location, or null if it is not in Gurgaon or too vague. Use your knowledge of Gurgaon geography (sectors, roads, malls).',
      input: JSON.stringify({ place: text, known_places: localities.map((l) => ({ slug: l.slug, name: l.name, kind: l.kind })) }),
      schema: { type: 'object', properties: { slug: { type: ['string', 'null'] } }, required: ['slug'] },
      schemaName: 'pick_place',
      zod: PickOut,
      maxTokens: 100,
    });
    return localities.find((l) => l.slug === out.slug) ?? null;
  } catch {
    return null;
  }
}

const CopyOut = z.object({ title: z.string().min(8).max(90), summary: z.string().min(20).max(400) });
const CopySchema = {
  type: 'object',
  properties: {
    title: { type: 'string', description: '<= 60 chars, anonymised' },
    summary: { type: 'string', description: '2 sentences, <= 260 chars' },
  },
  required: ['title', 'summary'],
};

function fallbackCopy(t: BusinessType, attrs: Record<string, unknown>, place: string) {
  const bits = t.fields
    .filter((f) => f.required && f.type !== 'locality' && attrs[f.key] !== undefined)
    .slice(0, 3)
    .map((f) => `${f.label.toLowerCase()} ${fmtField(f.type, attrs[f.key], f.unit)}`);
  return {
    title: `${attrs.specialty ? `${attrs.specialty} ` : ''}${t.label.split(' /')[0]} for sale near ${place}`.slice(0, 80),
    summary: `Running ${t.label.toLowerCase()} in ${place}, Gurgaon with ${bits.join(', ')}. Details shared with serious buyers.`,
  };
}

export async function publishListing(conv: Conv) {
  const db = admin();
  const cfg = await loadConfig();
  const t = cfg.types.find((x) => x.key === conv.business_type);
  if (!t) throw new Error('business type missing');
  if (conv.status !== 'complete') throw new Error(`conversation not complete (missing: ${conv.missing.join(', ')})`);
  if (conv.listing_id) {
    const { data } = await db.from('public_listings').select('*').eq('id', conv.listing_id).maybeSingle();
    if (data) return data;
  }
  const ctx = { conversationId: conv.id, userId: conv.user_id };
  const attrs = { ...(conv.extracted.fields ?? {}) };

  let loc = cfg.localities.find((l) => l.id === conv.extracted.locality_id) ?? null;
  loc ??= await geocode(String(attrs.location ?? ''), cfg.localities, ctx);
  loc ??= cfg.localities.find((l) => l.slug === 'huda-city-centre')!; // city-centre fallback
  // ~±250 m jitter so the pin never reveals the exact premises
  const lat = loc.lat + (Math.random() - 0.5) * 0.0045;
  const lng = loc.lng + (Math.random() - 0.5) * 0.0045;

  const asking = attrs.asking_price ? Number(attrs.asking_price) : null;
  const val = await valuate({ agent: 'valuation-agent', ...ctx }, t, attrs, asking);

  let copy = fallbackCopy(t, attrs, loc.name);
  try {
    copy = await generateJSON({ agent: 'listing-agent', ...ctx }, {
      system:
        'You write listing copy for a confidential business-for-sale marketplace in Gurgaon. Title: <= 60 chars, appealing, ANONYMISED — never include the business name, owner name, phone, or exact shop number; you may mention the area type and locality (e.g. "in a premium NH-48 mall"). Summary: 2 factual sentences using ONLY the given facts (₹ in lakh/crore). No exaggeration, no invented facts.',
      input: JSON.stringify({ type: t.label, locality: loc.name, locality_kind: loc.kind, facts: Object.fromEntries(t.fields.filter((f) => attrs[f.key] !== undefined && f.key !== 'location').map((f) => [f.label, fmtField(f.type, attrs[f.key], f.unit)])) }),
      schema: CopySchema,
      schemaName: 'listing_copy',
      zod: CopyOut,
      maxTokens: 300,
    });
  } catch {
    await logStep({ agent: 'listing-agent', ...ctx }, { attrs }, copy, 'copy-fallback');
  }

  const { data: listing, error } = await db
    .from('listings')
    .insert({
      seller_id: conv.user_id,
      conversation_id: conv.id,
      business_type: t.key,
      title: copy.title,
      summary: copy.summary,
      attributes: { ...attrs, location: attrs.location ?? loc.name },
      locality_id: loc.id,
      location_text: loc.name,
      lat,
      lng,
      annual_revenue: val.annual_revenue,
      asking_price: asking,
      valuation_low: val.low,
      valuation_high: val.high,
      valuation_reasoning: val.reasoning,
      stage: 'listed',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) throw error;

  await db.from('conversations').update({ status: 'published', listing_id: listing.id }).eq('id', conv.id);
  await db.from('notifications').insert({
    user_id: conv.user_id,
    kind: 'published',
    title: 'Your listing is live',
    body: `${copy.title} · indicative value ${inr(val.low)}–${inr(val.high)}`,
    payload: { listing_id: listing.id },
  });

  const match = await runMatchmaker({ listingId: listing.id }).catch((e) => ({ error: String(e) }));
  const { data: pub } = await db.from('public_listings').select('*').eq('id', listing.id).single();
  return { ...pub, is_mine: true, match_summary: match };
}

function requirementTitle(t: BusinessType, f: Record<string, unknown>, areas: string[]) {
  const bits: string[] = [];
  if (f.specialty) bits.push(String(f.specialty));
  if (f.min_client_count) bits.push(`${f.min_client_count}+ clients`);
  if (f.min_patient_count) bits.push(`${f.min_patient_count}+ patients`);
  if (f.min_annual_billing) bits.push(`${inr(Number(f.min_annual_billing))}+/yr billing`);
  if (f.min_monthly_billing) bits.push(`${inr(Number(f.min_monthly_billing))}+/mo billing`);
  if (f.min_daily_billing) bits.push(`${inr(Number(f.min_daily_billing))}+/day`);
  const where = areas.length ? ` · ${areas.slice(0, 2).join(', ')}${areas.length > 2 ? '…' : ''}` : '';
  return `${t.label.split(' /')[0]}${bits.length ? ` · ${bits.slice(0, 2).join(', ')}` : ''}${where}`.slice(0, 90);
}

export async function saveRequirement(conv: Conv) {
  const db = admin();
  const cfg = await loadConfig();
  const t = cfg.types.find((x) => x.key === conv.business_type);
  if (!t) throw new Error('business type missing');
  if (conv.status !== 'complete' && conv.status !== 'published') throw new Error(`conversation not complete (missing: ${conv.missing.join(', ')})`);

  const f = { ...(conv.extracted.fields ?? {}) };
  const ids = conv.extracted.locality_ids ?? [];
  const areaNames = cfg.localities.filter((l) => ids.includes(l.id)).map((l) => l.name);
  const criteria: Record<string, unknown> = { areas: areaNames.length ? areaNames : ['Anywhere in Gurgaon'] };
  for (const fd of t.buyer_fields) if (f[fd.key] !== undefined && f[fd.key] !== null) criteria[fd.key] = f[fd.key];

  const row = {
    buyer_id: conv.user_id,
    conversation_id: conv.id,
    business_type: t.key,
    title: requirementTitle(t, f, areaNames),
    criteria,
    locality_ids: ids,
    budget_min: f.budget_min ? Number(f.budget_min) : null,
    budget_max: f.budget_max ? Number(f.budget_max) : null,
    stage: 'listed',
  };

  let reqId = conv.requirement_id;
  if (reqId) await db.from('buyer_requirements').update(row).eq('id', reqId);
  else {
    const { data, error } = await db.from('buyer_requirements').insert(row).select('id').single();
    if (error) throw error;
    reqId = data.id;
  }
  await db.from('conversations').update({ status: 'published', requirement_id: reqId }).eq('id', conv.id);
  await db.from('saved_searches').upsert(
    { user_id: conv.user_id, source: 'requirement', requirement_id: reqId, criteria: { business_type: t.key, ...criteria, budget_max: row.budget_max } },
    { onConflict: 'user_id,requirement_id' },
  );

  const summary = await runMatchmaker({ requirementId: reqId! }).catch((e) => ({ error: String(e) }));
  const { data: requirement } = await db.from('buyer_requirements').select('*').eq('id', reqId).single();
  const { data: matches } = await db
    .from('matches')
    .select('id, score, reasons, status, requirement_id, listing:listings(id,business_type,title,summary,attributes,lat,lng,asking_price,valuation_low,valuation_high,stage,location_text)')
    .eq('requirement_id', reqId)
    .order('score', { ascending: false });
  type M = { id: string; score: number; reasons: string[]; status: string; requirement_id: string; listing: Record<string, unknown> & { location_text: string; stage: string; id: string } };
  return {
    requirement,
    match_summary: summary,
    matches: ((matches ?? []) as unknown as M[]).map((m) => ({
      match_id: m.id,
      requirement_id: m.requirement_id,
      score: m.score,
      reasons: m.reasons,
      status: m.status,
      ...m.listing,
      listing_id: m.listing.id,
      locality_name: m.listing.location_text,
      listing_stage: m.listing.stage,
    })),
  };
}
