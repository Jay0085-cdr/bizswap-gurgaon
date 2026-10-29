import type { Stage } from '@/constants/theme';

export type FieldType = 'inr' | 'number' | 'text' | 'locality' | 'locality_list' | 'boolean';

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  unit?: string;
  required: boolean;
  ask?: string;
  hint?: string;
};

export type BusinessType = {
  key: string;
  label: string;
  plural: string;
  icon: string;
  color: string;
  aliases: string[];
  fields: FieldDef[];
  buyer_fields: FieldDef[];
  revenue: { field: string; annual_factor: number };
  valuation: { multiple_low: number; multiple_high: number; basis: string; notes?: string };
};

export type Locality = { id?: number; slug: string; name: string; kind: string; lat: number; lng: number; aliases: string[] };

export type Attrs = Record<string, string | number | boolean | null>;

export type PublicListing = {
  id: string;
  business_type: string;
  title: string;
  summary: string;
  attributes: Attrs;
  locality_id: number | null;
  locality_name: string | null;
  location_text: string | null;
  lat: number;
  lng: number;
  annual_revenue: number | null;
  asking_price: number | null;
  valuation_low: number | null;
  valuation_high: number | null;
  valuation_reasoning: string | null;
  stage: Stage;
  view_count: number;
  is_seed: boolean;
  is_mine: boolean;
  published_at: string | null;
};

export type MyListing = PublicListing & { match_count: number; interest_count: number; created_at: string };

export type Requirement = {
  id: string;
  business_type: string;
  title: string;
  criteria: Attrs & { areas?: string[] };
  locality_ids: number[];
  budget_min: number | null;
  budget_max: number | null;
  stage: Stage;
  watch: boolean;
  created_at: string;
  match_count?: number;
  best_score?: number | null;
};

export type BuyerMatch = {
  match_id: string;
  requirement_id: string;
  score: number;
  reasons: string[];
  status: string;
  listing_id: string;
  business_type: string;
  title: string;
  summary: string;
  attributes: Attrs;
  lat: number;
  lng: number;
  locality_name: string | null;
  asking_price: number | null;
  valuation_low: number | null;
  valuation_high: number | null;
  listing_stage: Stage;
};

export type SellerMatch = {
  match_id: string;
  listing_id: string;
  score: number;
  reasons: string[];
  status: string;
  requirement_id: string;
  requirement_title: string;
  criteria: Attrs;
  budget_min: number | null;
  budget_max: number | null;
  buyer_interested: boolean;
};

export type ChatTurn = {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  input_mode?: 'voice' | 'text';
  pending?: boolean;
};

/** 'quick' = the AI was busy/unavailable and a rules-based fallback answered. */
export type AiMode = 'full' | 'quick';

export type IntakeResponse = {
  ai_mode?: AiMode;
  conversation_id: string;
  business_type: string | null;
  fields: Attrs;
  display: { key: string; label: string; value: string }[];
  missing: { key: string; label: string }[];
  reply: string;
  is_complete: boolean;
};

export type ConfirmResponse = { ai_mode?: AiMode } & (
  | { role: 'seller'; listing: PublicListing & { match_summary?: { matches?: number } } }
  | { role: 'buyer'; requirement: Requirement; matches: BuyerMatch[] }
);
