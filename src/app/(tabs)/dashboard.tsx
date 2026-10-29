import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { TypeBadge } from '@/components/listing-card';
import { Button, Card, Chip, Empty, Pill, StageStepper, Stat, T } from '@/components/ui';
import { STAGE_LABEL, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { typeOf } from '@/lib/config';
import { formatINRCompact, formatRange } from '@/lib/inr';
import { getRolePref } from '@/lib/prefs';
import { ensureSession, supabase } from '@/lib/supabase';
import { track } from '@/lib/track';
import type { MyListing, Requirement, SellerMatch } from '@/lib/types';

type Tab = 'seller' | 'buyer';

export default function Dashboard() {
  const theme = useTheme();
  const [tab, setTab] = useState<Tab | null>(null);
  const [listings, setListings] = useState<MyListing[]>([]);
  const [sellerMatches, setSellerMatches] = useState<SellerMatch[]>([]);
  const [reqs, setReqs] = useState<Requirement[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    await ensureSession();
    const [l, sm, r] = await Promise.all([
      supabase.from('my_listings').select('*').order('created_at', { ascending: false }),
      supabase.from('my_seller_matches').select('*').order('score', { ascending: false }),
      supabase.from('my_requirements').select('*').order('created_at', { ascending: false }),
    ]);
    const ls = (l.data ?? []) as MyListing[];
    const rs = (r.data ?? []) as Requirement[];
    setListings(ls);
    setSellerMatches((sm.data ?? []) as SellerMatch[]);
    setReqs(rs);
    setLoaded(true);
    // default tab: whatever the user has, else their chosen role
    setTab((cur) => cur ?? (ls.length ? 'seller' : rs.length ? 'buyer' : null));
    if (!ls.length && !rs.length) getRolePref().then((p) => setTab((cur) => cur ?? (p === 'buyer' ? 'buyer' : 'seller')));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      track('dashboard_view', {}, 'dashboard');
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const active = tab ?? 'seller';
  const totalViews = listings.reduce((a, l) => a + (l.view_count ?? 0), 0);

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <View style={styles.tabs}>
        <Chip label={`Selling (${listings.length})`} icon="storefront" selected={active === 'seller'} onPress={() => setTab('seller')} />
        <Chip label={`Buying (${reqs.length})`} icon="search" selected={active === 'buyer'} onPress={() => setTab('buyer')} />
      </View>

      {active === 'seller' &&
        (listings.length === 0 ? (
          loaded && (
            <Empty
              icon="storefront-outline"
              title="No listings yet"
              body="Describe your business by voice or text — our agents create, value and publish the listing for you."
              action={
                <Button
                  title="Sell a business"
                  icon="mic"
                  onPress={() => router.push({ pathname: '/chat/[role]', params: { role: 'seller' } })}
                />
              }
            />
          )
        ) : (
          <>
            <Card>
              <View style={styles.stats}>
                <Stat label="Listings" value={String(listings.length)} />
                <Stat label="Total views" value={String(totalViews)} />
                <Stat label="Matched buyers" value={String(sellerMatches.length)} />
              </View>
            </Card>
            {listings.map((l) => {
              const matches = sellerMatches.filter((m) => m.listing_id === l.id);
              return (
                <Card key={l.id} onPress={() => router.push({ pathname: '/listing/[id]', params: { id: l.id } })}>
                  <View style={styles.head}>
                    <TypeBadge typeKey={l.business_type} />
                    <View style={{ flex: 1 }}>
                      <T type="smallBold" numberOfLines={2}>
                        {l.title}
                      </T>
                      <T type="small" color="textSecondary">
                        {l.locality_name} · value {formatRange(l.valuation_low, l.valuation_high)}
                      </T>
                    </View>
                  </View>
                  <StageStepper stage={l.stage} />
                  <View style={styles.stats}>
                    <Stat label="Views" value={String(l.view_count)} />
                    <Stat label="Matches" value={String(l.match_count)} />
                    <Stat label="Interested" value={String(l.interest_count)} />
                  </View>
                  {matches.slice(0, 3).map((m) => (
                    <View key={m.match_id} style={[styles.match, { backgroundColor: theme.backgroundElement }]}>
                      <View style={{ flex: 1 }}>
                        <T type="small" numberOfLines={1}>
                          Buyer: {m.requirement_title}
                        </T>
                        <T type="small" color="textSecondary" numberOfLines={1}>
                          {m.budget_max ? `Budget up to ${formatINRCompact(m.budget_max)}` : 'Budget not stated'} · {m.reasons?.[0] ?? ''}
                        </T>
                      </View>
                      {m.buyer_interested ? (
                        <Pill label="Interested" color={theme.success} bg={theme.card} />
                      ) : (
                        <Pill label={`${m.score}%`} />
                      )}
                    </View>
                  ))}
                </Card>
              );
            })}
          </>
        ))}

      {active === 'buyer' &&
        (reqs.length === 0
          ? loaded && (
              <Empty
                icon="search-outline"
                title="No searches yet"
                body="Tell our agent what you want to buy — it finds matches now and keeps watching for new ones."
                action={
                  <Button
                    title="Buy a business"
                    icon="mic"
                    onPress={() => router.push({ pathname: '/chat/[role]', params: { role: 'buyer' } })}
                  />
                }
              />
            )
          : reqs.map((r) => (
              <Card key={r.id} onPress={() => router.push({ pathname: '/requirement/[id]', params: { id: r.id } })}>
                <View style={styles.head}>
                  <TypeBadge typeKey={r.business_type} />
                  <View style={{ flex: 1 }}>
                    <T type="smallBold" numberOfLines={2}>
                      {r.title}
                    </T>
                    <T type="small" color="textSecondary">
                      {typeOf(r.business_type)?.label} · {r.budget_max ? `up to ${formatINRCompact(r.budget_max)}` : 'any budget'}
                    </T>
                  </View>
                  {r.watch && <Pill label="Watching" />}
                </View>
                <StageStepper stage={r.stage} />
                <View style={styles.stats}>
                  <Stat label="Matches" value={String(r.match_count ?? 0)} />
                  <Stat label="Best fit" value={r.best_score ? `${r.best_score}%` : '—'} />
                  <Stat label="Stage" value={STAGE_LABEL[r.stage]} />
                </View>
              </Card>
            )))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  tabs: { flexDirection: 'row', gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  match: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two, borderRadius: 10 },
});

export { ErrorBoundary } from '@/components/error-fallback';
