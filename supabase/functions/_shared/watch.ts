// watch-agent core: turns new matches into inbox notifications and keeps saved searches up to date
// for users who shared contact details.
import { admin } from './db.ts';
import { inr } from './fmt.ts';
import { logStep } from './llm/index.ts';

type MatchRow = {
  id: string;
  score: number;
  listing: { id: string; title: string; seller_id: string | null; asking_price: number | null; valuation_high: number | null };
  requirement: { id: string; title: string; buyer_id: string | null };
};

export async function notifyMatches(matchIds: string[]) {
  if (!matchIds.length) return { notified: 0 };
  const db = admin();
  const { data } = await db
    .from('matches')
    .select('id, score, listing:listings(id,title,seller_id,asking_price,valuation_high), requirement:buyer_requirements(id,title,buyer_id)')
    .in('id', matchIds)
    .is('notified_at', null);
  const rows = (data ?? []) as unknown as MatchRow[];

  const buyerIds = [...new Set(rows.map((r) => r.requirement.buyer_id).filter(Boolean))] as string[];
  const { data: contacts } = buyerIds.length
    ? await db.from('contacts').select('user_id, phone, email, watch_enabled').in('user_id', buyerIds)
    : { data: [] };
  const watching = new Map((contacts ?? []).map((c) => [c.user_id, c]));

  const notes: Record<string, unknown>[] = [];
  for (const m of rows) {
    const buyer = m.requirement.buyer_id;
    const seller = m.listing.seller_id;
    if (buyer) {
      const c = watching.get(buyer);
      notes.push({
        user_id: buyer,
        kind: 'match',
        title: `New match · ${m.score}% fit`,
        body: `${m.listing.title}${m.listing.asking_price ? ` · asking ${inr(m.listing.asking_price)}` : ''}`,
        payload: {
          match_id: m.id,
          listing_id: m.listing.id,
          requirement_id: m.requirement.id,
          // Delivery beyond in-app (SMS/email) is queued here for a future sender; MVP delivers in-app.
          channels: c?.watch_enabled ? ['inapp', ...(c.email ? ['email'] : []), ...(c.phone ? ['sms'] : [])] : ['inapp'],
        },
      });
    }
    if (seller && seller !== buyer) {
      notes.push({
        user_id: seller,
        kind: 'buyer_match',
        title: `A buyer matches your listing · ${m.score}%`,
        body: `Looking for: ${m.requirement.title}`,
        payload: { match_id: m.id, listing_id: m.listing.id },
      });
    }
  }
  if (notes.length) await db.from('notifications').insert(notes);
  if (rows.length) await db.from('matches').update({ notified_at: new Date().toISOString() }).in('id', rows.map((r) => r.id));
  for (const b of buyerIds) {
    if (watching.get(b)?.watch_enabled) {
      await db.from('saved_searches').update({ last_notified_at: new Date().toISOString() }).eq('user_id', b);
    }
  }
  await logStep({ agent: 'watch-agent' }, { matchIds }, { notifications: notes.length }, 'notify');
  return { notified: notes.length };
}

/** Called when a user shares contact details: make sure each of their requirements is watched. */
export async function registerWatch(userId: string) {
  const db = admin();
  const { data: reqs } = await db.from('buyer_requirements').select('id, business_type, criteria, budget_max, locality_ids').eq('buyer_id', userId);
  const rows = (reqs ?? []).map((r) => ({
    user_id: userId,
    source: 'requirement',
    requirement_id: r.id,
    criteria: { business_type: r.business_type, ...r.criteria, budget_max: r.budget_max, locality_ids: r.locality_ids },
    last_checked_at: new Date().toISOString(),
  }));
  if (rows.length) await db.from('saved_searches').upsert(rows, { onConflict: 'user_id,requirement_id' });
  await db.from('buyer_requirements').update({ watch: true }).eq('buyer_id', userId);
  await logStep({ agent: 'watch-agent', userId }, { action: 'register' }, { saved_searches: rows.length }, 'register');
  return { saved_searches: rows.length };
}

/** Cron sweep: catch any matches that were never notified (e.g. created while a call failed). */
export async function sweep() {
  const db = admin();
  const { data } = await db.from('matches').select('id').is('notified_at', null).gte('score', 50).limit(200);
  const res = await notifyMatches((data ?? []).map((m) => m.id));
  await db.from('saved_searches').update({ last_checked_at: new Date().toISOString() }).not('id', 'is', null);
  return res;
}
