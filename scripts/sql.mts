// Tiny SQL runner for scripts/agents: `node scripts/sql.mts "select 1"` (reads .env.local)
import postgres from 'postgres';
import { loadEnv } from './env.mts';

const env = loadEnv();
export const sql = postgres({
  host: `db.${env.SUPABASE_REF}.supabase.co`,
  port: 5432,
  database: 'postgres',
  username: 'postgres',
  password: env.SUPABASE_DB_PASSWORD,
  ssl: 'require',
  max: 2,
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const q = process.argv.slice(2).join(' ');
  const rows = await sql.unsafe(q);
  console.table(rows);
  await sql.end();
}
