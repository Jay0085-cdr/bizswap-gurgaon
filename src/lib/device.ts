import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const KEY = 'bizswap.deviceId';
let cached: string | null = null;

/** Anonymous, install-scoped device id (no hardware identifiers, no permissions). */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  let id: string | null = null;
  try {
    id = await AsyncStorage.getItem(KEY);
  } catch {}
  if (!id) {
    id = Crypto.randomUUID();
    AsyncStorage.setItem(KEY, id).catch(() => {});
  }
  cached = id;
  return id;
}
