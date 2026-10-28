import * as IntentLauncher from 'expo-intent-launcher';
import * as Application from 'expo-application';
import { Alert, Linking, Platform } from 'react-native';

export async function requestBatteryExemption(): Promise<void> {
  if (Platform.OS !== 'android') return;

  const pkg = Application.applicationId;
  if (!pkg) {
    Alert.alert('Error', 'Could not determine the app package name.');
    return;
  }

  try {
    // Direct battery optimization exemption request — shows a simple one-tap
    // system dialog. This is the cleanest path for APK-distributed apps.
    // NOTE: Google Play policy restricts this intent; if this app ever goes
    // to the Play Store, this will need justification in Play Console.
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
      { data: `package:${pkg}` }
    );
  } catch {
    // Fallback: open the full battery optimization settings list
    try {
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS
      );
    } catch {
      // Final fallback: open this app's detail page in system settings
      try {
        await Linking.openSettings();
      } catch {
        Alert.alert(
          'Open Settings Manually',
          'Go to Settings → Apps → SaveIt → Battery → Unrestricted to allow background reminders.'
        );
      }
    }
  }
}
