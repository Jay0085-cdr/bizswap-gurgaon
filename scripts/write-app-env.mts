// Fetches the project's public (anon/publishable) key and writes it where the app needs it:
// .env (local dev, gitignored) and eas.json build env (the anon key is public by design; RLS protects data).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadEnv, root } from './env.mts';

const env = loadEnv();
const raw = execFileSync('npx', ['supabase', 'projects', 'api-keys', '--project-ref', env.SUPABASE_REF, '-o', 'json'], { cwd: root, encoding: 'utf8' });
const keys: { name: string; api_key: string; type?: string }[] = JSON.parse(raw.slice(raw.indexOf('[')));
const anon =
  keys.find((k) => k.name === 'anon')?.api_key ??
  keys.find((k) => k.type === 'publishable' || k.api_key?.startsWith('sb_publishable_'))?.api_key;
const service = keys.find((k) => k.name === 'service_role')?.api_key ?? keys.find((k) => k.type === 'secret')?.api_key;
if (!anon) throw new Error('could not find anon/publishable key');

const url = `https://${env.SUPABASE_REF}.supabase.co`;
writeFileSync(join(root, '.env'), `EXPO_PUBLIC_SUPABASE_URL=${url}\nEXPO_PUBLIC_SUPABASE_ANON_KEY=${anon}\n`);

// service key is only stored locally (gitignored) for scripts/smoke tests
const local = readFileSync(join(root, '.env.local'), 'utf8');
if (service && !/^SUPABASE_SERVICE_ROLE_KEY=/m.test(local)) {
  writeFileSync(join(root, '.env.local'), `${local.trimEnd()}\nSUPABASE_SERVICE_ROLE_KEY=${service}\n`);
}

const easPath = join(root, 'eas.json');
const eas = JSON.parse(readFileSync(easPath, 'utf8'));
eas.build.base.env = { ...eas.build.base.env, EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_ANON_KEY: anon };
writeFileSync(easPath, JSON.stringify(eas, null, 2) + '\n');
console.log(`  ✔ wrote .env and eas.json (url=${url})`);
