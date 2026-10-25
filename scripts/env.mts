// Loads .env.local (gitignored) and normalises SUPABASE_PROJECT_REF (accepts a ref or a full URL).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadEnv() {
  const file = join(root, '.env.local');
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.trim().match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
    }
  }
  const raw = env.SUPABASE_PROJECT_REF ?? '';
  env.SUPABASE_REF = raw.replace(/^https?:\/\//, '').replace(/\.supabase\.co.*$/, '');
  env.SUPABASE_URL ??= `https://${env.SUPABASE_REF}.supabase.co`;
  return env;
}
