import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button, Chip, Icon, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useSpeech } from '@/hooks/use-speech';
import { useTheme } from '@/hooks/use-theme';
import { APP_BUILD, APP_VERSION } from '@/lib/app-info';
import { getDeviceId } from '@/lib/device';
import { notify } from '@/lib/dialog';
import { ensureSession, supabase } from '@/lib/supabase';
import { track } from '@/lib/track';

const PROMPTS = ['Something didn’t work', 'This was confusing', 'I’d love a feature', 'I liked this'];

export default function Feedback() {
  const theme = useTheme();
  const { screen = 'unknown' } = useLocalSearchParams<{ screen?: string }>();
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'text' | 'voice'>('text');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const speech = useSpeech((r) => {
    setText((t) => (t ? `${t} ${r.text}` : r.text));
    setMode('voice');
  });

  const send = async () => {
    setSending(true);
    await ensureSession();
    const { error } = await supabase.from('feedback').insert({
      message: text.trim(),
      screen,
      app_version: APP_VERSION,
      build: APP_BUILD,
      platform: Platform.OS,
      input_mode: mode,
      device_id: await getDeviceId(),
    });
    setSending(false);
    if (error) return notify('Could not send', 'Please check your connection and try again.');
    track('feedback_sent', { screen, mode, length: text.trim().length }, 'feedback');
    setSent(true);
  };

  if (sent)
    return (
      <View style={[styles.done, { backgroundColor: theme.background }]}>
        <Icon name="checkmark-circle" size={56} color={theme.success} />
        <T type="heading">Thank you!</T>
        <T color="textSecondary" style={{ textAlign: 'center' }}>
          Your feedback goes straight to the team and shapes the next version.
        </T>
        <Button title="Done" onPress={() => router.back()} />
      </View>
    );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <T type="heading">Send feedback</T>
        <T color="textSecondary">Tell us anything — bugs, confusing bits, ideas. Speak or type, any language mix is fine.</T>

        <View style={styles.chips}>
          {PROMPTS.map((p) => (
            <Chip key={p} label={p} onPress={() => setText((t) => (t ? t : `${p}: `))} />
          ))}
        </View>

        <View style={[styles.box, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <TextInput
            value={speech.listening && speech.partial ? `${text} ${speech.partial}`.trim() : text}
            onChangeText={setText}
            placeholder="What happened? What did you expect?"
            placeholderTextColor={theme.textSecondary}
            multiline
            maxLength={4000}
            accessibilityLabel="Feedback message"
            style={[styles.input, { color: theme.text }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={speech.listening ? 'Stop listening' : 'Speak'}
            onPress={() => (speech.listening ? speech.stop() : void speech.start())}
            style={[styles.mic, { backgroundColor: speech.listening ? theme.danger : theme.primary }]}>
            <Icon name={speech.listening ? 'stop' : 'mic'} size={22} color="#fff" />
          </Pressable>
        </View>
        {speech.error && (
          <T type="small" color="textSecondary">
            {speech.error}
          </T>
        )}

        <Button title="Send feedback" icon="send" disabled={text.trim().length < 2} loading={sending} onPress={send} />
        <T type="small" color="textSecondary" style={{ textAlign: 'center' }}>
          Sent anonymously with the app version ({APP_VERSION}) and this screen’s name.
        </T>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.three },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  box: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.three, flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-end' },
  input: { flex: 1, minHeight: 140, fontSize: 16, textAlignVertical: 'top' },
  mic: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
});

export { ErrorBoundary } from '@/components/error-fallback';
