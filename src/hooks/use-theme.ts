/**
 * Theme with a user override (system / light / dark), persisted locally.
 * https://docs.expo.dev/guides/color-schemes/
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { Colors, type Palette } from '@/constants/theme';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'bizswap.themePref';

type Ctx = { pref: ThemePref; setPref: (p: ThemePref) => void; scheme: 'light' | 'dark' };
const ThemePrefContext = createContext<Ctx>({ pref: 'system', setPref: () => {}, scheme: 'light' });

export function ThemePrefProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<ThemePref>('system');

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => v && setPrefState(v as ThemePref))
      .catch(() => {});
  }, []);

  const setPref = (p: ThemePref) => {
    setPrefState(p);
    AsyncStorage.setItem(KEY, p).catch(() => {});
  };

  const scheme = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
  return createElement(ThemePrefContext.Provider, { value: { pref, setPref, scheme } }, children);
}

export function useThemePref() {
  return useContext(ThemePrefContext);
}

export function useTheme(): Palette {
  return Colors[useContext(ThemePrefContext).scheme];
}
