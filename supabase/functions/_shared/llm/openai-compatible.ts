// OpenAI-compatible chat completions (Groq free tier by default; also works for OpenRouter etc.).
import { LlmError, type LlmProvider, type LlmRequest, type LlmResult } from './types.ts';

export function openaiCompatible(
  name: string,
  baseUrl: string,
  apiKey: string,
  model: string,
): LlmProvider {
  return {
    name,
    model,
    async complete(req: LlmRequest): Promise<LlmResult> {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(25_000),
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: req.maxTokens ?? 1500,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `${req.system}\n\nRespond with ONLY a JSON object matching this JSON Schema:\n${JSON.stringify(req.schema)}`,
            },
            { role: 'user', content: req.input },
          ],
        }),
      }).catch((e) => {
        throw new LlmError(`${name} fetch failed: ${e}`, e?.name === 'TimeoutError' ? 'timeout' : 'http');
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new LlmError(`${name} ${res.status}: ${body?.error?.message ?? res.statusText}`, res.status === 429 ? 'quota' : 'http', res.status);
      }
      const text = body.choices?.[0]?.message?.content;
      if (!text) throw new LlmError(`${name} returned no content`, 'bad_output');
      return { text, provider: name, model: body.model ?? model, tokensIn: body.usage?.prompt_tokens, tokensOut: body.usage?.completion_tokens };
    },
  };
}
