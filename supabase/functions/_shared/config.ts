// Business-type schemas + gazetteer, loaded from the DB (config-as-data) and cached per isolate.
import { admin } from './db.ts';

export type FieldDef = {
  key: string;
  label: string;
  type: 'inr' | 'number' | 'text' | 'locality' | 'locality_list' | 'boolean';
  unit?: string;
  required: boolean;
  ask?: string;
  hint?: string;
};

export type BusinessType = {
  key: string;
  label: string;
  plural: string;
  aliases: string[];
  fields: FieldDef[];
  buyer_fields: FieldDef[];
  revenue: { field: string; annual_factor: number };
  valuation: { multiple_low: number; multiple_high: number; basis: string; notes?: string };
};

export type Locality = { id: number; slug: string; name: string; kind: string; lat: number; lng: number; aliases: string[] };

type Config = { types: BusinessType[]; buyerCommon: FieldDef[]; localities: Locality[]; loadedAt: number };
let cache: Config | null = null;

export async function loadConfig(): Promise<Config> {
  if (cache && Date.now() - cache.loadedAt < 5 * 60_000) return cache;
  const db = admin();
  const [t, c, l] = await Promise.all([
    db.from('business_types').select('*').eq('active', true).order('sort'),
    db.from('app_config').select('*').eq('key', 'buyer_common_fields').maybeSingle(),
    db.from('localities').select('*'),
  ]);
  if (t.error) throw t.error;
  if (l.error) throw l.error;
  cache = {
    types: t.data as BusinessType[],
    buyerCommon: (c.data?.value ?? []) as FieldDef[],
    localities: l.data as Locality[],
    loadedAt: Date.now(),
  };
  return cache;
}

export function fieldsFor(cfg: Config, typeKey: string | null, role: 'seller' | 'buyer'): FieldDef[] {
  const t = cfg.types.find((x) => x.key === typeKey);
  if (role === 'buyer') return [...cfg.buyerCommon, ...(t?.buyer_fields ?? [])];
  return t?.fields ?? [];
}
