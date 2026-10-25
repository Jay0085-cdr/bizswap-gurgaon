// listing-agent: geocode (static gazetteer + LLM pick), anonymised copy, valuation, publish, trigger matchmaking.
// Normally invoked through intake-agent "confirm"; exposed here for direct/admin use.
import { admin } from '../_shared/db.ts';
import { HttpError, isAdmin, json, requireUser, serve } from '../_shared/http.ts';
import { publishListing } from '../_shared/listing.ts';

serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  const userId = isAdmin(req) ? null : await requireUser(req);
  const { data: conv } = await admin().from('conversations').select('*').eq('id', body.conversation_id).maybeSingle();
  if (!conv || (userId && conv.user_id !== userId)) throw new HttpError(404, 'conversation not found');
  if (conv.role !== 'seller') throw new HttpError(400, 'not a seller conversation');
  return json({ listing: await publishListing(conv) });
});
