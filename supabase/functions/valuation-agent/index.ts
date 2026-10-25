// valuation-agent: indicative range (config multiples) + short LLM reasoning. Stateless.
import { loadConfig } from '../_shared/config.ts';
import { HttpError, isAdmin, json, requireUser, serve } from '../_shared/http.ts';
import { valuate } from '../_shared/valuation.ts';

serve(async (req) => {
  const userId = isAdmin(req) ? null : await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const cfg = await loadConfig();
  const t = cfg.types.find((x) => x.key === body.business_type);
  if (!t) throw new HttpError(400, 'unknown business_type');
  return json(await valuate({ agent: 'valuation-agent', userId }, t, body.attributes ?? {}, body.asking_price ?? null));
});
