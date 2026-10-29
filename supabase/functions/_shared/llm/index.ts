// Provider-agnostic structured generation with zod validation, a result cache, retry with backoff on transient
// errors (429/5xx/timeouts), one repair retry, optional fallback provider, and a trace row in agent_runs for every
// call. When everything fails the request is marked degraded so the response says ai_mode: 'quick'.
//
// Env: LLM_PROVIDER=gemini|anthropic|groq (default gemini), LLM_MODEL, LLM_FALLBACK_PROVIDER,
//      GEMINI_API_KEY, ANTHROPIC_API_KEY, GROQ_API_KEY
import type { z } from 'npm:zod@4';

import { admin } from '../db.ts';
import { markDegraded } from '../request-state.ts';
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

const DEADLINE_MS = 30_000; // whole generateJSON budget incl. retries; agents fall back after this
const CACHE_TTL_DAYS = 7;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Fast failures (rate limit, 5xx, network) are retried. Timeouts are not: the user has already waited the full
// timeout, so falling back to quick mode beats doubling the wait.
const transient = (e: unknown) => (e instanceof LlmError ? e.kind === 'quota' || (e.kind === 'http' && (!e.status || e.status >= 500)) : true);

async function cacheKey(opts: { system: string; input: string; schema: JsonSchema; schemaName: string }) {
  const raw = `${opts.schemaName}\n${opts.system}\n${opts.input}\n${JSON.stringify(opts.schema)}`;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function generateJSON<T>(
  ctx: RunContext,
  opts: { system: string; input: string; schema: JsonSchema; schemaName: string; zod: z.ZodType<T>; maxTokens?: number },
): Promise<T> {
  const t0 = Date.now();
  const key = await cacheKey(opts);

  // 1. cache: identical prompt + input seen recently (e.g. testers pasting the same example sentence)
  const { data: hit } = await admin().from('llm_cache').select('output, model').eq('key', key).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (hit) {
    const v = opts.zod.safeParse(hit.output);
    if (v.success) {
      await logRun(ctx, { provider: 'cache', model: hit.model ?? undefined, input: opts.input, output: v.data, ok: true, latency: Date.now() - t0 });
      return v.data;
    }
  }

  const chain = providers();
  if (!chain.length) {
    await logRun(ctx, { ok: false, error: 'no LLM provider configured', input: opts.input });
    markDegraded();
    throw new LlmError('no LLM provider configured', 'config');
  }

  let lastErr: unknown;
  for (const p of chain) {
    let input = opts.input;
    let repairs = 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      const ta = Date.now();
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
          await logRun(ctx, { provider: r.provider, model: r.model, input: opts.input, output: parsed, ok: false, error: `zod: ${v.error.message}`, latency: Date.now() - ta, tokensIn: r.tokensIn, tokensOut: r.tokensOut });
          lastErr = new LlmError('validation failed', 'bad_output');
          if (repairs++ >= 1) break;
          // repair retry: tell the model what was wrong
          input = `${opts.input}\n\nYour previous answer failed validation: ${v.error.message.slice(0, 500)}. Return corrected JSON only.`;
          continue;
        }
        await logRun(ctx, { provider: r.provider, model: r.model, input: opts.input, output: v.data, ok: true, latency: Date.now() - ta, tokensIn: r.tokensIn, tokensOut: r.tokensOut });
        await admin()
          .from('llm_cache')
          .upsert({ key, schema_name: opts.schemaName, output: v.data, provider: r.provider, model: r.model, expires_at: new Date(Date.now() + CACHE_TTL_DAYS * 86400_000).toISOString() })
          .then(() => {}, () => {});
        return v.data;
      } catch (e) {
        lastErr = e;
        await logRun(ctx, { provider: p.name, model: p.model, input: opts.input, ok: false, error: String((e as Error)?.message ?? e), latency: Date.now() - ta });
        if (e instanceof LlmError && e.kind === 'bad_output' && repairs++ < 1) continue;
        if (!transient(e)) break; // config / 4xx → next provider
        // exponential backoff with jitter, honouring the provider's retry delay, within the deadline
        const backoff = Math.max(600 * 2 ** attempt + Math.random() * 400, (e as LlmError).retryAfterMs ?? 0);
        if (Date.now() - t0 + backoff + 3_000 > DEADLINE_MS) break;
        await sleep(backoff);
      }
    }
  }
  markDegraded();
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
