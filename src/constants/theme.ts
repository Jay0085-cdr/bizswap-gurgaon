import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0F172A',
    textSecondary: '#5B6474',
    background: '#F7F8FA',
    card: '#FFFFFF',
    backgroundElement: '#EEF0F4',
    backgroundSelected: '#E2E5EC',
    border: '#E2E5EC',
    primary: '#4F46E5',
    primaryText: '#FFFFFF',
    primarySoft: '#EEF0FF',
    success: '#059669',
    warning: '#D97706',
    danger: '#DC2626',
    userBubble: '#4F46E5',
    agentBubble: '#FFFFFF',
    overlay: 'rgba(15,23,42,0.35)',
  },
  dark: {
    text: '#F1F5F9',
    textSecondary: '#9AA4B5',
    background: '#0B0F17',
    card: '#151B26',
    backgroundElement: '#1C2330',
    backgroundSelected: '#273042',
    border: '#273042',
    primary: '#818CF8',
    primaryText: '#0B0F17',
    primarySoft: '#1E2140',
    success: '#34D399',
    warning: '#FBBF24',
    danger: '#F87171',
    userBubble: '#6366F1',
    agentBubble: '#1C2330',
    overlay: 'rgba(0,0,0,0.5)',
  },
} as const;

export type Palette = { [K in keyof typeof Colors.light]: string };
export type ThemeColor = keyof Palette;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', mono: 'ui-monospace' },
  default: { sans: 'normal', mono: 'monospace' },
  web: { sans: 'system-ui, sans-serif', mono: 'monospace' },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;

export const STAGES = ['draft', 'listed', 'matched', 'contacted', 'in_discussion', 'closed'] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = {
  draft: 'Draft',
  listed: 'Listed',
  matched: 'Matched',
  contacted: 'Contacted',
  in_discussion: 'In Discussion',
  closed: 'Closed',
};
