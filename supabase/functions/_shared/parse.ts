// Deterministic helpers: Indian amounts, business-type detection, gazetteer matching, and a
// regex fallback extractor used when the LLM is unavailable (free-tier quota) so flows never dead-end.
import type { BusinessType, Locality } from './config.ts';

const UNIT: Record<string, number> = {
  k: 1e3, thousand: 1e3,
  l: 1e5, lac: 1e5, lacs: 1e5, lakh: 1e5, lakhs: 1e5, lakhs_: 1e5,
  cr: 1e7, crore: 1e7, crores: 1e7,
};

const AMOUNT_RE = /(?:rs\.?|inr|₹)?\s*(\d[\d,]*(?:\.\d+)?)\s*(crores?|cr|lakhs?|lacs?|lac|l\b|k\b|thousand)?/i;

/** "Rs 2 lacs" → 200000, "10k" → 10000, "₹1.5 cr" → 15000000, "30,000" → 30000 */
export function parseAmount(s: string | number | null | undefined): number | null {
  if (s === null || s === undefined) return null;
  if (typeof s === 'number') return Number.isFinite(s) ? Math.round(s) : null;
  const m = s.match(AMOUNT_RE);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] ?? '').toLowerCase().replace(/\s/g, '');
  return Math.round(n * (UNIT[unit] ?? 1));
}

export function norm(s: string) {
  return ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

export function detectType(text: string, types: BusinessType[]): string | null {
  const t = norm(text);
  let best: { key: string; len: number } | null = null;
  for (const bt of types) {
    for (const a of [bt.key, bt.label, ...bt.aliases]) {
      const n = norm(a);
      if (n.trim().length >= 2 && t.includes(n) && (!best || n.length > best.len)) best = { key: bt.key, len: n.length };
    }
  }
  return best?.key ?? null;
}

/** Best gazetteer match for free text (longest alias contained in the text wins). */
export function matchLocality(text: string | null | undefined, localities: Locality[]): Locality | null {
  if (!text) return null;
  const t = norm(text);
  let best: { loc: Locality; len: number } | null = null;
  for (const l of localities) {
    for (const a of [l.name, l.slug.replace(/-/g, ' '), ...l.aliases]) {
      const n = norm(a);
      if (n.trim().length >= 3 && t.includes(n) && (!best || n.length > best.len)) best = { loc: l, len: n.length };
    }
  }
  return best?.loc ?? null;
}

export const ANYWHERE_RE = /\b(any ?where|any area|all of gurgaon|all over|whole gurgaon|entire gurgaon|no preference|doesn'?t matter|any location|anywhere in gurgaon|gurgaon only|in gurgaon)\b/i;

export function isOnlyCity(text: string) {
  return /^\s*(in\s+)?(gurgaon|gurugram)(,?\s*(haryana|india))?\s*\.?\s*$/i.test(text);
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

const MONEY = String.raw`(?:rs\.?|inr|₹)?\s*\d[\d,]*(?:\.\d+)?\s*(?:crores?|cr|lakhs?|lacs?|lac|l\b|k\b|thousand)?`;

/** Regex fallback extraction — lower quality than the LLM, only used when it is unavailable. */
export function fallbackExtract(text: string, fieldKeys: string[]): Record<string, unknown> {
  const t = text.toLowerCase();
  const out: Record<string, unknown> = {};
  const grab = (re: RegExp, money = false) => {
    const m = t.match(re);
    if (!m) return null;
    return money ? parseAmount(m[1]) : parseFloat(m[1].replace(/,/g, ''));
  };
  const rules: Record<string, () => unknown> = {
    daily_footfall: () => grab(/(\d[\d,]*)\s*(?:people|persons|customers|guests|footfall|covers)/) ?? grab(/footfall[^\d]{0,20}(\d[\d,]*)/),
    daily_billing: () => grab(new RegExp(`(${MONEY})\\s*(?:a|per|\\/)\\s*day`), true) ?? grab(new RegExp(`daily (?:billing|sales|revenue)s?[^\\d₹]{0,25}(${MONEY})`), true),
    monthly_rent: () => grab(new RegExp(`(?:rent|lease)[^\\d₹]{0,40}(${MONEY})\\s*(?:\\/|a|per)?\\s*month`), true) ?? grab(new RegExp(`(${MONEY})\\s*(?:\\/|a|per)\\s*month[^.]{0,20}rent`), true),
    lease_remaining_years: () => grab(/lease[^\d]{0,30}(\d+(?:\.\d+)?)\s*(?:more\s*)?(?:years?|yrs?)/) ?? grab(/(\d+(?:\.\d+)?)\s*(?:more\s*)?(?:years?|yrs?)\s*(?:left|remaining)?\s*(?:on|of)?\s*(?:the\s*)?lease/),
    years_running: () => grab(/(\d+)\s*(?:-|\s)?(?:years?|yrs?)\s*(?:old|running|established|practice|in business)/) ?? grab(/(?:running|established|operating)\s*(?:for|since)?\s*(\d+)\s*(?:years?|yrs?)/),
    patient_count: () => grab(/(\d[\d,]*)\s*(?:\+\s*)?patients/),
    monthly_billing: () => grab(new RegExp(`monthly (?:billing|revenue|income|collection)s?[^\\d₹]{0,25}(${MONEY})`), true) ?? grab(new RegExp(`(${MONEY})\\s*(?:\\/|a|per)\\s*month`), true),
    client_count: () => grab(/(\d[\d,]*)\s*(?:\+\s*)?clients/),
    annual_billing: () => grab(new RegExp(`annual (?:billing|revenue|fees|turnover)s?[^\\d₹]{0,25}(${MONEY})`), true) ?? grab(new RegExp(`(${MONEY})\\s*(?:\\/|a|per)\\s*(?:year|annum)`), true),
    asking_price: () => grab(new RegExp(`(?:asking|price|expect(?:ing)?|want)[^\\d₹]{0,25}(${MONEY})`), true),
    budget_max: () => grab(new RegExp(`(?:budget|upto|up to|max(?:imum)?|within)[^\\d₹]{0,20}(${MONEY})`), true),
    min_client_count: () => grab(/(\d[\d,]*)\s*(?:\+\s*)?clients/),
    min_annual_billing: () => grab(new RegExp(`annual (?:billing|revenue|fees)s?[^\\d₹]{0,25}(${MONEY})`), true),
    min_patient_count: () => grab(/(\d[\d,]*)\s*(?:\+\s*)?patients/),
    min_monthly_billing: () => grab(new RegExp(`monthly (?:billing|revenue)s?[^\\d₹]{0,25}(${MONEY})`), true),
    min_daily_billing: () => grab(new RegExp(`daily (?:billing|sales)s?[^\\d₹]{0,25}(${MONEY})`), true),
    min_daily_footfall: () => grab(/(\d[\d,]*)\s*(?:people|customers|footfall)/),
  };
  for (const k of fieldKeys) {
    const v = rules[k]?.();
    if (v !== null && v !== undefined && !Number.isNaN(v)) out[k] = v;
  }
  const spec = t.match(/(general physician|gp|dental|dentist|paediatric|pediatric|dermatolog\w*|ophthalmolog\w*|eye|physiotherap\w*|gynaecolog\w*|ent|orthopaedic|cardiolog\w*)/);
  if (spec && fieldKeys.includes('specialty')) out.specialty = spec[1].replace(/^gp$/, 'general physician');
  return out;
}
