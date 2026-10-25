// Anthropic Claude via the Messages API. Structured output by forcing a single tool call.
import { LlmError, type LlmProvider, type LlmRequest, type LlmResult } from './types.ts';

export function anthropic(apiKey: string, model = 'claude-haiku-5-5'): LlmProvider {
  return {
    name: 'anthropic',
    model,
    async complete(req: LlmRequest): Promise<LlmResult> {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          model,
          max_tokens: req.maxTokens ?? 1500,
          system: req.system,
          messages: [{ role: 'user', content: req.input }],
          tools: [{ name: req.schemaName, description: 'Return the structured result.', input_schema: req.schema }],
          tool_choice: { type: 'tool', name: req.schemaName },
        }),
      }).catch((e) => {
        throw new LlmError(`anthropic fetch failed: ${e}`, e?.name === 'TimeoutError' ? 'timeout' : 'http');
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new LlmError(`anthropic ${res.status}: ${body?.error?.message ?? res.statusText}`, res.status === 429 ? 'quota' : 'http', res.status);
      }
      const tool = (body.content ?? []).find((c: { type: string }) => c.type === 'tool_use');
      if (!tool) throw new LlmError('anthropic returned no tool_use', 'bad_output');
      return {
        text: JSON.stringify(tool.input),
        provider: 'anthropic',
        model: body.model ?? model,
        tokensIn: body.usage?.input_tokens,
        tokensOut: body.usage?.output_tokens,
      };
    },
  };
}
