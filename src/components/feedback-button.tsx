import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { Icon } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';

/** Opens the feedback sheet, tagged with the screen it was opened from. */
export function FeedbackButton({ screen }: { screen: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Send feedback"
      hitSlop={10}
      onPress={() => router.push({ pathname: '/feedback', params: { screen } })}
      style={({ pressed }) => ({ paddingHorizontal: 8, opacity: pressed ? 0.6 : 1 })}>
      <Icon name="chatbox-ellipses-outline" size={22} color={theme.primary} />
    </Pressable>
  );
}
