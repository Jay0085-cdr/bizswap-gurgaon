// Route-level error boundary (Expo Router picks up `export { ErrorBoundary }` from any route file).
// A render error shows a friendly screen with retry instead of crashing, and is logged as a client_error event.
import { router, usePathname, type ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Button, Icon, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { APP_BUILD, APP_VERSION } from '@/lib/app-info';
import { track } from '@/lib/track';

export function logClientError(error: unknown, source: string, screen?: string, fatal = false) {
  const e = error instanceof Error ? error : new Error(String(error));
  track('client_error', { message: e.message.slice(0, 500), stack: e.stack?.slice(0, 1500), source, fatal, app_version: APP_VERSION, build: APP_BUILD, platform: Platform.OS }, screen);
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const theme = useTheme();
  const path = usePathname();

  useEffect(() => {
    logClientError(error, 'boundary', path);
  }, [error, path]);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Icon name="construct-outline" size={48} color={theme.primary} />
      <T type="heading" style={{ textAlign: 'center' }}>
        Oops — this screen hit a snag
      </T>
      <T color="textSecondary" style={{ textAlign: 'center' }}>
        We’ve logged it automatically so we can fix it. Try again, or head back to the map.
      </T>
      <Button title="Try again" icon="refresh" onPress={() => void retry()} />
      <Button title="Go to map" variant="ghost" onPress={() => router.replace('/explore')} />
    </View>
  );
}

/** Logs uncaught JS errors (outside render) before the default handler runs. Call once at startup. */
export function installGlobalErrorLogging() {
  if (Platform.OS === 'web') {
    window.addEventListener('error', (e) => logClientError(e.error ?? e.message, 'window'));
    window.addEventListener('unhandledrejection', (e) => logClientError(e.reason, 'promise'));
    return;
  }
  type Handler = (e: unknown, fatal?: boolean) => void;
  const eu = (globalThis as { ErrorUtils?: { getGlobalHandler(): Handler; setGlobalHandler(h: Handler): void } }).ErrorUtils;
  if (!eu) return;
  const prev = eu.getGlobalHandler();
  eu.setGlobalHandler((e, fatal) => {
    logClientError(e, 'global', undefined, !!fatal);
    // give the log a moment to leave the device before a fatal error tears the app down
    if (fatal) setTimeout(() => prev(e, fatal), 800);
    else prev(e, fatal);
  });
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
});
