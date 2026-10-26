// intake-agent core: free text/voice → structured fields per business-type schema.
// The LLM only extracts; required-field completeness and the next question are decided by code.
import { z } from 'npm:zod@4';

import { fieldsFor, loadConfig, type FieldDef } from './config.ts';
import { admin } from './db.ts';
import { fmtField } from './fmt.ts';
import { generateJSON, logStep } from './llm/index.ts';
import { ANYWHERE_RE, detectType, fallbackExtract, isOnlyCity, matchLocality, parseAmount } from './parse.ts';

type Role = 'seller' | 'buyer';
type Fields = Record<string, unknown>;
type Extracted = { fields: Fields; locality_id?: number | null; locality_ids?: number[]; asked?: string[]; turns?: number };

const ExtractOut = z.object({
  business_type: z.string().nullable(),
  fields: z.array(
    z.object({
      key: z.string(),
      number: z.number().nullable().optional(),
      text: z.string().nullable().optional(),
      boolean: z.boolean().nullable().optional(),
      list: z.array(z.string()).nullable().optional(),
    }),
  ),
  ack: z.string().max(300),
  off_topic: z.boolean().optional(),
});

const ExtractSchema = {
  type: 'object',
  properties: {
    business_type: { type: ['string', 'null'], description: 'one of the allowed type keys, or null if unknown' },
    fields: {
      type: 'array',
      description: 'only fields the user actually stated (in any message); omit unknowns',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          number: { type: ['number', 'null'] },
          text: { type: ['string', 'null'] },
          boolean: { type: ['boolean', 'null'] },
          list: { type: ['array', 'null'], items: { type: 'string' } },
        },
        required: ['key'],
      },
    },
    ack: { type: 'string', description: 'one short friendly sentence acknowledging what you understood from the latest message; no questions' },
    off_topic: { type: 'boolean' },
  },
  required: ['business_type', 'fields', 'ack'],
};

function systemPrompt(role: Role, types: { key: string; label: string; aliases: string[] }[], fieldCatalog: Record<string, FieldDef[]>) {
  return `You are the Intake Agent of BizSwap Gurgaon, a marketplace for buying and selling running businesses in Gurgaon (Gurugram), India.
The user is a ${role.toUpperCase()}. They speak freely (often via speech-to-text, may be Hinglish or have transcription errors). Extract structured facts.

Allowed business types: ${JSON.stringify(types)}
Field schema per type (${role} side): ${JSON.stringify(fieldCatalog)}

Rules:
- Return business_type as one of the keys above (null if not yet clear). "practice" with patients = doctor; "chartered accountant" = ca; "company secretary" = cs; bar/lounge/brewery = pub; cafe/eatery = restaurant.
- Money: integer rupees. 1 lakh/lac/L = 100000, 1 crore/cr = 10000000, 10k = 10000. "Rs 2 lacs" → 200000.
- Keep the period the user stated. If a seller of a pub/restaurant gives MONTHLY billing, convert to daily_billing = monthly/30. If a doctor gives annual billing, monthly_billing = annual/12. If a CA/CS gives monthly billing, annual_billing = monthly*12.
- "over 2000 patients" → 2000. "20 year practice" → years_running 20. "lease runs 3 more years" → lease_remaining_years 3.
- locality fields: put the place text in "text" (e.g. "Ambience Mall", "Sector 29", "Golf Course Road"). If they only say "Gurgaon", leave location out.
- specialty: the medical specialty in words, e.g. "general physician practice" → "General physician", "dental clinic" → "Dental".
${role === 'buyer' ? `- Buyer: "areas" goes in "list" (place names). If they explicitly say anywhere / any area / no preference → list ["anywhere"]. Merely saying "in Gurgaon" is NOT an area preference — omit areas. A budget range "50L to 1Cr" → budget_min + budget_max; a single budget → budget_max. "with 50 clients" → min_client_count 50; "annual billing of Rs 2 lacs" → min_annual_billing 200000.` : '- Seller: "asking price" / "expecting" / "want X for it" → asking_price.'}
- Later messages override earlier values (corrections). Include ALL known fields from the whole conversation, not only the latest message.
- Never invent values. Only use keys from the schema for the chosen type.
- ack: warm, concise (max 25 words), Indian English, use ₹ and lakh/crore. Do not ask questions in ack.
- off_topic=true if the message is unrelated to buying/selling a business.`;
}

