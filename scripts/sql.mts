// Tiny SQL runner for scripts: `node scripts/sql.mts "select 1"` (reads .env.local).
// Uses the IPv4 session pooler (the direct db.<ref> host is IPv6-only on the free tier).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

import { loadEnv, root } from './env.mts';

const env = loadEnv();
const poolerFile = join(root, 'supabase/.temp/pooler-url');
const pooler = existsSync(poolerFile) ? new URL(readFileSync(poolerFile, 'utf8').trim()) : null;

export const sql = postgres({
  host: pooler?.hostname ?? `db.${env.SUPABASE_REF}.supabase.co`,
  port: Number(pooler?.port || 5432),
  database: 'postgres',
  username: pooler ? `postgres.${env.SUPABASE_REF}` : 'postgres',
  password: env.SUPABASE_DB_PASSWORD,
  ssl: 'require',
  max: 2,
  onnotice: () => {},
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = await sql.unsafe(process.argv.slice(2).join(' '));
  console.table(rows);
  await sql.end();
}
