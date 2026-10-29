// Thin client for the Supabase Edge Function agents. No LLM keys ever live in the app.
import { ensureSession, supabase } from '@/lib/supabase';
import { track } from '@/lib/track';
import type { ConfirmResponse, IntakeResponse } from '@/lib/types';

async function call<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const session = await ensureSession();
  if (!session) throw new Error('You seem to be offline — check your internet and try again.');
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let status = 0;
    let detail = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        status = ctx.status;
        detail = (await ctx.json())?.error ?? detail;
      }
    } catch {}
    track('agent_error', { fn, status, detail: String(detail).slice(0, 300) });
    throw new Error(
      !status
        ? 'Couldn’t reach our servers — check your internet and try again.'
        : status >= 500
          ? 'Our AI had a hiccup. Please try again in a moment.'
          : 'Something went wrong — please try again.',
    );
  }
  return data as T;
}

export type SttMeta = { confidence?: number; alternatives?: string[]; raw?: string };

export const agents = {
  intake: (p: {
    role: 'seller' | 'buyer';
    text: string;
    conversation_id?: string | null;
    input_mode: 'voice' | 'text';
    stt?: SttMeta;
  }) => call<IntakeResponse>('intake-agent', { action: 'message', ...p }),

  confirm: (conversation_id: string) => call<ConfirmResponse>('intake-agent', { action: 'confirm', conversation_id }),

  watch: () => call<{ ok: boolean }>('watch-agent', { action: 'register' }),
};
