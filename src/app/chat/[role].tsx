import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListingCard } from '@/components/listing-card';
import { Button, Card, Chip, Icon, Pill, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useSpeech, type SpeechResult } from '@/hooks/use-speech';
import { useTheme } from '@/hooks/use-theme';
import { agents } from '@/lib/agents';
import { typeOf } from '@/lib/config';
import { formatRange } from '@/lib/inr';
import { track } from '@/lib/track';
import type { ChatTurn, ConfirmResponse, IntakeResponse } from '@/lib/types';

type Role = 'seller' | 'buyer';

const INTRO: Record<Role, { greeting: string; examples: string[] }> = {
  seller: {
    greeting:
      'Hi! Tell me about the business you want to sell — what it is, where it is in Gurgaon, and key numbers like footfall, billing, rent or clients. Just speak or type freely.',
    examples: [
      'I want to sell my pub at Ambience Mall. Footfall 100 a day, daily billing ₹10,000, lease 3 more years at ₹30,000/month',
      'I want to sell my 20 year general physician practice with over 2000 patients and monthly billing of Rs 2 lacs',
      'Selling my CA practice in Sector 14, 60 clients, ₹25 lakh annual billing, running 12 years',
    ],
  },
  buyer: {
    greeting:
      'Hi! What kind of business would you like to buy? Tell me the type, preferred area, size (clients, billing, footfall) and your budget — speak or type freely.',
    examples: [
      'I want to buy a CA practice in Gurgaon with 50 clients with annual billing of Rs 2 lacs',
      'Looking for a pub in a mall on Golf Course Road, budget up to 2 crore',
      'Dental clinic in DLF, monthly billing at least 4 lakh, budget 1.5 crore',
    ],
  },
};

function RichText({ text, color }: { text: string; color: string }) {
  const parts = text.split('**');
  return (
    <Text style={[styles.bubbleText, { color }]}>
      {parts.map((p, i) => (
        <Text key={i} style={i % 2 ? { fontWeight: '800' } : undefined}>
          {p}
        </Text>
      ))}
    </Text>
  );
}

