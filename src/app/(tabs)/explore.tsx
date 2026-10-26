import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListingMap } from '@/components/listing-map';
import { ListingCard } from '@/components/listing-card';
import { Button, Chip, Icon, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme, useThemePref } from '@/hooks/use-theme';
import { businessTypes, LOCALITIES, typeColor } from '@/lib/config';
import { ensureSession, supabase } from '@/lib/supabase';
import { trackSearch, trackView } from '@/lib/track';
import type { PublicListing } from '@/lib/types';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export default function Explore() {
  const theme = useTheme();
  const { scheme } = useThemePref();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ focus?: string }>();

  const [query, setQuery] = useState('');
  const [types, setTypes] = useState<string[]>([]);
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number; zoom?: number; key: number } | null>(null);
  const [showList, setShowList] = useState(false);
  const reqSeq = useRef(0);
  const focusIdRef = useRef<string | null>(null);

  useEffect(() => {
    focusIdRef.current = params.focus ?? null;
  }, [params.focus]);

  const fetchListings = useCallback(async (q: string, t: string[], log: boolean) => {
    const seq = ++reqSeq.current;
    setLoading(true);
    await ensureSession();
    const { data, error } = await supabase.rpc('search_listings', { p_query: q.trim() || null, p_types: t.length ? t : null });
    if (seq !== reqSeq.current) return;
    setLoading(false);
    if (error) return;
    const rows = (data ?? []) as PublicListing[];
    setListings(rows);
    // "See on map" after publishing: select + fly to the new pin once it's loaded
    const target = focusIdRef.current && rows.find((x) => x.id === focusIdRef.current);
    if (target) {
      focusIdRef.current = null;
      setSelectedId(target.id);
      setFocus({ lat: target.lat, lng: target.lng, zoom: 14, key: Date.now() });
    }
    if (log) trackSearch(q.trim() || null, { types: t }, rows.length);
  }, []);

  // Debounced search; locality names fly the camera there (Uber-style "where").
  useEffect(() => {
    const h = setTimeout(() => {
      void fetchListings(query, types, query.trim().length > 0 || types.length > 0);
      const q = norm(query);
      if (q.length >= 3) {
        const loc = LOCALITIES.find((l) => [l.name, ...l.aliases].some((a) => norm(a) === q || norm(a).startsWith(q)));
        if (loc) setFocus({ lat: loc.lat, lng: loc.lng, zoom: 13.5, key: Date.now() });
      }
    }, 400);
    return () => clearTimeout(h);
  }, [query, types, fetchListings]);

  // Refresh when returning to the tab (e.g. after publishing).
  useFocusEffect(
    useCallback(() => {
      void fetchListings(query, types, false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );


  const pins = useMemo(() => listings.map((l) => ({ id: l.id, lat: l.lat, lng: l.lng, color: typeColor(l.business_type) })), [listings]);
  const selected = listings.find((l) => l.id === selectedId) ?? null;

  const open = (l: PublicListing) => {
    trackView(l.id, query ? 'search' : 'map');
    router.push({ pathname: '/listing/[id]', params: { id: l.id } });
  };

  const toggleType = (k: string) => setTypes((t) => (t.includes(k) ? t.filter((x) => x !== k) : [...t, k]));

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ListingMap pins={pins} selectedId={selectedId} onSelect={setSelectedId} focus={focus} dark={scheme === 'dark'} bottomInset={selected ? 230 : 70} />

      {/* search + filters */}
      <View style={[styles.top, { paddingTop: insets.top + Spacing.two }]} pointerEvents="box-none">
        <View style={[styles.search, { backgroundColor: theme.card, shadowColor: '#000' }]}>
          <Icon name="search" size={18} color={theme.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search area, mall or business (e.g. Cyber Hub, dental)"
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { color: theme.text }]}
            returnKeyType="search"
            accessibilityLabel="Search businesses"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} accessibilityLabel="Clear search" hitSlop={10}>
              <Icon name="close-circle" size={18} color={theme.textSecondary} />
            </Pressable>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="All" selected={types.length === 0} onPress={() => setTypes([])} />
          {businessTypes().map((t) => (
            <Chip key={t.key} label={t.plural} icon={t.icon} color={t.color} selected={types.includes(t.key)} onPress={() => toggleType(t.key)} />
          ))}
        </ScrollView>
      </View>

      {/* bottom: selected pin sheet or summary bar */}
      <View style={styles.bottom} pointerEvents="box-none">
        {selected ? (
          <View style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.grabber, { backgroundColor: theme.backgroundSelected }]} />
            <ListingCard listing={selected} onPress={() => open(selected)} />
            <View style={styles.row}>
              <Button title="Close" variant="secondary" style={{ flex: 1 }} onPress={() => setSelectedId(null)} />
              <Button title="View details" icon="arrow-forward" style={{ flex: 2 }} onPress={() => open(selected)} />
            </View>
          </View>
        ) : (
          <View style={styles.bar}>
            <Pressable
              onPress={() => setShowList(true)}
              style={[styles.countPill, { backgroundColor: theme.card, borderColor: theme.border }]}
              accessibilityRole="button">
              <Icon name="list" size={16} color={theme.primary} />
              <T type="smallBold">{loading ? 'Searching…' : `${listings.length} businesses for sale`}</T>
            </Pressable>
            <View style={styles.row}>
              <Button title="Sell" icon="storefront" style={styles.fab} onPress={() => router.push({ pathname: '/chat/[role]', params: { role: 'seller' } })} />
              <Button title="Buy" icon="search" style={styles.fab} onPress={() => router.push({ pathname: '/chat/[role]', params: { role: 'buyer' } })} />
            </View>
          </View>
        )}
      </View>

      {showList && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.background, paddingTop: insets.top }]}>
          <View style={[styles.listHead, { borderBottomColor: theme.border }]}>
            <T type="subtitle">{listings.length} businesses</T>
            <Button title="Map" icon="map" variant="ghost" onPress={() => setShowList(false)} />
          </View>
          <FlatList
            data={listings}
            keyExtractor={(l) => l.id}
            contentContainerStyle={{ padding: Spacing.three, gap: Spacing.two }}
            renderItem={({ item }) => <ListingCard listing={item} onPress={() => open(item)} />}
            ListEmptyComponent={
              <T color="textSecondary" style={{ textAlign: 'center', marginTop: Spacing.five }}>
                No matches. Try another area or clear filters.
              </T>
            }
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, gap: Spacing.two },
  search: {
    marginHorizontal: Spacing.three,
    height: 50,
    borderRadius: Radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
    elevation: 6,
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  searchInput: { flex: 1, fontSize: 15, height: 50 },
  chips: { paddingHorizontal: Spacing.three, gap: Spacing.two },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: Spacing.three },
  sheet: { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.three, gap: Spacing.two, elevation: 10, shadowOpacity: 0.2, shadowRadius: 16 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: Spacing.one },
  bar: { gap: Spacing.two },
  countPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    height: 38,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 4,
  },
  row: { flexDirection: 'row', gap: Spacing.two },
  fab: { flex: 1, elevation: 6 },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.three, borderBottomWidth: StyleSheet.hairlineWidth },
});
