// feedback-agent: admin-only. Groups tester feedback into ranked themes and stores a report (drives V1.1).
import { summarizeFeedback } from '../_shared/feedback.ts';
import { HttpError, isAdmin, json, serve } from '../_shared/http.ts';

serve(async (req) => {
  if (!isAdmin(req)) throw new HttpError(403, 'admin only');
  const body = await req.json().catch(() => ({}));
  return json(await summarizeFeedback({ since: body.since, days: body.days }));
});
