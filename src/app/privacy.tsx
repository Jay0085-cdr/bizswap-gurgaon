import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { PRIVACY } from '@/constants/privacy';
import { useTheme } from '@/hooks/use-theme';

export default function Privacy() {
  const theme = useTheme();
  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <T type="heading">{PRIVACY.app} — Privacy policy</T>
      <T type="small" color="textSecondary">
        Effective {PRIVACY.effective}
      </T>
      {PRIVACY.sections.map((s) => (
        <View key={s.h} style={{ gap: Spacing.two }}>
          <T type="subtitle">{s.h}</T>
          {s.p.map((p) => (
            <T key={p} color="textSecondary">
              {p}
            </T>
          ))}
        </View>
      ))}
      <T type="smallBold" color="primary" onPress={() => Linking.openURL(`mailto:${PRIVACY.contact}`)}>
        {PRIVACY.contact}
      </T>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
});

export { ErrorBoundary } from '@/components/error-fallback';
