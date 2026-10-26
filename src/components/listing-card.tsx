import { StyleSheet, View } from 'react-native';

import { Card, Icon, Pill, StageBadge, T } from '@/components/ui';
import { Radius, Spacing, type Stage } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { typeOf } from '@/lib/config';
import { formatINRCompact, formatRange } from '@/lib/inr';
import type { Attrs } from '@/lib/types';

/** Two headline metrics per business type, so cards are scannable. */
export function keyMetrics(typeKey: string, a: Attrs): { label: string; value: string }[] {
  const n = (k: string) => (a[k] === undefined || a[k] === null ? null : Number(a[k]));
  switch (typeKey) {
    case 'pub':
    case 'restaurant':
      return [
        { label: 'Daily billing', value: formatINRCompact(n('daily_billing')) },
        { label: 'Footfall/day', value: n('daily_footfall')?.toString() ?? '—' },
        { label: 'Lease left', value: n('lease_remaining_years') !== null ? `${n('lease_remaining_years')} yrs` : '—' },
      ];
    case 'doctor':
      return [
        { label: 'Monthly billing', value: formatINRCompact(n('monthly_billing')) },
        { label: 'Patients', value: n('patient_count')?.toLocaleString('en-IN') ?? '—' },
        { label: 'Years', value: n('years_running')?.toString() ?? '—' },
      ];
    default:
      return [
        { label: 'Annual billing', value: formatINRCompact(n('annual_billing')) },
        { label: 'Clients', value: n('client_count')?.toString() ?? '—' },
        { label: 'Years', value: n('years_running')?.toString() ?? '—' },
      ];
  }
}

export function TypeBadge({ typeKey, size = 34 }: { typeKey: string; size?: number }) {
  const t = typeOf(typeKey);
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: t?.color ?? '#64748B' }]}>
      <Icon name={t?.icon ?? 'business'} size={size * 0.5} color="#fff" />
    </View>
  );
}

export function ListingCard({
  listing,
  score,
  reasons,
  onPress,
  showStage,
}: {
  listing: {
    business_type: string;
    title: string;
    attributes: Attrs;
    locality_name?: string | null;
    asking_price?: number | null;
    valuation_low?: number | null;
    valuation_high?: number | null;
    stage?: Stage;
  };
  score?: number;
  reasons?: string[];
  onPress?: () => void;
  showStage?: boolean;
}) {
  const theme = useTheme();
  const t = typeOf(listing.business_type);
  return (
    <Card onPress={onPress}>
      <View style={styles.head}>
        <TypeBadge typeKey={listing.business_type} />
        <View style={{ flex: 1 }}>
          <T type="smallBold" numberOfLines={2}>
            {listing.title}
          </T>
          <T type="small" color="textSecondary">
            {t?.label} · {listing.locality_name ?? 'Gurgaon'}
          </T>
        </View>
        {score !== undefined && <Pill label={`${score}% fit`} color={score >= 75 ? theme.success : theme.warning} bg={theme.backgroundElement} />}
        {showStage && listing.stage && <StageBadge stage={listing.stage} />}
      </View>
      <View style={styles.metrics}>
        {keyMetrics(listing.business_type, listing.attributes).map((m) => (
          <View key={m.label} style={[styles.metric, { backgroundColor: theme.backgroundElement }]}>
            <T type="caption" color="textSecondary">
              {m.label}
            </T>
            <T type="smallBold">{m.value}</T>
          </View>
        ))}
      </View>
      <T type="small" color="textSecondary">
        {listing.asking_price ? `Asking ${formatINRCompact(listing.asking_price)} · ` : ''}AI value {formatRange(listing.valuation_low, listing.valuation_high)}
      </T>
      {reasons?.length ? (
        <T type="small" color="textSecondary" numberOfLines={3}>
          ✦ {reasons.join(' · ')}
        </T>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  badge: { alignItems: 'center', justifyContent: 'center' },
  metrics: { flexDirection: 'row', gap: Spacing.one },
  metric: { flex: 1, borderRadius: Radius.sm, padding: Spacing.two, gap: 2 },
});
