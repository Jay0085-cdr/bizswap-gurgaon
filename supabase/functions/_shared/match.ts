// matchmaker-agent core: deterministic pre-score narrows candidates (cheap, explainable), then one
// batched LLM call refines the top candidates with a 0-100 fit score and short reasons.
import { z } from 'npm:zod@4';

import { loadConfig, type Locality } from './config.ts';
import { admin } from './db.ts';
import { inr } from './fmt.ts';
import { generateJSON, logStep } from './llm/index.ts';
import { haversineKm } from './parse.ts';
import { notifyMatches } from './watch.ts';

type Listing = {
  id: string;
  business_type: string;
  title: string;
  summary: string;
  attributes: Record<string, unknown>;
  lat: number;
  lng: number;
  asking_price: number | null;
  valuation_low: number | null;
  valuation_high: number | null;
  location_text: string | null;
  stage: string;
};
type Requirement = {
  id: string;
  business_type: string;
  title: string;
  criteria: Record<string, unknown>;
  locality_ids: number[];
  budget_min: number | null;
  budget_max: number | null;
  stage: string;
};

const LISTING_COLS = 'id,business_type,title,summary,attributes,lat,lng,asking_price,valuation_low,valuation_high,location_text,stage';
const REQ_COLS = 'id,business_type,title,criteria,locality_ids,budget_min,budget_max,stage';
const MIN_SCORE = 50;
const TOP_N = 8;

export function preScore(l: Listing, r: Requirement, locs: Locality[]): { score: number; reasons: string[] } {
  if (l.business_type !== r.business_type) return { score: 0, reasons: ['different business type'] };
  const reasons: string[] = [];

  // location (30)
  let loc = 30;
  if (r.locality_ids?.length) {
    const pts = locs.filter((x) => r.locality_ids.includes(x.id));
    const d = Math.min(...pts.map((p) => haversineKm(p, l)));
    loc = d <= 1.5 ? 30 : d <= 4 ? 22 : d <= 8 ? 12 : 4;
    reasons.push(d <= 1.5 ? 'in a preferred area' : `${d.toFixed(1)} km from preferred area`);
  } else reasons.push('any area OK');

  // budget (30)
  const price = l.asking_price ?? (l.valuation_low && l.valuation_high ? Math.round((l.valuation_low + l.valuation_high) / 2) : null);
  let bud = 15;
  if (price && r.budget_max) {
    if (price <= r.budget_max) bud = r.budget_min && price < r.budget_min * 0.5 ? 20 : 30;
    else if (price <= r.budget_max * 1.2) bud = 18;
    else if (price <= r.budget_max * 1.5) bud = 8;
    else bud = 0;
    reasons.push(price <= r.budget_max ? `price ${inr(price)} within budget` : `price ${inr(price)} above budget ${inr(r.budget_max)}`);
  }

  // criteria (40)
  const parts: number[] = [];
  for (const [k, want] of Object.entries(r.criteria ?? {})) {
    if (k === 'areas' || want === null || want === undefined || want === '') continue;
    if (k.startsWith('min_')) {
      const have = Number(l.attributes[k.slice(4)] ?? NaN);
      if (Number.isNaN(have)) continue;
      const ratio = have / Number(want);
      parts.push(ratio >= 1 ? 1 : ratio >= 0.8 ? 0.5 : 0);
      if (ratio < 0.8) reasons.push(`${k.slice(4).replace(/_/g, ' ')} below minimum`);
    } else if (typeof want === 'string') {
      const have = String(l.attributes[k] ?? '').toLowerCase();
      if (!have) continue;
      const ok = have.includes(want.toLowerCase()) || want.toLowerCase().includes(have);
      parts.push(ok ? 1 : 0);
      if (!ok) reasons.push(`${k} differs`);
    }
  }
  const crit = parts.length ? (parts.reduce((a, b) => a + b, 0) / parts.length) * 40 : 30;
  return { score: Math.round(loc + bud + crit), reasons };
}

const Out = z.object({
  matches: z.array(z.object({ id: z.string(), score: z.number().min(0).max(100), reasons: z.array(z.string()).min(1).max(4) })),
});
const OutSchema = {
  type: 'object',
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          score: { type: 'integer', description: '0-100 fit' },
          reasons: { type: 'array', items: { type: 'string' }, description: '2-3 short reasons, <= 12 words each' },
        },
        required: ['id', 'score', 'reasons'],
      },
    },
  },
  required: ['matches'],
};

function describeListing(l: Listing) {
  return { title: l.title, location: l.location_text, attributes: l.attributes, asking_price: l.asking_price, valuation: [l.valuation_low, l.valuation_high] };
}
function describeReq(r: Requirement) {
  return { wants: r.title, criteria: r.criteria, budget: [r.budget_min, r.budget_max] };
}

type Pair = { l: Listing; r: Requirement; pre: { score: number; reasons: string[] } };

