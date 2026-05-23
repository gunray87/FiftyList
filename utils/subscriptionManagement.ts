import { Linking, Platform } from 'react-native';

/** Opens the platform subscription management screen (App Store / Play). */
export async function openSubscriptionManagement(): Promise<boolean> {
  const url =
    Platform.OS === 'ios'
      ? 'https://apps.apple.com/account/subscriptions'
      : Platform.OS === 'android'
        ? 'https://play.google.com/store/account/subscriptions'
        : null;

  if (!url) return false;

  try {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
