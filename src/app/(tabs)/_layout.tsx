import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/tabs';

import { FeedbackButton } from '@/components/feedback-button';
import { useTheme } from '@/hooks/use-theme';

export default function TabsLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border },
        headerStyle: { backgroundColor: theme.background },
        headerShadowVisible: false,
        headerTintColor: theme.text,
      }}>
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="map" color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          headerRight: () => <FeedbackButton screen="dashboard" />,
          tabBarIcon: ({ color, size }) => <Ionicons name="grid" color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          headerRight: () => <FeedbackButton screen="inbox" />,
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications" color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          headerRight: () => <FeedbackButton screen="settings" />,
          tabBarIcon: ({ color, size }) => <Ionicons name="settings" color={color as string} size={size} />,
        }}
      />
    </Tabs>
  );
}

export { ErrorBoundary } from '@/components/error-fallback';
