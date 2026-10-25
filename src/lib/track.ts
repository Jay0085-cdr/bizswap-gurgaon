// Fire-and-forget behaviour logging into the data lake. Never throws, never blocks UI.
import { getDeviceId } from '@/lib/device';
import { ensureSession, supabase } from '@/lib/supabase';

type Props = Record<string, unknown>;

export function track(name: string, props: Props = {}, screen?: string) {
  void (async () => {
    const session = await ensureSession();
    if (!session) return;
    await supabase.from('events').insert({ name, screen, props, device_id: await getDeviceId() });
  })().catch(() => {});
}

export function trackSearch(query: string | null, filters: Props, resultCount: number, mapBbox?: unknown) {
  void (async () => {
    if (!(await ensureSession())) return;
    await supabase.from('search_events').insert({ query, filters, result_count: resultCount, map_bbox: mapBbox ?? null });
  })().catch(() => {});
}

export function trackView(listingId: string, source: 'map' | 'search' | 'match' | 'inbox' | 'dashboard' | 'link') {
  void (async () => {
    if (!(await ensureSession())) return;
    await supabase.from('listing_views').insert({ listing_id: listingId, source });
  })().catch(() => {});
}
