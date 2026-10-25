// watch-agent: registers saved searches for users who shared contact; cron sweep notifies un-notified matches.
import { HttpError, isAdmin, json, requireUser, serve } from '../_shared/http.ts';
import { notifyMatches, registerWatch, sweep } from '../_shared/watch.ts';

serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  if (body.action === 'sweep' || body.action === 'notify') {
    if (!isAdmin(req)) throw new HttpError(403, 'admin only');
    return json(body.action === 'sweep' ? await sweep() : await notifyMatches(body.match_ids ?? []));
  }
  const userId = await requireUser(req);
  return json({ ok: true, ...(await registerWatch(userId)) });
});
