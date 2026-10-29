// Dynamic layer over app.json.
//   PACKAGE_ID     Android package / iOS bundle id. Change it HERE ONLY (or set APP_PACKAGE_ID in eas.json → build.base.env,
//                  since EAS evaluates this file on its build servers, not with your local shell env).
//   EXPO_BASE_URL  web sub-path for static hosting, e.g. /bizswap-gurgaon on GitHub Pages (web only)
import type { ConfigContext, ExpoConfig } from 'expo/config';

export const PACKAGE_ID = process.env.APP_PACKAGE_ID || 'com.bizswap.gurgaon';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  android: { ...config.android, package: PACKAGE_ID },
  ios: { ...config.ios, bundleIdentifier: PACKAGE_ID },
  experiments: { ...config.experiments, ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}) },
});
