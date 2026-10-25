# BizSwap Gurgaon — project guide for AI coders

AI-native Android marketplace for buying/selling running businesses (pubs, restaurants, doctor clinics, CA & CS practices) in Gurgaon. Sellers and buyers only talk/type; Supabase Edge Function agents do all structuring, geocoding, valuation, matching and watching.

Also read `AGENTS.md` (Expo SDK 58 rules — don't trust memory for Expo APIs; check versioned docs).

## Stack
- Expo SDK 58, React Native 0.88, TypeScript, Expo Router (routes in `src/app/`)
- Map: `@maplibre/maplibre-react-native` v11 (`Map`, `Camera`, `GeoJSONSource`, `Layer`) + OpenFreeMap tiles — **no Google key**
- Voice: `expo-speech-recognition` (on-device, `en-IN`), text fallback
- Backend: Supabase (Postgres data lake, anonymous auth, RLS, Edge Functions in Deno)
- LLM: provider adapter in `supabase/functions/_shared/llm/` — `LLM_PROVIDER=gemini|anthropic|groq` (default gemini), `LLM_MODEL`
- Zero-cost: free tiers only, no card. No paid geocoding — `shared/localities.json` gazetteer.

## Commands (Node ≥ 22.13 — on this machine prefix `PATH=/opt/homebrew/opt/node@22/bin:$PATH`)
| What | Command |
|---|---|
| Typecheck + lint | `npm run check` |
| Dev server (dev client) | `npm start` · web preview: `npm run web` |
| Regenerate seed SQL | `npm run db:seed:gen` |
| Push migrations + seed | `npm run db:push` |
| One-shot backend setup | `npm run setup` (link, push, seed, auth config, secrets, deploy functions, write app env) |
| Deploy agents | `npm run functions:deploy` |
| Agent smoke tests | `npm run smoke` |
| Store assets | `npm run assets` |
| Builds | `npm run build:dev` · `npm run build:apk` · `npm run build:aab` |

## Layout
```
src/app/            screens (Expo Router)          src/components/  UI (ui.tsx primitives)
src/lib/            supabase, agents, track, inr, config, types
shared/             business-types.json, localities.json  ← single source of truth (app + seed + agents)
supabase/migrations SQL schema/RLS/views/RPCs      supabase/functions/  agents + _shared
scripts/            setup/deploy/seed/smoke/assets  store/  Play Store assets   docs/  build log, privacy page
```

## Conventions
- Never put LLM/API keys in the app. App only has `EXPO_PUBLIC_SUPABASE_URL` + anon key.
- Every user action is logged: `track()` → `events`; searches → `search_events`; views → `listing_views`. Agents log every LLM call to `agent_runs`; chats go to `messages` with raw STT transcript.
- Required-field logic is deterministic code over `business_types.fields`, never trusted to the LLM.
- New business type = new entry in `shared/business-types.json` (+ `npm run db:seed:gen && npm run db:push`). No code change.
- Money is stored as integer rupees (bigint). Display with `formatINR` / `formatINRCompact` (lakh/crore).
- Public catalogue reads go through `public_listings` view (no seller identity). Pins are jittered ~250 m.
- Client writes only to: profiles, contacts, events, search_events, listing_views, saved_searches, notifications.read_at, and via RPCs. Everything else is written by agents (service role).
- Style: functional components, `StyleSheet.create`, theme via `useTheme()`; primitives in `src/components/ui.tsx`. Keep comments sparse.
- Before each commit: `npm run check`. Log AI usage in `docs/AI_BUILD_LOG.md`.

## Milestones
- [x] **M0 Scaffold** — Expo 58 app, theme (light/dark/system), role picker, tabs, Supabase client w/ anonymous session, tracking helpers, EAS profiles, CLAUDE.md, build log
- [ ] **M1 Data lake** — migrations (all tables, RLS, views, RPCs), config + gazetteer, seed (25 listings, 10 requirements), setup scripts, pushed to Supabase
- [ ] **M2 Agents** — LLM adapter (Gemini/Claude/Groq), intake, listing, valuation agents deployed; smoke tests pass on brief's example sentences
- [ ] **M3 Seller flow** — chat UI, voice input, live field chips, confirmation card, publish
- [ ] **M4 Discovery** — MapLibre map of Gurgaon, pins, filter chips, search, bottom sheet, listing detail, view/search logging
- [ ] **M5 Buyer flow** — buyer chat, matchmaker + watch agents, contact capture, inbox
- [ ] **M6 Dashboards** — seller & buyer dashboards, stage pipeline, interests
- [ ] **M7 Release** — store assets, privacy policy, README + Mermaid, signed AAB + APK via EAS
