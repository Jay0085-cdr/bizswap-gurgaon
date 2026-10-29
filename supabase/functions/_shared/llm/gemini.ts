// Google Gemini via the Interactions API (free tier). Structured output via response_format JSON schema.
import { LlmError, type LlmProvider, type LlmRequest, type LlmResult } from './types.ts';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

export function gemini(apiKey: string, model = 'gemini-3.5-flash-lite'): LlmProvider {
  return {
    name: 'gemini',
    model,
    async complete(req: LlmRequest): Promise<LlmResult> {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({
          model,
          store: false,
          system_instruction: req.system,
          generation_config: { thinking_level: 'minimal', max_output_tokens: req.maxTokens ?? 1500 },
          input: req.input,
          response_format: { type: 'text', mime_type: 'application/json', schema: req.schema },
        }),
      }).catch((e) => {
        throw new LlmError(`gemini fetch failed: ${e}`, e?.name === 'TimeoutError' ? 'timeout' : 'http');
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = body?.error?.message ?? res.statusText;
        // 429s carry google.rpc.RetryInfo { retryDelay: "12s" }; honour it when retrying
        const delay = (body?.error?.details ?? []).find((d: { retryDelay?: string }) => d.retryDelay)?.retryDelay;
        const retryAfterMs = delay ? parseFloat(delay) * 1000 : Number(res.headers.get('retry-after')) * 1000 || undefined;
        throw new LlmError(`gemini ${res.status}: ${msg}`, res.status === 429 ? 'quota' : 'http', res.status, retryAfterMs);
      }
      const out = (body.steps ?? []).find((s: { type: string }) => s.type === 'model_output');
      const text = (out?.content ?? []).map((c: { text?: string }) => c.text ?? '').join('');
      if (!text) throw new LlmError('gemini returned no output', 'bad_output');
      return {
        text,
        provider: 'gemini',
        model: body.model ?? model,
        tokensIn: body.usage?.total_input_tokens,
        tokensOut: body.usage?.total_output_tokens,
      };
    },
  };
}
