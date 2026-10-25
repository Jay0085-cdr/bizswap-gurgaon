// Provider-agnostic structured generation with zod validation, one repair retry,
// optional fallback provider, and a full trace row in agent_runs for every call.
//
// Env: LLM_PROVIDER=gemini|anthropic|groq (default gemini), LLM_MODEL, LLM_FALLBACK_PROVIDER,
//      GEMINI_API_KEY, ANTHROPIC_API_KEY, GROQ_API_KEY
import type { z } from 'npm:zod@4';

import { admin } from '../db.ts';
import { anthropic } from './anthropic.ts';
import { gemini } from './gemini.ts';
import { openaiCompatible } from './openai-compatible.ts';
import { LlmError, type JsonSchema, type LlmProvider } from './types.ts';

export { LlmError };

function make(name: string, model?: string): LlmProvider | null {
  const env = (k: string) => Deno.env.get(k) ?? '';
  switch (name) {
    case 'gemini':
      return env('GEMINI_API_KEY') ? gemini(env('GEMINI_API_KEY'), model || undefined) : null;
    case 'anthropic':
    case 'claude':
      return env('ANTHROPIC_API_KEY') ? anthropic(env('ANTHROPIC_API_KEY'), model || undefined) : null;
    case 'groq':
      return env('GROQ_API_KEY')
        ? openaiCompatible('groq', 'https://api.groq.com/openai/v1', env('GROQ_API_KEY'), model || 'llama-3.3-70b-versatile')
        : null;
    default:
      return null;
  }
}

function providers(): LlmProvider[] {
  const primary = make(Deno.env.get('LLM_PROVIDER') ?? 'gemini', Deno.env.get('LLM_MODEL'));
  const fbName = Deno.env.get('LLM_FALLBACK_PROVIDER');
  const fallback = fbName ? make(fbName, Deno.env.get('LLM_FALLBACK_MODEL')) : null;
  return [primary, fallback].filter((p): p is LlmProvider => !!p);
}

export type RunContext = { agent: string; conversationId?: string | null; entityId?: string | null; userId?: string | null };

function parseJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
  return JSON.parse(cleaned);
}

export async function generateJSON<T>(
  ctx: RunContext,
  opts: { system: string; input: string; schema: JsonSchema; schemaName: string; zod: z.ZodType<T>; maxTokens?: number },
): Promise<T> {
  const chain = providers();
  if (!chain.length) {
    await logRun(ctx, { ok: false, error: 'no LLM provider configured', input: opts.input });
    throw new LlmError('no LLM provider configured', 'config');
  }

  let lastErr: unknown;
  for (const p of chain) {
    let input = opts.input;
    for (let attempt = 0; attempt < 2; attempt++) {
      const t0 = Date.now();
      try {
        const r = await p.complete({ ...opts, input });
        let parsed: unknown;
        try {
          parsed = parseJson(r.text);
        } catch {
          throw new LlmError(`invalid JSON: ${r.text.slice(0, 200)}`, 'bad_output');
        }
        const v = opts.zod.safeParse(parsed);
        if (!v.success) {
          await logRun(ctx, { provider: r.provider, model: r.model, input: opts.input, output: parsed, ok: false, error: `zod: ${v.error.message}`, latency: Date.now() - t0, tokensIn: r.tokensIn, tokensOut: r.tokensOut });
          // repair retry: tell the model what was wrong
          input = `${opts.input}\n\nYour previous answer failed validation: ${v.error.message.slice(0, 500)}. Return corrected JSON only.`;
          lastErr = new LlmError('validation failed', 'bad_output');
          continue;
        }
        await logRun(ctx, { provider: r.provider, model: r.model, input: opts.input, output: v.data, ok: true, latency: Date.now() - t0, tokensIn: r.tokensIn, tokensOut: r.tokensOut });
        return v.data;
      } catch (e) {
        lastErr = e;
        await logRun(ctx, { provider: p.name, model: p.model, input: opts.input, ok: false, error: String((e as Error)?.message ?? e), latency: Date.now() - t0 });
        if (e instanceof LlmError && e.kind === 'bad_output' && attempt === 0) continue;
        break; // quota/timeout/http → next provider
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new LlmError(String(lastErr), 'http');
}

async function logRun(
  ctx: RunContext,
  r: { provider?: string; model?: string; input?: unknown; output?: unknown; ok: boolean; error?: string; latency?: number; tokensIn?: number; tokensOut?: number },
) {
  await admin()
    .from('agent_runs')
    .insert({
      agent: ctx.agent,
      conversation_id: ctx.conversationId ?? null,
      entity_id: ctx.entityId ?? null,
      user_id: ctx.userId ?? null,
      provider: r.provider ?? null,
      model: r.model ?? null,
      input: typeof r.input === 'string' ? { prompt: r.input } : (r.input ?? null),
      output: r.output ?? null,
      ok: r.ok,
      error: r.error ?? null,
      latency_ms: r.latency ?? null,
      tokens_in: r.tokensIn ?? null,
      tokens_out: r.tokensOut ?? null,
    })
    .then(() => {}, () => {});
}

/** Log a non-LLM agent step (deterministic fallback, decisions) so the trace is complete. */
export function logStep(ctx: RunContext, input: unknown, output: unknown, note?: string) {
  return logRun(ctx, { provider: 'deterministic', model: note ?? 'rules', input, output, ok: true });
}
