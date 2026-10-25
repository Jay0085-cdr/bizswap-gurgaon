// Thin client for the Supabase Edge Function agents. No LLM keys ever live in the app.
import { ensureSession, supabase } from '@/lib/supabase';
import type { ConfirmResponse, IntakeResponse } from '@/lib/types';

async function call<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  await ensureSession();
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let detail = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) detail = (await ctx.json())?.error ?? detail;
    } catch {}
    throw new Error(detail);
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
