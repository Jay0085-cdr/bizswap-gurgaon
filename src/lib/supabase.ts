import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session } from '@supabase/supabase-js';
import * as Application from 'expo-application';
import { Platform } from 'react-native';

import { getDeviceId } from '@/lib/device';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isConfigured = Boolean(url && anonKey);

export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'missing', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

let ready: Promise<Session | null> | null = null;

/** Signs in anonymously once per install and upserts the profile row. Safe to call repeatedly. */
export function ensureSession(): Promise<Session | null> {
  if (!isConfigured) return Promise.resolve(null);
  ready ??= (async () => {
    const { data } = await supabase.auth.getSession();
    let session = data.session;
    if (!session) {
      const res = await supabase.auth.signInAnonymously();
      if (res.error) throw res.error;
      session = res.data.session;
    }
    const deviceId = await getDeviceId();
    await supabase.rpc('ensure_profile', {
      p_device_id: deviceId,
      p_platform: Platform.OS,
      p_app_version: Application.nativeApplicationVersion ?? 'web',
    });
    return session;
  })().catch((e) => {
    ready = null;
    console.warn('ensureSession failed', e);
    return null;
  });
  return ready;
}

export async function resetSession() {
  ready = null;
  await supabase.auth.signOut().catch(() => {});
}
