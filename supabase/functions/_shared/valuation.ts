// valuation-agent core: deterministic range from config multiples (auditable), LLM writes the reasoning.
import { z } from 'npm:zod@4';

import type { BusinessType } from './config.ts';
import { inr } from './fmt.ts';
import { generateJSON, logStep, type RunContext } from './llm/index.ts';

export type Valuation = { annual_revenue: number | null; low: number | null; high: number | null; reasoning: string; flags: string[] };

const round = (n: number) => Math.round(n / 50_000) * 50_000;

export function computeRange(type: BusinessType, attrs: Record<string, unknown>) {
  const base = Number(attrs[type.revenue.field] ?? 0);
  if (!base) return null;
  const annual = Math.round(base * type.revenue.annual_factor);
  let lo = type.valuation.multiple_low;
  let hi = type.valuation.multiple_high;
  const adj: string[] = [];
  const lease = attrs.lease_remaining_years;
  if (lease !== undefined && lease !== null && Number(lease) < 2) {
    lo *= 0.8;
    hi *= 0.8;
    adj.push('short lease (<2 yrs) −20%');
  }
  const years = Number(attrs.years_running ?? 0);
  if (years >= 15 && ['doctor', 'ca', 'cs'].includes(type.key)) {
    hi *= 1.1;
    adj.push('long-established practice +10% on the high end');
  }
  return { annual, lo, hi, low: round(annual * lo), high: round(annual * hi), adj };
}

const Out = z.object({ reasoning: z.string().min(10).max(600) });
const OutSchema = {
  type: 'object',
  properties: { reasoning: { type: 'string', description: '2 short sentences, plain English, no new numbers' } },
  required: ['reasoning'],
};

export async function valuate(
  ctx: RunContext,
  type: BusinessType,
  attrs: Record<string, unknown>,
  askingPrice?: number | null,
): Promise<Valuation> {
  const r = computeRange(type, attrs);
  if (!r) return { annual_revenue: null, low: null, high: null, reasoning: 'Not enough revenue data for an indicative valuation.', flags: ['no_revenue'] };

  const flags: string[] = [];
  if (askingPrice && askingPrice > r.high * 1.3) flags.push('asking_above_range');
  if (askingPrice && askingPrice < r.low * 0.6) flags.push('asking_below_range');

  const facts = {
    business_type: type.label,
    annual_revenue: inr(r.annual),
    multiple: `${r.lo.toFixed(2)}–${r.hi.toFixed(2)}x ${type.valuation.basis}`,
    range: `${inr(r.low)} – ${inr(r.high)}`,
    adjustments: r.adj,
    notes: type.valuation.notes,
    asking_price: askingPrice ? inr(askingPrice) : null,
    flags,
    attributes: attrs,
  };
  const fallback = `Indicative ${inr(r.low)}–${inr(r.high)}, i.e. ${r.lo.toFixed(1)}–${r.hi.toFixed(1)}× ${type.valuation.basis} of ${inr(r.annual)}${r.adj.length ? ` (${r.adj.join('; ')})` : ''}.${flags.includes('asking_above_range') ? ' The asking price is above this range.' : ''}`;

  try {
    const out = await generateJSON(ctx, {
      system:
        'You are the valuation agent for an Indian SME business marketplace (Gurgaon). Explain an indicative valuation range to a non-expert in 2 short sentences. Use ONLY the numbers given; do not invent new figures. Mention the multiple and the main driver; only if flags contains asking_above_range/asking_below_range, mention it neutrally; never mention missing asking price or flags otherwise. Address the seller as "your business". Use ₹ with lakh/crore.',
      input: JSON.stringify(facts),
      schema: OutSchema,
      schemaName: 'valuation_reasoning',
      zod: Out,
      maxTokens: 300,
    });
    return { annual_revenue: r.annual, low: r.low, high: r.high, reasoning: out.reasoning, flags };
  } catch {
    await logStep(ctx, facts, { reasoning: fallback }, 'valuation-fallback');
    return { annual_revenue: r.annual, low: r.low, high: r.high, reasoning: fallback, flags };
  }
}
