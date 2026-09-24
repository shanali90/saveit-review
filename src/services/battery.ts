import * as IntentLauncher from 'expo-intent-launcher';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import { Alert, Platform } from 'react-native';

export async function requestBatteryExemption() {
  if (Platform.OS !== 'android') return;

  try {
    const pkg = Application.applicationId;
    // Attempt to open the exact ignore battery optimizations screen for this app
    await IntentLauncher.startActivityAsync(
      'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
      { data: `package:${pkg}` }
    );
  } catch (err) {
    // Fallback if the direct intent is not available on this OEM
    try {
      await IntentLauncher.startActivityAsync(
        'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS'
      );
    } catch {
      // Final fallback to app details settings
      try {
        await IntentLauncher.startActivityAsync(
          IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
          { data: `package:${Application.applicationId}` }
        );
      } catch {
        Alert.alert('Settings Unavailable', 'Could not open battery settings automatically.');
      }
    }
  }
}

export function getOemGuidance(): string | null {
  if (Platform.OS !== 'android') return null;
  const brand = (Device.brand || '').toLowerCase();
  
  if (brand.includes('xiaomi') || brand.includes('redmi') || brand.includes('poco')) {
    return 'On Xiaomi devices, also enable Autostart for SaveIt in your phone\'s Security app for the most reliable reminders.';
  }
  if (brand.includes('oppo') || brand.includes('realme') || brand.includes('oneplus')) {
    return 'On Oppo/OnePlus devices, also ensure "Allow Background Activity" is enabled in App Management for reliable reminders.';
  }
  if (brand.includes('vivo') || brand.includes('iqoo')) {
    return 'On Vivo devices, also ensure SaveIt is allowed to run in the background in your battery settings.';
  }
  
  return null;
}
