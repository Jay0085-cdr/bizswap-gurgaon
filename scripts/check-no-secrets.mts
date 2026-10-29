// Fails if any server-side secret from .env.local appears in the given build directory.
// Run: node scripts/check-no-secrets.mts <dir>
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { loadEnv } from './env.mts';

const env = loadEnv();

const SECRETS = ['SUPABASE_DB_PASSWORD', 'GEMINI_API_KEY', 'SUPABASE_ACCESS_TOKEN', 'ADMIN_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'EXPO_TOKEN'];
const values = SECRETS.map((k) => [k, env[k]?.trim()] as const).filter(([, v]) => v && v.length >= 8);

function* files(dir: string): Generator<string> {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* files(p);
    else yield p;
  }
}

const dir = process.argv[2];
let leaks = 0;
for (const f of files(dir)) {
  const s = readFileSync(f, 'latin1');
  for (const [k, v] of values)
    if (s.includes(v!)) {
      console.error(`✖ ${k} found in ${f}`);
      leaks++;
    }
}
if (leaks) process.exit(1);
console.log(`✔ no secrets in ${dir} (checked ${values.length} values)`);
