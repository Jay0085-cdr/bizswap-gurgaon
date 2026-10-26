import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';

import { ListingCard } from '@/components/listing-card';
import { Button, Card, Empty, Pill, StageStepper, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { displayFields, typeOf } from '@/lib/config';
import { formatINRCompact } from '@/lib/inr';
import { ensureSession, supabase } from '@/lib/supabase';
import { track } from '@/lib/track';
import type { BuyerMatch, Requirement } from '@/lib/types';

export default function RequirementDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const [req, setReq] = useState<Requirement | null>(null);
  const [matches, setMatches] = useState<BuyerMatch[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        await ensureSession();
        const [r, m] = await Promise.all([
          supabase.from('my_requirements').select('*').eq('id', id).maybeSingle(),
          supabase.from('my_buyer_matches').select('*').eq('requirement_id', id).order('score', { ascending: false }),
        ]);
        setReq(r.data as Requirement | null);
        setMatches((m.data ?? []) as BuyerMatch[]);
        setLoading(false);
      })();
    }, [id]),
  );

  if (loading) return <ActivityIndicator style={{ marginTop: 80 }} />;
  if (!req) return <T style={{ margin: Spacing.four }}>Search not found.</T>;

  const t = typeOf(req.business_type);
  const criteria = displayFields(req.business_type, 'buyer').filter((f) => f.key !== 'budget_max' && f.key !== 'budget_min');

  const close = () =>
    Alert.alert('Close this search?', 'You’ll stop getting matches for it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Close search',
        style: 'destructive',
        onPress: async () => {
          await supabase.rpc('set_requirement_stage', { p_requirement_id: req.id, p_stage: 'closed' });
          track('requirement_closed', { requirement_id: req.id }, 'requirement');
          router.back();
        },
      },
    ]);

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <Card>
        <View style={styles.rowBetween}>
          <T type="caption" color="textSecondary">
            {t?.label}
          </T>
          {req.watch && <Pill label="Watch agent on" />}
        </View>
        <T type="subtitle">{req.title}</T>
        <StageStepper stage={req.stage} />
        <View style={styles.fact}>
          <T type="small" color="textSecondary">
            Budget
          </T>
          <T type="smallBold">
            {req.budget_min ? `${formatINRCompact(req.budget_min)} – ` : 'up to '}
            {formatINRCompact(req.budget_max)}
          </T>
        </View>
        {criteria
          .filter((f) => req.criteria[f.key] !== undefined && req.criteria[f.key] !== null)
          .map((f) => {
            const v = req.criteria[f.key];
            return (
              <View key={f.key} style={styles.fact}>
                <T type="small" color="textSecondary">
                  {f.label}
                </T>
                <T type="smallBold" style={{ flexShrink: 1, textAlign: 'right' }}>
                  {Array.isArray(v) ? v.join(', ') : f.type === 'inr' ? formatINRCompact(Number(v)) : String(v)}
                </T>
              </View>
            );
          })}
      </Card>

      <T type="subtitle">{matches.length ? `${matches.length} matches` : 'No matches yet'}</T>
      {matches.length === 0 ? (
        <Empty icon="eye-outline" title="We’re watching" body="Our watch agent checks every new listing against this search and will notify you in your Inbox." />
      ) : (
        matches.map((m) => (
          <ListingCard
            key={m.match_id}
            listing={{ ...m, stage: m.listing_stage }}
            score={m.score}
            reasons={m.reasons}
            onPress={() => {
              if (m.status === 'new') void supabase.rpc('mark_match_seen', { p_match_id: m.match_id });
              router.push({ pathname: '/listing/[id]', params: { id: m.listing_id, source: 'match' } });
            }}
          />
        ))
      )}

      {!req.watch && <Button title="Get notified of new matches" icon="notifications-outline" variant="secondary" onPress={() => router.push('/contact')} />}
      {req.stage !== 'closed' && <Button title="Close this search" variant="ghost" onPress={close} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fact: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.three, paddingVertical: 2 },
});
