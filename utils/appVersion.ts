import Constants from 'expo-constants';
import { Platform } from 'react-native';

export function getAppVersion(): string {
  return (
    Constants.expoConfig?.version ??
    Constants.nativeApplicationVersion ??
    '1.5.4'
  );
}

export function getAppBuildNumber(): string | null {
  if (Platform.OS === 'ios') {
    return (
      Constants.expoConfig?.ios?.buildNumber ??
      Constants.nativeBuildVersion ??
      null
    );
  }
  if (Platform.OS === 'android') {
    const code = Constants.expoConfig?.android?.versionCode;
    return code != null ? String(code) : null;
  }
  return null;
}

/** User-facing version string; includes build number when available. */
export function getAppVersionLabel(options?: { includeBuild?: boolean }): string {
  const version = getAppVersion();
  const build = getAppBuildNumber();
  const includeBuild = options?.includeBuild !== false;
  if (includeBuild && build) {
    return `Version ${version} (${build})`;
  }
  return `Version ${version}`;
}
