import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, T, type IconName } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getRolePref, setRolePref, type RolePref } from '@/lib/prefs';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/track';

const OPTIONS: { role: RolePref; icon: IconName; title: string; body: string }[] = [
  { role: 'seller', icon: 'storefront', title: 'Sell a Business', body: 'Just say what you’re selling — our AI fills in the rest.' },
  { role: 'buyer', icon: 'search', title: 'Buy a Business', body: 'Describe what you want; we match you with listings.' },
];

export default function Welcome() {
  const theme = useTheme();
  const [checked, setChecked] = useState<RolePref | null | undefined>(undefined);

  useEffect(() => {
    getRolePref().then(setChecked);
  }, []);

  if (checked === undefined) return null;
  if (checked) return <Redirect href="/explore" />;

  const choose = async (role: RolePref) => {
    await setRolePref(role);
    track('role_selected', { role }, 'welcome');
    void supabase.from('profiles').update({ role_pref: role }).then(() => {});
    router.replace('/explore');
    if (role !== 'browse') router.push({ pathname: '/chat/[role]', params: { role } });
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={styles.hero}>
        <View style={[styles.logo, { backgroundColor: theme.primary }]}>
          <Icon name="swap-horizontal" size={30} color={theme.primaryText} />
        </View>
        <T type="title">BizSwap Gurgaon</T>
        <T type="default" color="textSecondary">
          Buy or sell running businesses — pubs, restaurants, clinics, CA & CS practices — in Gurgaon.
        </T>
      </View>

      <View style={styles.options}>
        {OPTIONS.map((o) => (
          <Pressable
            key={o.role}
            accessibilityRole="button"
            onPress={() => choose(o.role)}
            style={({ pressed }) => [
              styles.option,
              { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.85 : 1 },
            ]}>
            <View style={[styles.optionIcon, { backgroundColor: theme.primarySoft }]}>
              <Icon name={o.icon} size={26} color={theme.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T type="subtitle">{o.title}</T>
              <T type="small" color="textSecondary">
                {o.body}
              </T>
            </View>
            <Icon name="chevron-forward" color={theme.textSecondary} />
          </Pressable>
        ))}
        <Pressable accessibilityRole="button" onPress={() => choose('browse')} style={styles.browse}>
          <T type="smallBold" color="primary">
            Just browse the map →
          </T>
        </Pressable>
      </View>

      <T type="small" color="textSecondary" style={styles.footer}>
        No sign-up, no permissions needed.
      </T>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: Spacing.four, justifyContent: 'space-between' },
  hero: { marginTop: Spacing.six, gap: Spacing.three },
  logo: { width: 60, height: 60, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
  options: { gap: Spacing.three },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 88,
  },
  optionIcon: { width: 52, height: 52, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  browse: { alignSelf: 'center', padding: Spacing.three },
  footer: { textAlign: 'center' },
});
