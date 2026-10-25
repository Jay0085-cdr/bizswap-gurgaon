// intake-agent: conversational extraction for sellers & buyers; "confirm" publishes via listing-agent logic.
import { admin } from '../_shared/db.ts';
import { HttpError, json, requireUser, serve } from '../_shared/http.ts';
import { handleMessage } from '../_shared/intake.ts';
import { publishListing, saveRequirement } from '../_shared/listing.ts';

serve(async (req) => {
  const userId = await requireUser(req);
  const body = await req.json().catch(() => ({}));

  if (body.action === 'confirm') {
    const { data: conv } = await admin().from('conversations').select('*').eq('id', body.conversation_id).maybeSingle();
    if (!conv || conv.user_id !== userId) throw new HttpError(404, 'conversation not found');
    if (conv.role === 'seller') return json({ role: 'seller', listing: await publishListing(conv) });
    return json({ role: 'buyer', ...(await saveRequirement(conv)) });
  }

  if (body.role !== 'seller' && body.role !== 'buyer') throw new HttpError(400, 'role must be seller or buyer');
  if (typeof body.text !== 'string' || !body.text.trim()) throw new HttpError(400, 'text required');
  return json(
    await handleMessage({
      userId,
      role: body.role,
      text: body.text,
      conversationId: body.conversation_id,
      inputMode: body.input_mode === 'voice' ? 'voice' : 'text',
      stt: body.stt,
    }),
  );
});