export default function ChatScreen() {
  const { role: roleParam } = useLocalSearchParams<{ role: string }>();
  const role: Role = roleParam === 'buyer' ? 'buyer' : 'seller';
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ChatTurn>>(null);

  const [turns, setTurns] = useState<ChatTurn[]>([{ id: 'intro', sender: 'agent', text: INTRO[role].greeting }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<IntakeResponse | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<ConfirmResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scrollEnd = () => setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);

  const send = async (text: string, mode: 'voice' | 'text', stt?: SpeechResult) => {
    const msg = text.trim();
    if (!msg || busy) return;
    setError(null);
    setInput('');
    const id = `${Date.now()}`;
    setTurns((t) => [...t, { id, sender: 'user', text: msg, input_mode: mode }, { id: `${id}-p`, sender: 'agent', text: '…', pending: true }]);
    scrollEnd();
    setBusy(true);
    try {
      const res = await agents.intake({
        role,
        text: msg,
        conversation_id: state?.conversation_id,
        input_mode: mode,
        stt: stt ? { confidence: stt.confidence, alternatives: stt.alternatives, raw: stt.text } : undefined,
      });
      setState(res);
      setTurns((t) => t.map((x) => (x.id === `${id}-p` ? { id: `${id}-a`, sender: 'agent', text: res.reply } : x)));
      if (res.is_complete) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      setTurns((t) => t.filter((x) => x.id !== `${id}-p`));
      setError((e as Error).message || 'Something went wrong — please try again.');
    } finally {
      setBusy(false);
      scrollEnd();
    }
  };

  const speech = useSpeech((r) => send(r.text, 'voice', r));

  const confirm = async () => {
    if (!state) return;
    setPublishing(true);
    setError(null);
    try {
      const res = await agents.confirm(state.conversation_id);
      setResult(res);
      track(role === 'seller' ? 'listing_published' : 'requirement_saved', { conversation_id: state.conversation_id }, 'chat');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      scrollEnd();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  const type = typeOf(state?.business_type);
  const done = !!result;

  const footer = (
    <View style={{ gap: Spacing.three, paddingTop: Spacing.two }}>
      {turns.length === 1 && (
        <View style={{ gap: Spacing.two }}>
          <T type="caption" color="textSecondary">
            Try saying
          </T>
          {INTRO[role].examples.map((ex) => (
            <Pressable key={ex} onPress={() => send(ex, 'text')} style={[styles.example, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <T type="small">“{ex}”</T>
            </Pressable>
          ))}
        </View>
      )}

      {state && !done && (state.display.length > 0 || state.missing.length > 0) && (
        <Card>
          <View style={styles.rowBetween}>
            <T type="smallBold">{type ? `${type.label} — ${role === 'seller' ? 'listing' : 'requirement'} summary` : 'What I’ve understood'}</T>
            {state.is_complete ? <Pill label="Complete" color={theme.success} bg={theme.backgroundElement} /> : <Pill label={`${state.missing.length} to go`} color={theme.warning} bg={theme.backgroundElement} />}
          </View>
          {state.display.map((d) => (
            <View key={d.key} style={styles.fieldRow}>
              <Icon name="checkmark-circle" size={16} color={theme.success} />
              <T type="small" color="textSecondary" style={{ width: 130 }}>
                {d.label}
              </T>
              <T type="smallBold" style={{ flex: 1 }}>
                {d.value}
              </T>
            </View>
          ))}
          {state.missing.map((m) => (
            <View key={m.key} style={styles.fieldRow}>
              <Icon name="ellipse-outline" size={16} color={theme.warning} />
              <T type="small" color="textSecondary" style={{ width: 130 }}>
                {m.label}
              </T>
              <T type="small" color="warning" style={{ flex: 1 }}>
                needed
              </T>
            </View>
          ))}
          {state.is_complete && (
            <>
              <T type="small" color="textSecondary">
                {role === 'seller'
                  ? 'Your listing is anonymised — no name or exact address is shown. Our valuation agent will add an indicative price range.'
                  : 'We’ll match you against every listing and keep watching for new ones.'}
              </T>
              <Button
                title={role === 'seller' ? 'Publish listing' : 'Find matches'}
                icon={role === 'seller' ? 'rocket-outline' : 'sparkles-outline'}
                loading={publishing}
                onPress={confirm}
              />
            </>
          )}
        </Card>
      )}

      {result?.role === 'seller' && (
        <Card>
          <View style={styles.rowBetween}>
            <T type="subtitle">🎉 Your listing is live</T>
          </View>
          <ListingCard listing={result.listing} onPress={() => router.push({ pathname: '/listing/[id]', params: { id: result.listing.id } })} />
          <T type="small" color="textSecondary">
            Indicative value {formatRange(result.listing.valuation_low, result.listing.valuation_high)}. {result.listing.valuation_reasoning}
          </T>
          <T type="smallBold" color="primary">
            {result.listing.match_summary?.matches
              ? `Already matched with ${result.listing.match_summary.matches} potential buyer${result.listing.match_summary.matches > 1 ? 's' : ''}.`
              : 'Our matchmaker is watching for buyers.'}
          </T>
          <View style={styles.row}>
            <Button title="Dashboard" variant="secondary" style={{ flex: 1 }} onPress={() => router.replace('/dashboard')} />
            <Button title="See on map" style={{ flex: 1 }} onPress={() => router.replace({ pathname: '/explore', params: { focus: result.listing.id } })} />
          </View>
        </Card>
      )}

      {result?.role === 'buyer' && (
        <Card>
          <T type="subtitle">{result.matches.length ? `✨ ${result.matches.length} matching business${result.matches.length === 1 ? '' : 'es'}` : 'Requirement saved'}</T>
          <T type="small" color="textSecondary">
            {result.matches.length
              ? 'Ranked by our matchmaker agent. Tap one to see details.'
              : 'No current listings fit yet — our watch agent will notify you when one does.'}
          </T>
          {result.matches.map((m) => (
            <ListingCard
              key={m.match_id}
              listing={m}
              score={m.score}
              reasons={m.reasons}
              onPress={() => router.push({ pathname: '/listing/[id]', params: { id: m.listing_id, source: 'match' } })}
            />
          ))}
          <Button title="Get notified of new matches" icon="notifications-outline" variant="secondary" onPress={() => router.push('/contact')} />
          <Button title="Go to dashboard" variant="ghost" onPress={() => router.replace('/dashboard')} />
        </Card>
      )}

      {error && (
        <T type="small" color="danger" style={{ textAlign: 'center' }}>
          {error}
        </T>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: role === 'seller' ? 'Sell a business' : 'Buy a business' }} />
      <FlatList
        ref={listRef}
        data={turns}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={scrollEnd}
        ListFooterComponent={footer}
        renderItem={({ item }) => {
          const mine = item.sender === 'user';
          return (
            <View style={[styles.bubbleRow, mine && { justifyContent: 'flex-end' }]}>
              <View
                style={[
                  styles.bubble,
                  mine
                    ? { backgroundColor: theme.userBubble, borderBottomRightRadius: 4 }
                    : { backgroundColor: theme.agentBubble, borderBottomLeftRadius: 4, borderColor: theme.border, borderWidth: StyleSheet.hairlineWidth },
                ]}>
                {item.pending ? (
                  <ActivityIndicator color={theme.textSecondary} />
                ) : (
                  <RichText text={item.text} color={mine ? '#fff' : theme.text} />
                )}
                {item.input_mode === 'voice' && (
                  <T type="caption" style={{ color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>
                    🎙 voice
                  </T>
                )}
              </View>
            </View>
          );
        }}
      />

      {!done && (
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, Spacing.two), borderTopColor: theme.border, backgroundColor: theme.card }]}>
          {speech.listening && (
            <View style={styles.listening}>
              <Chip label="Listening… tap to stop" selected color={theme.danger} icon="radio-button-on" onPress={speech.stop} />
              {!!speech.partial && (
                <T type="small" color="textSecondary" numberOfLines={2} style={{ flex: 1 }}>
                  {speech.partial}
                </T>
              )}
            </View>
          )}
          {speech.error && (
            <T type="small" color="warning">
              {speech.error}
            </T>
          )}
          <View style={styles.inputRow}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={role === 'seller' ? 'Describe your business…' : 'Describe what you want to buy…'}
              placeholderTextColor={theme.textSecondary}
              multiline
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              onSubmitEditing={() => send(input, 'text')}
              accessibilityLabel="Message"
            />
            {input.trim() ? (
              <Pressable accessibilityLabel="Send" onPress={() => send(input, 'text')} style={[styles.roundBtn, { backgroundColor: theme.primary }]} disabled={busy}>
                <Icon name="arrow-up" color={theme.primaryText} />
              </Pressable>
            ) : (
              <Pressable
                accessibilityLabel={speech.listening ? 'Stop listening' : 'Speak'}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                  if (speech.listening) speech.stop();
                  else void speech.start();
                }}
                disabled={busy}
                style={[styles.roundBtn, styles.micBtn, { backgroundColor: speech.listening ? theme.danger : theme.primary }]}>
                <Icon name={speech.listening ? 'stop' : 'mic'} size={26} color="#fff" />
              </Pressable>
            )}
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  list: { padding: Spacing.three, gap: Spacing.two },
  bubbleRow: { flexDirection: 'row' },
  bubble: { maxWidth: '85%', borderRadius: Radius.lg, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  example: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.three },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.three, paddingTop: Spacing.two, gap: Spacing.two },
  listening: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  input: { flex: 1, minHeight: 48, maxHeight: 120, borderRadius: Radius.lg, paddingHorizontal: 16, paddingTop: 13, paddingBottom: 13, fontSize: 15 },
  roundBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  micBtn: { width: 56, height: 56, borderRadius: 28 },
});