function coerce(def: FieldDef, item: { number?: number | null; text?: string | null; boolean?: boolean | null; list?: string[] | null }): unknown {
  switch (def.type) {
    case 'inr': {
      const v = item.number ?? parseAmount(item.text ?? null);
      return v && v > 0 ? Math.round(v) : null;
    }
    case 'number': {
      const v = item.number ?? (item.text ? parseFloat(item.text.replace(/,/g, '')) : null);
      return v !== null && Number.isFinite(v) && v >= 0 ? v : null;
    }
    case 'boolean':
      return item.boolean ?? (item.text ? /^(y|yes|true|haan|ha)/i.test(item.text) : null);
    case 'locality_list':
      return item.list?.length ? item.list : item.text ? item.text.split(/,| and /).map((s) => s.trim()).filter(Boolean) : null;
    default:
      return item.text?.trim() || (item.number !== null && item.number !== undefined ? String(item.number) : null);
  }
}

type Resolved = { fields: Fields; locality_id?: number | null; locality_ids?: number[]; missing: FieldDef[] };

function resolve(role: Role, defs: FieldDef[], fields: Fields, localities: Awaited<ReturnType<typeof loadConfig>>['localities'], prev: Extracted): Resolved {
  const out: Fields = { ...fields };
  let locality_id = prev.locality_id ?? null;
  let locality_ids = prev.locality_ids;

  for (const d of defs) {
    if (d.type === 'locality' && out[d.key] !== undefined) {
      const txt = String(out[d.key] ?? '');
      if (!txt || isOnlyCity(txt)) {
        delete out[d.key];
        locality_id = null;
      } else {
        const hit = matchLocality(txt, localities);
        locality_id = hit?.id ?? null; // unresolved specific places are geocoded by listing-agent
      }
    }
    if (d.type === 'locality_list' && out[d.key] !== undefined) {
      const list = (Array.isArray(out[d.key]) ? out[d.key] : [out[d.key]]) as string[];
      if (list.some((s) => ANYWHERE_RE.test(s) || /^any(where)?$/i.test(s.trim()))) {
        out[d.key] = ['Anywhere in Gurgaon'];
        locality_ids = [];
      } else {
        const hits = list.map((s) => matchLocality(s, localities)).filter((x) => !!x);
        if (hits.length) {
          locality_ids = [...new Set(hits.map((h) => h!.id))];
          out[d.key] = hits.map((h) => h!.name);
        } else if (list.every((s) => isOnlyCity(s))) {
          delete out[d.key];
        } else {
          out[d.key] = list; // unknown place names: keep text, treat as anywhere for matching
          locality_ids = [];
        }
      }
    }
  }
  const missing = defs.filter((d) => d.required && (out[d.key] === undefined || out[d.key] === null || out[d.key] === ''));
  return { fields: out, locality_id, locality_ids, missing };
}

function nextQuestion(role: Role, typeKnown: boolean, missing: FieldDef[], typeLabel?: string) {
  if (!typeKnown)
    return role === 'seller'
      ? 'What kind of business are you selling — a pub, restaurant, doctor’s clinic, CA practice or CS practice?'
      : 'What kind of business would you like to buy — a pub, restaurant, doctor’s clinic, CA practice or CS practice?';
  if (!missing.length)
    return role === 'seller'
      ? 'I have everything I need. Please check the summary below and tap **Publish** — or tell me anything to change.'
      : 'Got your requirement. Check the summary below and tap **Find matches** — or tell me anything to change.';
  const asks = missing.slice(0, 2).map((m) => m.ask ?? `What is the ${m.label.toLowerCase()}?`);
  const lead = missing.length > 2 ? `Just ${missing.length} more details for your ${typeLabel?.toLowerCase() ?? 'listing'}. ` : '';
  return lead + (asks.length === 2 ? `${asks[0]} And ${asks[1].charAt(0).toLowerCase()}${asks[1].slice(1)}` : asks[0]);
}

