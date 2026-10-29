import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Card, Chip, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme, useThemePref, type ThemePref } from '@/hooks/use-theme';
import { confirm, notify } from '@/lib/dialog';
import { setRolePref } from '@/lib/prefs';
import { ensureSession, resetSession, supabase } from '@/lib/supabase';
import { track } from '@/lib/track';

const THEMES: { key: ThemePref; label: string }[] = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
];

export default function Settings() {
  const theme = useTheme();
  const { pref, setPref } = useThemePref();

  const deleteData = async () => {
    if (
      !(await confirm(
        'Delete all my data?',
        'This permanently removes your listings, searches, chats and contact details.',
        'Delete',
        true,
      ))
    )
      return;
    await ensureSession();
    const { error } = await supabase.rpc('delete_my_data');
    if (error) return notify('Could not delete', error.message);
    await resetSession();
    await setRolePref(null);
    router.replace('/');
  };

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <Card>
        <T type="smallBold">Appearance</T>
        <View style={styles.row}>
          {THEMES.map((t) => (
            <Chip key={t.key} label={t.label} selected={pref === t.key} onPress={() => setPref(t.key)} />
          ))}
        </View>
      </Card>

      <Card>
        <T type="smallBold">Watch my searches</T>
        <T type="small" color="textSecondary">
          Optionally share your mobile or email so our watch agent can tell you when a new matching business is listed.
        </T>
        <Button title="Add mobile / email" icon="notifications-outline" variant="secondary" onPress={() => router.push('/contact')} />
      </Card>

      <Card>
        <T type="smallBold">I want to…</T>
        <View style={styles.row}>
          <Button
            title="Sell"
            icon="storefront-outline"
            variant="secondary"
            style={{ flex: 1 }}
            onPress={() => router.push({ pathname: '/chat/[role]', params: { role: 'seller' } })}
          />
          <Button
            title="Buy"
            icon="search-outline"
            variant="secondary"
            style={{ flex: 1 }}
            onPress={() => router.push({ pathname: '/chat/[role]', params: { role: 'buyer' } })}
          />
        </View>
        <Button
          title="Show welcome screen again"
          variant="ghost"
          onPress={async () => {
            await setRolePref(null);
            track('role_reset', {}, 'settings');
            router.replace('/');
          }}
        />
      </Card>

      <Card>
        <T type="smallBold">Privacy</T>
        <T type="small" color="textSecondary">
          You use BizSwap anonymously. Conversations are processed by AI agents on our servers to create listings and matches.
        </T>
        <Button title="Privacy policy" variant="secondary" onPress={() => router.push('/privacy')} />
        <Button title="Delete my data" variant="danger" onPress={deleteData} />
      </Card>

      <T type="small" color="textSecondary" style={{ textAlign: 'center' }}>
        BizSwap Gurgaon · MVP · All demo listings are fictional
      </T>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three },
  row: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
});

export { ErrorBoundary } from '@/components/error-fallback';
