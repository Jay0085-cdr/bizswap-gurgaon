// feedback-agent core: groups tester feedback into themes, ranks them by frequency × severity,
// and stores a report in feedback_reports. The LLM only clusters and labels; counts and ranking are code.
import { z } from 'npm:zod@4';

import { admin } from './db.ts';
import { generateJSON, logStep, type RunContext } from './llm/index.ts';

type Row = { id: string; user_id: string; screen: string; app_version: string; platform: string; message: string; input_mode: string; created_at: string };

const CATEGORIES = ['bug', 'ux', 'performance', 'feature', 'content', 'praise'] as const;
const SEVERITY_WEIGHT: Record<number, number> = { 4: 8, 3: 4, 2: 2, 1: 1 }; // 4 blocker · 3 major · 2 minor · 1 idea/nice-to-have
const MAX_ITEMS = 400;

const Theme = z.object({
  title: z.string().min(3).max(80),
  category: z.enum(CATEGORIES),
  severity: z.number().int().min(1).max(4),
  feedback_ids: z.array(z.number().int()).min(1),
  summary: z.string().min(5).max(400),
  suggested_fix: z.string().max(300),
});
const Out = z.object({ themes: z.array(Theme).max(15), overall_summary: z.string().min(10).max(1200), top_actions: z.array(z.string().max(200)).max(5) });

const OutSchema = {
  type: 'object',
  properties: {
    themes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'short theme name, e.g. "Map pins hard to tap"' },
          category: { type: 'string', enum: [...CATEGORIES] },
          severity: { type: 'integer', description: '4 = blocks core use/crash, 3 = major friction, 2 = minor, 1 = idea/nice-to-have/praise' },
          feedback_ids: { type: 'array', items: { type: 'integer' }, description: 'ids (#n) of every item in this theme' },
          summary: { type: 'string', description: 'what testers are saying, 1-2 sentences' },
          suggested_fix: { type: 'string', description: 'concrete change for V1.1, or "" for praise' },
        },
        required: ['title', 'category', 'severity', 'feedback_ids', 'summary', 'suggested_fix'],
      },
    },
    overall_summary: { type: 'string', description: '3-5 sentences for the product owner' },
    top_actions: { type: 'array', items: { type: 'string' }, description: 'up to 5 prioritised V1.1 actions' },
  },
  required: ['themes', 'overall_summary', 'top_actions'],
};

const SYSTEM = `You triage closed-test feedback for "BizSwap Gurgaon", an Android app where people sell/buy running businesses (pubs, restaurants, clinics, CA/CS practices) by chatting with an AI (voice or text), browse a map, and track deals on dashboards. Testers are students.
Group the numbered feedback items into themes (merge near-duplicates; one item may belong to one theme only; every item must be assigned). Use the item's screen as context. Items can be Hinglish.
Severity: 4 crash/blocker, 3 major friction, 2 minor, 1 idea or praise. Be concrete and concise. Return JSON only.`;

// Keyword fallback used when the LLM is unavailable (quota etc.).
const RULES: { title: string; category: (typeof CATEGORIES)[number]; severity: number; re: RegExp }[] = [
  { title: 'Crashes or errors', category: 'bug', severity: 4, re: /crash|error|band ho|closed|stuck|freez|not (work|open|load)|nahi chal|blank/i },
  { title: 'Slow or loading too long', category: 'performance', severity: 3, re: /slow|load|late|wait|time|lag|busy/i },
  { title: 'Voice input issues', category: 'bug', severity: 3, re: /voice|mic|speak|bol|sun/i },
  { title: 'Map issues', category: 'ux', severity: 2, re: /map|pin|zoom|location/i },
  { title: 'Confusing flow or wording', category: 'ux', severity: 2, re: /confus|understand|samajh|unclear|how to|where/i },
  { title: 'Feature requests', category: 'feature', severity: 1, re: /add|want|wish|feature|option|should|could/i },
  { title: 'Positive feedback', category: 'praise', severity: 1, re: /good|great|nice|love|awesome|accha|badhiya|easy/i },
];

function fallbackThemes(rows: Row[]) {
  const buckets = new Map<string, { rule: (typeof RULES)[number]; ids: number[] }>();
  rows.forEach((r, i) => {
    const rule = RULES.find((x) => x.re.test(r.message)) ?? { title: `Other feedback on ${r.screen}`, category: 'ux' as const, severity: 2, re: /./ };
    const b = buckets.get(rule.title) ?? { rule, ids: [] };
    b.ids.push(i + 1);
    buckets.set(rule.title, b);
  });
  return [...buckets.values()].map((b) => ({
    title: b.rule.title,
    category: b.rule.category,
    severity: b.rule.severity,
    feedback_ids: b.ids,
    summary: `${b.ids.length} item(s) mention this (keyword grouping — AI was unavailable).`,
    suggested_fix: '',
  }));
}