export type IntakeInput = {
  userId: string;
  role: Role;
  text: string;
  conversationId?: string | null;
  inputMode: 'voice' | 'text';
  stt?: { confidence?: number; alternatives?: string[]; raw?: string };
};

export async function handleMessage(inp: IntakeInput) {
  const db = admin();
  const cfg = await loadConfig();
  const text = inp.text.trim().slice(0, 2000);
  if (!text) throw new Error('empty message');

  // conversation
  let conv: { id: string; business_type: string | null; extracted: Extracted; role: Role; status: string } | null = null;
  if (inp.conversationId) {
    const { data } = await db.from('conversations').select('id,business_type,extracted,role,status,user_id').eq('id', inp.conversationId).maybeSingle();
    if (data && data.user_id === inp.userId && data.role === inp.role && data.status !== 'published') conv = data;
  }
  if (!conv) {
    const { data, error } = await db.from('conversations').insert({ user_id: inp.userId, role: inp.role, extracted: { fields: {} } }).select('id,business_type,extracted,role,status').single();
    if (error) throw error;
    conv = data;
  }
  const prev: Extracted = { ...(conv!.extracted ?? {}), fields: conv!.extracted?.fields ?? {} };

  await db.from('messages').insert({
    conversation_id: conv!.id,
    user_id: inp.userId,
    sender: 'user',
    text,
    input_mode: inp.inputMode,
    raw_transcript: inp.stt?.raw ?? (inp.inputMode === 'voice' ? text : null),
    stt_confidence: inp.stt?.confidence ?? null,
    stt_alternatives: inp.stt?.alternatives ?? null,
  });

  const { data: history } = await db.from('messages').select('sender,text').eq('conversation_id', conv!.id).order('id', { ascending: false }).limit(12);
  const turns = (history ?? []).reverse();

  const typeList = cfg.types.map((t) => ({ key: t.key, label: t.label, aliases: t.aliases }));
  const catalog = Object.fromEntries(cfg.types.map((t) => [t.key, fieldsFor(cfg, t.key, inp.role).map((f) => ({ key: f.key, label: f.label, type: f.type, unit: f.unit, required: f.required })) as FieldDef[]]));
  const ctx = { agent: 'intake-agent', conversationId: conv!.id, userId: inp.userId };

  let typeKey = conv!.business_type;
  let newFields: Fields = { ...prev.fields };
  let ack = '';
  let offTopic = false;

  try {
    const out = await generateJSON(ctx, {
      system: systemPrompt(inp.role, typeList, catalog),
      input: JSON.stringify({
        current_state: { business_type: typeKey, fields: prev.fields },
        conversation: turns.map((t) => `${t.sender === 'user' ? 'USER' : 'AGENT'}: ${t.text}`),
        latest_user_message: text,
      }),
      schema: ExtractSchema,
      schemaName: 'intake_extraction',
      zod: ExtractOut,
      maxTokens: 900,
    });
    const llmType = out.business_type && cfg.types.some((t) => t.key === out.business_type) ? out.business_type : null;
    typeKey = llmType ?? typeKey ?? detectType(text, cfg.types);
    const defs = fieldsFor(cfg, typeKey, inp.role);
    for (const item of out.fields) {
      const def = defs.find((d) => d.key === item.key);
      if (!def) continue;
      const v = coerce(def, item);
      if (v !== null && v !== undefined) newFields[item.key] = v;
    }
    // gap-fill safe text fields the LLM skipped, using deterministic extraction on the latest message
    const fb = fallbackExtract(text, defs.filter((d) => d.type === 'text' && newFields[d.key] === undefined).map((d) => d.key));
    for (const [k, v] of Object.entries(fb)) newFields[k] = v;
    const locDef = defs.find((d) => d.type === 'locality');
    if (locDef && newFields[locDef.key] === undefined) {
      const hit = matchLocality(text, cfg.localities);
      if (hit) newFields[locDef.key] = hit.name;
    }
    ack = out.ack;
    offTopic = !!out.off_topic;
  } catch (e) {
    // Free-tier quota / outage: degrade to deterministic extraction so the seller is never stuck.
    typeKey = typeKey ?? detectType(text, cfg.types);
    const defs = fieldsFor(cfg, typeKey, inp.role);
    const fb = fallbackExtract(text, defs.map((d) => d.key));
    const loc = matchLocality(text, cfg.localities);
    for (const d of defs) {
      if (d.type === 'locality' && loc) fb[d.key] = loc.name;
      if (d.type === 'locality_list') {
        if (ANYWHERE_RE.test(text)) fb[d.key] = ['anywhere'];
        else if (loc) fb[d.key] = [loc.name];
      }
    }
    // bare answer to a single pending question ("100", "2 lakh", "Sector 29")
    if (!Object.keys(fb).length && prev.asked?.length === 1) {
      const d = defs.find((x) => x.key === prev.asked![0]);
      if (d) {
        const v = d.type === 'inr' ? parseAmount(text) : d.type === 'number' ? parseFloat(text.replace(/[^\d.]/g, '')) : text;
        if (v !== null && !(typeof v === 'number' && Number.isNaN(v))) fb[d.key] = d.type === 'locality_list' ? [text] : v;
      }
    }
    newFields = { ...newFields, ...fb };
    ack = Object.keys(fb).length ? 'Thanks, noted.' : 'Thanks!';
    await logStep(ctx, { text, error: String((e as Error)?.message ?? e) }, { typeKey, fields: fb }, 'intake-fallback');
  }

  // business-type change → drop fields that don't belong to the new schema
  const defs = fieldsFor(cfg, typeKey, inp.role);
  if (typeKey !== conv!.business_type && conv!.business_type) {
    newFields = Object.fromEntries(Object.entries(newFields).filter(([k]) => defs.some((d) => d.key === k)));
  }

  const r = resolve(inp.role, defs, newFields, cfg.localities, prev);
  const t = cfg.types.find((x) => x.key === typeKey);
  const complete = !!typeKey && r.missing.length === 0;
  const question = nextQuestion(inp.role, !!typeKey, r.missing, t?.label);
  const reply = offTopic
    ? `I can help you ${inp.role === 'seller' ? 'sell' : 'buy'} a business in Gurgaon. ${question}`
    : `${ack ? `${ack} ` : ''}${question}`.trim();

  const extracted: Extracted = {
    fields: r.fields,
    locality_id: r.locality_id,
    locality_ids: r.locality_ids,
    asked: complete ? [] : !typeKey ? ['business_type'] : r.missing.slice(0, 2).map((m) => m.key),
    turns: (prev.turns ?? 0) + 1,
  };
  const missingKeys = [...(!typeKey ? ['business_type'] : []), ...r.missing.map((m) => m.key)];

  await db
    .from('conversations')
    .update({ business_type: typeKey, extracted, missing: missingKeys, status: complete ? 'complete' : 'open' })
    .eq('id', conv!.id);
  await db.from('messages').insert({ conversation_id: conv!.id, user_id: inp.userId, sender: 'agent', text: reply, extracted_snapshot: extracted });

  return {
    conversation_id: conv!.id,
    business_type: typeKey,
    fields: r.fields,
    display: defs
      .filter((d) => r.fields[d.key] !== undefined)
      .map((d) => ({ key: d.key, label: d.label, value: fmtField(d.type, r.fields[d.key], d.unit) })),
    missing: [...(!typeKey ? [{ key: 'business_type', label: 'Business type' }] : []), ...r.missing.map((m) => ({ key: m.key, label: m.label }))],
    reply,
    is_complete: complete,
  };
}
