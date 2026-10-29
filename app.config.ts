// Dynamic layer over app.json. Two knobs, both env-driven so no code changes are needed:
//   APP_PACKAGE_ID  Android package / iOS bundle id (default com.bizswap.gurgaon)
//   EXPO_BASE_URL   web sub-path for static hosting, e.g. /bizswap-gurgaon on GitHub Pages (web only)
import type { ConfigContext, ExpoConfig } from 'expo/config';

export const PACKAGE_ID = process.env.APP_PACKAGE_ID || 'com.bizswap.gurgaon';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  android: { ...config.android, package: PACKAGE_ID },
  ios: { ...config.ios, bundleIdentifier: PACKAGE_ID },
  experiments: { ...config.experiments, ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}) },
});