export async function summarizeFeedback(opts: { since?: string; days?: number }) {
  const db = admin();
  const until = new Date();
  const since = opts.since ? new Date(opts.since) : new Date(until.getTime() - (opts.days ?? 30) * 86400_000);
  const { data, error } = await db
    .from('feedback')
    .select('id,user_id,screen,app_version,platform,message,input_mode,created_at')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true })
    .limit(MAX_ITEMS);
  if (error) throw error;
  const rows = (data ?? []) as Row[];

  const countBy = (k: keyof Row) => rows.reduce<Record<string, number>>((a, r) => ((a[String(r[k])] = (a[String(r[k])] ?? 0) + 1), a), {});
  const stats = {
    testers: new Set(rows.map((r) => r.user_id)).size,
    by_screen: countBy('screen'),
    by_version: countBy('app_version'),
    by_platform: countBy('platform'),
    voice_share: rows.length ? Math.round((rows.filter((r) => r.input_mode === 'voice').length / rows.length) * 100) : 0,
  };

  if (!rows.length) {
    const empty = { since, until, feedback_count: 0, themes: [], summary: 'No feedback in this period yet.', top_actions: [], stats, provider: null, model: null };
    return { report: empty, id: null };
  }

  const ctx: RunContext = { agent: 'feedback-agent' };
  const input = rows.map((r, i) => `#${i + 1} [${r.screen} · v${r.app_version} · ${r.platform}] ${r.message.replace(/\s+/g, ' ').slice(0, 500)}`).join('\n');
  let themes: z.infer<typeof Theme>[];
  let summary: string;
  let topActions: string[];
  let provider: string | null = null;
  try {
    const out = await generateJSON(ctx, { system: SYSTEM, input, schema: OutSchema, schemaName: 'feedback_themes', zod: Out, maxTokens: 4000 });
    themes = out.themes;
    summary = out.overall_summary;
    topActions = out.top_actions;
    provider = 'llm';
  } catch {
    themes = fallbackThemes(rows);
    summary = `${rows.length} feedback items from ${stats.testers} testers, grouped by keywords because the AI was unavailable. Re-run later for an AI summary.`;
    topActions = [];
    await logStep(ctx, { count: rows.length }, { themes: themes.length }, 'feedback-fallback');
  }

  // Code owns the numbers: dedupe ids, attach real items, compute count, screens and rank score.
  const seen = new Set<number>();
  const ranked = themes
    .map((t) => {
      const ids = [...new Set(t.feedback_ids)].filter((n) => n >= 1 && n <= rows.length && !seen.has(n));
      ids.forEach((n) => seen.add(n));
      const items = ids.map((n) => rows[n - 1]);
      const count = items.length;
      return {
        ...t,
        count,
        testers: new Set(items.map((r) => r.user_id)).size,
        screens: [...new Set(items.map((r) => r.screen))],
        score: t.category === 'praise' ? 0 : count * SEVERITY_WEIGHT[t.severity],
        examples: items.slice(0, 3).map((r) => r.message.slice(0, 240)),
        feedback_ids: items.map((r) => r.id),
      };
    })
    .filter((t) => t.count > 0)
    .sort((a, b) => b.score - a.score || b.count - a.count);

  const unassigned = rows.filter((_, i) => !seen.has(i + 1));
  if (unassigned.length)
    ranked.push({
      title: 'Unsorted',
      category: 'ux',
      severity: 1,
      summary: 'Items the agent did not place in a theme.',
      suggested_fix: '',
      count: unassigned.length,
      testers: new Set(unassigned.map((r) => r.user_id)).size,
      screens: [...new Set(unassigned.map((r) => r.screen))],
      score: 0,
      examples: unassigned.slice(0, 3).map((r) => r.message.slice(0, 240)),
      feedback_ids: unassigned.map((r) => r.id),
    });

  const report = { since, until, feedback_count: rows.length, themes: ranked, summary, top_actions: topActions, stats, provider, model: null };
  const { data: saved } = await db
    .from('feedback_reports')
    .insert({ ...report, since: since.toISOString(), until: until.toISOString() })
    .select('id')
    .single();
  return { report, id: saved?.id ?? null };
}
