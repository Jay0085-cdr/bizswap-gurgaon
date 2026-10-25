// matchmaker-agent: scores listing↔requirement fit (rules pre-score + LLM refinement), writes matches.
import { admin } from '../_shared/db.ts';
import { HttpError, isAdmin, json, requireUser, serve } from '../_shared/http.ts';
import { runMatchmaker } from '../_shared/match.ts';

serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  const db = admin();

  if (body.action === 'rebuild_all') {
    if (!isAdmin(req)) throw new HttpError(403, 'admin only');
    const { data: reqs } = await db.from('buyer_requirements').select('id').neq('stage', 'closed');
    const results = [];
    for (const r of reqs ?? []) results.push({ requirement_id: r.id, ...(await runMatchmaker({ requirementId: r.id }).catch((e) => ({ error: String(e) }))) });
    return json({ results });
  }

  if (!isAdmin(req)) {
    const userId = await requireUser(req);
    const table = body.listing_id ? 'listings' : 'buyer_requirements';
    const owner = body.listing_id ? 'seller_id' : 'buyer_id';
    const { data } = await db.from(table).select(owner).eq('id', body.listing_id ?? body.requirement_id).maybeSingle();
    if (!data || (data as Record<string, string>)[owner] !== userId) throw new HttpError(404, 'not found');
  }
  return json(await runMatchmaker({ listingId: body.listing_id, requirementId: body.requirement_id }));
});
