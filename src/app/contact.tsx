import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { Button, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { agents } from '@/lib/agents';
import { notify } from '@/lib/dialog';
import { ensureSession, supabase } from '@/lib/supabase';
import { track } from '@/lib/track';

const PHONE_RE = /^(\+91[\s-]?)?[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Contact() {
  const theme = useTheme();
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [watch, setWatch] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await ensureSession();
      if (!s) return;
      const { data } = await supabase.from('contacts').select('*').eq('user_id', s.user.id).maybeSingle();
      if (data) {
        setPhone(data.phone ?? '');
        setEmail(data.email ?? '');
        setWatch(data.watch_enabled);
      }
    })();
  }, []);

  const p = phone.replace(/\s/g, '');
  const valid = (!!p || !!email) && (!p || PHONE_RE.test(p)) && (!email || EMAIL_RE.test(email.trim()));

  const save = async () => {
    setSaving(true);
    const s = await ensureSession();
    const { error } = await supabase.from('contacts').upsert({
      user_id: s!.user.id,
      phone: p || null,
      email: email.trim() || null,
      watch_enabled: watch,
      consent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (!error && watch) await agents.watch().catch(() => {});
    setSaving(false);
    if (error) return notify('Could not save', error.message);
    track('contact_shared', { phone: !!p, email: !!email, watch, reason }, 'contact');
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <T type="heading">{reason === 'interest' ? 'Interest sent ✓' : 'Get notified of new matches'}</T>
        <T color="textSecondary">
          {reason === 'interest'
            ? 'Want the seller to be able to reach you? Share a mobile number or email. This is optional.'
            : 'Share a mobile number or email and our watch agent will keep an eye on your searches. Optional — skip anytime.'}
        </T>

        <View style={{ gap: Spacing.two }}>
          <T type="smallBold">Mobile</T>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="98765 43210"
            placeholderTextColor={theme.textSecondary}
            keyboardType="phone-pad"
            autoComplete="tel"
            style={[styles.input, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border }]}
          />
          <T type="smallBold">Email</T>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={theme.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            style={[styles.input, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border }]}
          />
        </View>

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <T type="smallBold">Watch my searches</T>
            <T type="small" color="textSecondary">
              Notify me when new businesses match what I’m looking for.
            </T>
          </View>
          <Switch value={watch} onValueChange={setWatch} trackColor={{ true: theme.primary }} />
        </View>

        <Button title="Save" disabled={!valid} loading={saving} onPress={save} />
        <Button
          title="Skip"
          variant="ghost"
          onPress={() => {
            track('contact_skipped', { reason }, 'contact');
            router.back();
          }}
        />
        <T type="small" color="textSecondary" style={{ textAlign: 'center' }}>
          We never show your contact publicly. You can delete it anytime in Settings.
        </T>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.three },
  input: { height: 50, borderRadius: Radius.md, borderWidth: 1, paddingHorizontal: Spacing.three, fontSize: 16 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
});
