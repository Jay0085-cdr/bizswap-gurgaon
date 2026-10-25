import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';

import { Radius, Spacing, STAGE_LABEL, STAGES, type Stage, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 20, color }: { name: IconName | string; size?: number; color?: string }) {
  const theme = useTheme();
  return <Ionicons name={name as IconName} size={size} color={color ?? theme.text} />;
}

type TType = 'title' | 'heading' | 'subtitle' | 'default' | 'small' | 'smallBold' | 'caption';

export function T({
  type = 'default',
  color,
  style,
  ...rest
}: TextProps & { type?: TType; color?: ThemeColor }) {
  const theme = useTheme();
  return <Text style={[{ color: theme[color ?? 'text'] }, text[type], style]} {...rest} />;
}

const text = StyleSheet.create({
  title: { fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.5 },
  heading: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  subtitle: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  default: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  small: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  smallBold: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  caption: { fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
});

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const theme = useTheme();
  const base = [styles.card, { backgroundColor: theme.card, borderColor: theme.border }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.85 }]}>
      {children}
    </Pressable>
  );
}

export function Button({
  title,
  icon,
  variant = 'primary',
  loading,
  disabled,
  style,
  ...rest
}: PressableProps & {
  title: string;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const bg = { primary: theme.primary, secondary: theme.backgroundElement, ghost: 'transparent', danger: theme.danger }[variant];
  const fg = { primary: theme.primaryText, secondary: theme.text, ghost: theme.primary, danger: '#fff' }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color={fg} />}
          <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  color,
  icon,
  onPress,
}: {
  label: string;
  selected?: boolean;
  color?: string;
  icon?: string;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const accent = color ?? theme.primary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? accent : theme.card,
          borderColor: selected ? accent : theme.border,
        },
      ]}>
      {icon && <Ionicons name={icon as IconName} size={14} color={selected ? '#fff' : accent} />}
      <Text style={[styles.chipText, { color: selected ? '#fff' : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Pill({ label, color, bg }: { label: string; color?: string; bg?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: bg ?? theme.primarySoft }]}>
      <Text style={[styles.pillText, { color: color ?? theme.primary }]}>{label}</Text>
    </View>
  );
}

export function StageBadge({ stage }: { stage: Stage }) {
  const theme = useTheme();
  const color =
    stage === 'closed' ? theme.textSecondary : stage === 'draft' ? theme.warning : stage === 'listed' ? theme.primary : theme.success;
  return <Pill label={STAGE_LABEL[stage] ?? stage} color={color} bg={theme.backgroundElement} />;
}

export function StageStepper({ stage }: { stage: Stage }) {
  const theme = useTheme();
  const idx = STAGES.indexOf(stage);
  return (
    <View style={styles.stepper} accessibilityLabel={`Stage: ${STAGE_LABEL[stage]}`}>
      {STAGES.map((s, i) => (
        <View key={s} style={styles.step}>
          <View style={[styles.stepBar, { backgroundColor: i <= idx ? theme.primary : theme.backgroundSelected }]} />
          <Text numberOfLines={1} style={[styles.stepLabel, { color: i === idx ? theme.text : theme.textSecondary, fontWeight: i === idx ? '700' : '400' }]}>
            {STAGE_LABEL[s]}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <T type="caption" color="textSecondary">
        {label}
      </T>
      <T type="subtitle">{value}</T>
    </View>
  );
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.primarySoft }]}>
        <Ionicons name={icon} size={28} color={theme.primary} />
      </View>
      <T type="subtitle" style={{ textAlign: 'center' }}>
        {title}
      </T>
      {body && (
        <T color="textSecondary" style={{ textAlign: 'center' }}>
          {body}
        </T>
      )}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.three, gap: Spacing.two },
  button: {
    minHeight: 48,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  chipText: { fontSize: 14, fontWeight: '600' },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: Radius.pill, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '700' },
  stepper: { flexDirection: 'row', gap: 4 },
  step: { flex: 1, gap: 4 },
  stepBar: { height: 4, borderRadius: 2 },
  stepLabel: { fontSize: 9 },
  stat: { flex: 1, minWidth: 110, gap: 2 },
  empty: { alignItems: 'center', gap: Spacing.two, padding: Spacing.five },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.two },
});
