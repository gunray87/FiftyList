import { Alert, InteractionManager, Linking, Platform } from 'react-native';

const IOS_DEFER_MS = 450;

/**
 * iOS: Alert or other UI shown immediately when the share sheet dismisses can conflict with
 * the view hierarchy and produce a white screen. Run follow-up UI after the transition settles.
 */
export function runAfterShareSheetDismissed(fn: () => void) {
  if (Platform.OS === 'ios') {
    InteractionManager.runAfterInteractions(() => {
      setTimeout(fn, IOS_DEFER_MS);
    });
  } else {
    fn();
  }
}

export function alertAfterShareError(title: string, message: string) {
  runAfterShareSheetDismissed(() => {
    Alert.alert(title, message, [{ text: 'OK' }]);
  });
}

export async function shareExportViaMessages(exportText: string): Promise<boolean> {
  const encodedBody = encodeURIComponent(exportText);
  const smsUrl = Platform.OS === 'ios' ? `sms:&body=${encodedBody}` : `sms:?body=${encodedBody}`;
  const canOpen = await Linking.canOpenURL(smsUrl);
  if (!canOpen) {
    return false;
  }
  await Linking.openURL(smsUrl);
  return true;
}
