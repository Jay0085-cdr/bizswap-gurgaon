import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

let _admin: SupabaseClient | null = null;

/** Service-role client (bypasses RLS). Only ever used server-side inside Edge Functions. */
export function admin(): SupabaseClient {
  _admin ??= createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}
