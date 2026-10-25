// Business-type schemas and the Gurgaon gazetteer. Bundled copies make the UI work offline;
// the DB (business_types / localities) is the runtime source of truth and wins when reachable.
import bundledTypes from '../../shared/business-types.json';
import bundledLocalities from '../../shared/localities.json';

import { supabase } from '@/lib/supabase';
import type { BusinessType, FieldDef, Locality } from '@/lib/types';

let types: BusinessType[] = bundledTypes.types as BusinessType[];
export const buyerCommonFields = bundledTypes.buyer_common_fields as FieldDef[];
export const CITY = bundledLocalities.city;
export const LOCALITIES = bundledLocalities.localities as Locality[];

export function businessTypes() {
  return types;
}

export function typeOf(key: string | null | undefined): BusinessType | undefined {
  return types.find((t) => t.key === key);
}

export function typeColor(key: string | null | undefined) {
  return typeOf(key)?.color ?? '#64748B';
}

export async function refreshConfig() {
  const { data } = await supabase.from('business_types').select('*').eq('active', true).order('sort');
  if (data?.length) types = data as BusinessType[];
}

/** Ordered fields to show for a listing/requirement: schema fields first, then any extras the agent captured. */
export function displayFields(typeKey: string | null | undefined, role: 'seller' | 'buyer'): FieldDef[] {
  const t = typeOf(typeKey);
  if (role === 'buyer') return [...buyerCommonFields, ...(t?.buyer_fields ?? [])];
  return t?.fields ?? [];
}
