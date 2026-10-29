import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { FeedbackButton } from '@/components/feedback-button';
import { Colors } from '@/constants/theme';
import { ThemePrefProvider, useThemePref } from '@/hooks/use-theme';
import { refreshConfig } from '@/lib/config';
import { ensureSession } from '@/lib/supabase';
import { track } from '@/lib/track';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Root() {
  const { scheme } = useThemePref();
  const c = Colors[scheme];
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, background: c.background, card: c.card, text: c.text, primary: c.primary, border: c.border },
  };

  useEffect(() => {
    ensureSession()
      .then(() => {
        track('app_open');
        return refreshConfig();
      })
      .catch(() => {})
      .finally(() => SplashScreen.hideAsync().catch(() => {}));
  }, []);

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShadowVisible: false, headerStyle: { backgroundColor: c.background }, headerTintColor: c.text }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="chat/[role]" options={({ route }) => ({ title: 'AI assistant', headerRight: () => <FeedbackButton screen={`chat/${(route.params as { role?: string })?.role ?? ''}`} /> })} />
        <Stack.Screen name="listing/[id]" options={{ title: 'Business details', headerRight: () => <FeedbackButton screen="listing" /> }} />
        <Stack.Screen name="requirement/[id]" options={{ title: 'Your search', headerRight: () => <FeedbackButton screen="requirement" /> }} />
        <Stack.Screen name="feedback" options={{ presentation: 'modal', title: 'Feedback' }} />
        <Stack.Screen name="contact" options={{ presentation: 'modal', title: 'Stay updated' }} />
        <Stack.Screen name="privacy" options={{ title: 'Privacy policy' }} />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemePrefProvider>
        <Root />
      </ThemePrefProvider>
    </GestureHandlerRootView>
  );
}
