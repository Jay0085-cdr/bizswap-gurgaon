import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { Button, Empty, Icon, T, type IconName } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ensureSession, supabase } from '@/lib/supabase';
import { track } from '@/lib/track';

type Note = {
  id: string;
  kind: string;
  title: string;
  body: string;
  payload: { listing_id?: string; requirement_id?: string; match_id?: string };
  read_at: string | null;
  created_at: string;
};

const ICON: Record<string, IconName> = {
  match: 'sparkles',
  buyer_match: 'people',
  interest: 'hand-right',
  published: 'rocket',
};

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function Inbox() {
  const theme = useTheme();
  const [notes, setNotes] = useState<Note[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    await ensureSession();
    const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100);
    setNotes((data ?? []) as Note[]);
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const open = async (n: Note) => {
    if (!n.read_at) {
      setNotes((ns) => ns.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      void supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id);
    }
    track('notification_open', { kind: n.kind }, 'inbox');
    if (n.kind === 'match' && n.payload.listing_id)
      router.push({ pathname: '/listing/[id]', params: { id: n.payload.listing_id, source: 'inbox' } });
    else if (n.payload.listing_id) router.push({ pathname: '/listing/[id]', params: { id: n.payload.listing_id } });
    else if (n.payload.requirement_id) router.push({ pathname: '/requirement/[id]', params: { id: n.payload.requirement_id } });
  };

  const unread = notes.filter((n) => !n.read_at).length;
  const markAll = async () => {
    const now = new Date().toISOString();
    setNotes((ns) => ns.map((n) => ({ ...n, read_at: n.read_at ?? now })));
    await supabase.from('notifications').update({ read_at: now }).is('read_at', null);
  };

  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      data={notes}
      keyExtractor={(n) => n.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
      ListHeaderComponent={unread ? <Button title={`Mark ${unread} as read`} variant="ghost" onPress={markAll} /> : undefined}
      ListEmptyComponent={
        loaded ? (
          <Empty
            icon="notifications-outline"
            title="Nothing yet"
            body="When our agents find a match, or a buyer is interested in your listing, it shows up here."
          />
        ) : undefined
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => open(item)}
          style={({ pressed }) => [styles.row, { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.85 : 1 }]}>
          <View style={[styles.icon, { backgroundColor: theme.primarySoft }]}>
            <Icon name={ICON[item.kind] ?? 'notifications'} size={18} color={theme.primary} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T type="smallBold">{item.title}</T>
            <T type="small" color="textSecondary" numberOfLines={2}>
              {item.body}
            </T>
            <T type="caption" color="textSecondary">
              {ago(item.created_at)}
            </T>
          </View>
          {!item.read_at && <View style={[styles.dot, { backgroundColor: theme.primary }]} />}
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.two, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
});

export { ErrorBoundary } from '@/components/error-fallback';
