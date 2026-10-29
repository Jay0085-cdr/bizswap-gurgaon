// Runs the feedback-agent and prints the ranked V1.1 report; also saves it to reports/feedback-<date>.md (gitignored).
// Run: npm run feedback                 last 30 days
//      npm run feedback -- --days 7     last 7 days
//      npm run feedback -- --raw        also list every raw item
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadEnv, root } from './env.mts';

const env = loadEnv();
const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const days = Number(arg('--days') ?? 30);

const res = await fetch(`${env.SUPABASE_URL}/functions/v1/feedback-agent`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-admin-secret': env.ADMIN_SECRET },
  body: JSON.stringify({ days }),
});
if (!res.ok) {
  console.error(`feedback-agent failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const { report } = (await res.json()) as {
  report: {
    feedback_count: number;
    summary: string;
    top_actions: string[];
    provider: string | null;
    stats: { testers: number; by_screen: Record<string, number>; by_version: Record<string, number>; by_platform: Record<string, number>; voice_share: number };
    themes: { title: string; category: string; severity: number; count: number; testers: number; screens: string[]; score: number; summary: string; suggested_fix: string; examples: string[] }[];
  };
};

const SEV = ['', 'idea', 'minor', 'major', 'BLOCKER'];
const fmt = (o: Record<string, number>) =>
  Object.entries(o)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(' · ');
const date = new Date().toISOString().slice(0, 10);
const md = [
  `# Tester feedback report — ${date} (last ${days} days)`,
  '',
  `**${report.feedback_count} items from ${report.stats.testers} testers** · ${report.provider ? 'AI-grouped' : 'keyword-grouped (AI unavailable)'} · voice ${report.stats.voice_share}%`,
  report.feedback_count ? `By screen: ${fmt(report.stats.by_screen)}  \nBy version: ${fmt(report.stats.by_version)}  \nBy platform: ${fmt(report.stats.by_platform)}` : '',
  '',
  '## Summary',
  report.summary,
  ...(report.top_actions.length ? ['', '## Top actions for V1.1', ...report.top_actions.map((a, i) => `${i + 1}. ${a}`)] : []),
  '',
  '## Themes (ranked by frequency × severity)',
  ...report.themes.flatMap((t, i) => [
    '',
    `### ${i + 1}. ${t.title} — ${t.count} item(s), ${t.testers} tester(s) · ${SEV[t.severity]} · ${t.category} · score ${t.score}`,
    `Screens: ${t.screens.join(', ')}`,
    '',
    t.summary,
    ...(t.suggested_fix ? ['', `**Fix:** ${t.suggested_fix}`] : []),
    '',
    ...t.examples.map((e) => `> ${e}`),
  ]),
].join('\n');

console.log(md);
mkdirSync(join(root, 'reports'), { recursive: true });
const file = join(root, 'reports', `feedback-${date}.md`);
writeFileSync(file, md + '\n');
console.log(`\nSaved → reports/feedback-${date}.md`);

if (process.argv.includes('--raw')) {
  const { sql } = await import('./sql.mts');
  const rows = await sql`select created_at, screen, app_version, platform, input_mode, message from feedback
    where created_at > now() - make_interval(days => ${days}) order by created_at desc`;
  console.log('\n## Raw feedback');
  for (const r of rows) console.log(`- ${r.created_at.toISOString().slice(0, 16)} [${r.screen} · v${r.app_version} · ${r.platform}/${r.input_mode}] ${r.message}`);
  await sql.end();
}
