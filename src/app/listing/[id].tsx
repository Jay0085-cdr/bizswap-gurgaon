import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { TypeBadge } from '@/components/listing-card';
import { Button, Card, Empty, Icon, Pill, StageStepper, T } from '@/components/ui';
import { STAGE_LABEL, Spacing, type Stage } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { typeOf } from '@/lib/config';
import { notify } from '@/lib/dialog';
import { formatINR, formatINRCompact, formatRange } from '@/lib/inr';
import { ensureSession, supabase } from '@/lib/supabase';
import { track, trackView } from '@/lib/track';
import type { PublicListing } from '@/lib/types';

function fmt(type: string, v: unknown, unit?: string) {
  if (v === null || v === undefined || v === '') return '—';
  if (type === 'inr') return `${formatINR(Number(v))}${unit?.startsWith('per ') ? ` ${unit.replace('per ', '/ ')}` : ''}`;
  if (type === 'boolean') return v ? 'Yes' : 'No';
  if (type === 'number') return `${Number(v).toLocaleString('en-IN')}${unit ? ` ${unit}` : ''}`;
  return String(v);
}

const SELLER_NEXT: Partial<Record<Stage, Stage>> = { contacted: 'in_discussion', matched: 'in_discussion', in_discussion: 'closed' };

export default function ListingDetail() {
  const { id, source } = useLocalSearchParams<{ id: string; source?: string }>();
  const theme = useTheme();
  const [l, setL] = useState<PublicListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [interested, setInterested] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      await ensureSession();
      const { data: pub } = await supabase.from('public_listings').select('*').eq('id', id).maybeSingle();
      let row = pub as PublicListing | null;
      if (!row) {
        // own listing that is closed/draft isn't in the public view
        const { data: mine } = await supabase.from('my_listings').select('*').eq('id', id).maybeSingle();
        row = mine ? ({ ...mine, is_mine: true } as PublicListing) : null;
      }
      setL(row);
      setLoading(false);
      if (row && !row.is_mine && source) trackView(row.id, source as 'match');
      const { data: me } = await supabase.auth.getUser();
      if (me.user) {
        const { data: i } = await supabase.from('interests').select('id').eq('listing_id', id).eq('buyer_id', me.user.id).maybeSingle();
        setInterested(!!i);
      }
    })();
  }, [id, source]);

  if (loading) return <ActivityIndicator style={{ marginTop: 80 }} />;
  if (!l)
    return (
      <Empty
        icon="storefront-outline"
        title="Listing not available"
        body="It may have been closed or removed by the seller."
        action={<Button title="Browse the map" icon="map" onPress={() => router.replace('/explore')} />}
      />
    );

  const t = typeOf(l.business_type);
  const fields = (t?.fields ?? []).filter((f) => f.key !== 'asking_price');
  const extras = Object.entries(l.attributes).filter(([k]) => !fields.some((f) => f.key === k) && k !== 'asking_price');

  const expressInterest = async () => {
    setSending(true);
    const { error } = await supabase.rpc('express_interest', { p_listing_id: l.id, p_note: null });
    setSending(false);
    if (error) return notify('Could not send', error.message);
    setInterested(true);
    track('interest_expressed', { listing_id: l.id }, 'listing');
    router.push({ pathname: '/contact', params: { reason: 'interest' } });
  };

  const advance = async (to: Stage) => {
    const { error } = await supabase.rpc('set_listing_stage', { p_listing_id: l.id, p_stage: to });
    if (error) return notify('Could not update', error.message);
    setL({ ...l, stage: to });
    track('stage_changed', { listing_id: l.id, to }, 'listing');
  };

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <TypeBadge typeKey={l.business_type} size={48} />
        <View style={{ flex: 1, gap: 4 }}>
          <T type="heading">{l.title}</T>
          <View style={styles.row}>
            <Icon name="location" size={14} color={theme.textSecondary} />
            <T type="small" color="textSecondary">
              {l.locality_name ?? 'Gurgaon'} · {t?.label}
            </T>
          </View>
        </View>
      </View>

      {l.is_seed && <Pill label="Demo listing (fictional)" color={theme.warning} bg={theme.backgroundElement} />}
      <T color="textSecondary">{l.summary}</T>

      <Card>
        <T type="smallBold">Key facts</T>
        {fields.map((f) => (
          <View key={f.key} style={styles.fact}>
            <T type="small" color="textSecondary">
              {f.label}
            </T>
            <T type="smallBold">{fmt(f.type, l.attributes[f.key], f.unit)}</T>
          </View>
        ))}
        {extras.map(([k, v]) => (
          <View key={k} style={styles.fact}>
            <T type="small" color="textSecondary">
              {k.replace(/_/g, ' ')}
            </T>
            <T type="smallBold">{String(v)}</T>
          </View>
        ))}
      </Card>

      <Card>
        <View style={styles.rowBetween}>
          <T type="smallBold">Price</T>
          <Pill label="AI valuation" />
        </View>
        <View style={styles.rowBetween}>
          <T type="small" color="textSecondary">
            Asking price
          </T>
          <T type="subtitle">{l.asking_price ? formatINRCompact(l.asking_price) : 'Open to offers'}</T>
        </View>
        <View style={styles.rowBetween}>
          <T type="small" color="textSecondary">
            Indicative value
          </T>
          <T type="subtitle" color="primary">
            {formatRange(l.valuation_low, l.valuation_high)}
          </T>
        </View>
        {l.valuation_reasoning && (
          <T type="small" color="textSecondary">
            {l.valuation_reasoning}
          </T>
        )}
      </Card>

      {l.is_mine ? (
        <Card>
          <T type="smallBold">Your listing · {STAGE_LABEL[l.stage]}</T>
          <StageStepper stage={l.stage} />
          <T type="small" color="textSecondary">
            {l.view_count} views. Buyers who tap “I’m interested” appear in your dashboard.
          </T>
          {SELLER_NEXT[l.stage] && (
            <Button
              title={`Mark as ${STAGE_LABEL[SELLER_NEXT[l.stage]!]}`}
              variant="secondary"
              onPress={() => advance(SELLER_NEXT[l.stage]!)}
            />
          )}
        </Card>
      ) : (
        <View style={{ gap: Spacing.two }}>
          <Button
            title={interested ? 'Interest sent ✓' : 'I’m interested'}
            icon={interested ? undefined : 'hand-right-outline'}
            disabled={interested}
            loading={sending}
            onPress={expressInterest}
          />
          <T type="small" color="textSecondary" style={{ textAlign: 'center' }}>
            The seller is notified anonymously. Share your contact (optional) so they can reach you.
          </T>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  head: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fact: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
});

export { ErrorBoundary } from '@/components/error-fallback';