async function refine(pairs: Pair[], anchor: 'listing' | 'requirement', entityId: string) {
  if (!pairs.length) return [] as { listing_id: string; requirement_id: string; score: number; reasons: string[]; pre_score: number }[];
  const anchorDesc = anchor === 'listing' ? describeListing(pairs[0].l) : describeReq(pairs[0].r);
  const candidates = pairs.map((p) => ({
    id: anchor === 'listing' ? p.r.id : p.l.id,
    ...(anchor === 'listing' ? describeReq(p.r) : describeListing(p.l)),
    rule_score: p.pre.score,
    rule_notes: p.pre.reasons,
  }));
  let refined: z.infer<typeof Out>['matches'] = [];
  try {
    const out = await generateJSON({ agent: 'matchmaker-agent', entityId }, {
      system:
        'You are the matchmaker agent for a Gurgaon business-for-sale marketplace. Score how well each candidate fits the anchor (0-100) from the buyer\'s perspective: business type, size metrics vs minimums, location, budget vs price/valuation. Use rule_score as a baseline; adjust by at most ±20 with justification. Reasons must be concrete and short (₹ in lakh/crore). Return every candidate id exactly once.',
      input: JSON.stringify({ anchor_type: anchor, anchor: anchorDesc, candidates }),
      schema: OutSchema,
      schemaName: 'match_scores',
      zod: Out,
      maxTokens: 1200,
    });
    refined = out.matches;
  } catch {
    await logStep({ agent: 'matchmaker-agent', entityId }, { candidates: candidates.length }, null, 'pre-score-only');
  }
  const byId = new Map(refined.map((m) => [m.id, m]));
  return pairs.map((p) => {
    const id = anchor === 'listing' ? p.r.id : p.l.id;
    const m = byId.get(id);
    const score = m ? Math.max(p.pre.score - 20, Math.min(p.pre.score + 20, Math.round(m.score))) : p.pre.score;
    return { listing_id: p.l.id, requirement_id: p.r.id, score: Math.max(0, Math.min(100, score)), reasons: m?.reasons ?? p.pre.reasons, pre_score: p.pre.score };
  });
}

export async function runMatchmaker(input: { listingId?: string; requirementId?: string }) {
  const db = admin();
  const cfg = await loadConfig();
  let pairs: Pair[] = [];
  let anchor: 'listing' | 'requirement';
  let entityId: string;

  if (input.listingId) {
    anchor = 'listing';
    entityId = input.listingId;
    const { data: l } = await db.from('listings').select(LISTING_COLS).eq('id', input.listingId).single();
    if (!l) throw new Error('listing not found');
    const { data: reqs } = await db.from('buyer_requirements').select(REQ_COLS).eq('business_type', l.business_type).neq('stage', 'closed');
    pairs = (reqs ?? []).map((r) => ({ l: l as Listing, r: r as Requirement, pre: preScore(l as Listing, r as Requirement, cfg.localities) }));
  } else if (input.requirementId) {
    anchor = 'requirement';
    entityId = input.requirementId;
    const { data: r } = await db.from('buyer_requirements').select(REQ_COLS).eq('id', input.requirementId).single();
    if (!r) throw new Error('requirement not found');
    const { data: ls } = await db.from('listings').select(LISTING_COLS).eq('business_type', r.business_type).in('stage', ['listed', 'matched', 'contacted', 'in_discussion']);
    pairs = (ls ?? []).map((l) => ({ l: l as Listing, r: r as Requirement, pre: preScore(l as Listing, r as Requirement, cfg.localities) }));
  } else throw new Error('listingId or requirementId required');

  const top = pairs.filter((p) => p.pre.score >= 35).sort((a, b) => b.pre.score - a.pre.score).slice(0, TOP_N);
  const scored = (await refine(top, anchor, entityId)).filter((m) => m.score >= MIN_SCORE);

  let created: string[] = [];
  if (scored.length) {
    const { data: existing } = await db
      .from('matches')
      .select('id, listing_id, requirement_id')
      .in(anchor === 'listing' ? 'requirement_id' : 'listing_id', scored.map((s) => (anchor === 'listing' ? s.requirement_id : s.listing_id)))
      .eq(anchor === 'listing' ? 'listing_id' : 'requirement_id', entityId);
    const had = new Set((existing ?? []).map((e) => `${e.listing_id}:${e.requirement_id}`));
    const { data: up, error } = await db
      .from('matches')
      .upsert(scored.map((s) => ({ ...s, created_by: 'matchmaker-agent' })), { onConflict: 'listing_id,requirement_id' })
      .select('id, listing_id, requirement_id');
    if (error) throw error;
    created = (up ?? []).filter((u) => !had.has(`${u.listing_id}:${u.requirement_id}`)).map((u) => u.id);

    const listingIds = [...new Set(scored.map((s) => s.listing_id))];
    const reqIds = [...new Set(scored.map((s) => s.requirement_id))];
    await db.from('listings').update({ stage: 'matched' }).in('id', listingIds).eq('stage', 'listed');
    await db.from('buyer_requirements').update({ stage: 'matched' }).in('id', reqIds).eq('stage', 'listed');
  }

  const notified = await notifyMatches(created);
  return { candidates: pairs.length, refined: top.length, matches: scored.length, new_matches: created.length, ...notified };
}
