import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export const APP_VERSION = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? 'dev';
export const APP_BUILD = Application.nativeBuildVersion ?? (Platform.OS === 'web' ? 'web' : 'dev');
