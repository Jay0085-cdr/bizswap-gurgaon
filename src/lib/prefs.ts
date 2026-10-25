import AsyncStorage from '@react-native-async-storage/async-storage';

export type RolePref = 'seller' | 'buyer' | 'browse';
const ROLE_KEY = 'bizswap.rolePref';

export async function getRolePref(): Promise<RolePref | null> {
  try {
    return (await AsyncStorage.getItem(ROLE_KEY)) as RolePref | null;
  } catch {
    return null;
  }
}

export async function setRolePref(role: RolePref | null) {
  try {
    if (role) await AsyncStorage.setItem(ROLE_KEY, role);
    else await AsyncStorage.removeItem(ROLE_KEY);
  } catch {}
}
