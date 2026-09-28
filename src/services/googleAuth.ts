/**
 * Native Google Sign-In via @react-native-google-signin/google-signin.
 *
 * Provides a native bottom-sheet account picker on Android (Credential Manager)
 * instead of the web browser redirect that shows "kgojekwxmgdswifsdlre.supabase.co".
 *
 * Safety net: if Google Play Services are missing, the native call errors, or it
 * times out, the caller falls back to the existing WebBrowser OAuth flow unchanged.
 *
 * OTA kill-switch: set USE_NATIVE_GOOGLE_SIGNIN = false to disable the native
 * path entirely without a native rebuild.
 */
import { Platform } from 'react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

// ── Kill switch (OTA-able) ──────────────────────────────────────────
export const USE_NATIVE_GOOGLE_SIGNIN = true;

// ── Timeout for native sign-in (prevents hanging) ───────────────────
const NATIVE_SIGNIN_TIMEOUT_MS = 15_000;

type NativeSignInResult =
  | { status: 'success'; idToken: string }
  | { status: 'cancelled' }
  | { status: 'unavailable'; reason: string };

/**
 * Attempt native Google sign-in. Returns an ID token on success,
 * 'cancelled' if the user dismissed the picker, or 'unavailable'
 * if Google Play Services are missing or the call failed.
 *
 * The `webClientId` is the same Web OAuth Client ID used for the
 * Supabase Google provider — NOT an Android-specific client ID.
 */
export async function nativeGoogleSignIn(webClientId: string): Promise<NativeSignInResult> {
  if (!USE_NATIVE_GOOGLE_SIGNIN || Platform.OS !== 'android') {
    return { status: 'unavailable', reason: 'Native sign-in disabled or not Android' };
  }

  try {
    GoogleSignin.configure({
      webClientId,
      offlineAccess: false,
    });

    // Check Google Play Services availability
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: false });
    } catch {
      return { status: 'unavailable', reason: 'Google Play Services not available' };
    }

    // Race the sign-in against a timeout
    const signInPromise = GoogleSignin.signIn();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Native sign-in timed out')), NATIVE_SIGNIN_TIMEOUT_MS)
    );

    const userInfo = await Promise.race([signInPromise, timeoutPromise]);
    const idToken = (userInfo as any)?.data?.idToken ?? (userInfo as any)?.idToken ?? null;

    if (!idToken) {
      return { status: 'unavailable', reason: 'No ID token returned from Google' };
    }

    return { status: 'success', idToken };
  } catch (error: any) {
    // User cancelled the picker
    if (
      error?.code === 'SIGN_IN_CANCELLED' ||
      error?.code === statusCodes.SIGN_IN_CANCELLED ||
      error?.code === '12501' ||
      error?.message?.includes('SIGN_IN_CANCELLED')
    ) {
      return { status: 'cancelled' };
    }

    // Any other error — fall back to web flow
    return {
      status: 'unavailable',
      reason: error?.message || 'Unknown native sign-in error',
    };
  }
}

/**
 * Sign out from the native Google session so the next sign-in
 * shows the account picker again instead of auto-selecting.
 */
export async function nativeGoogleSignOut(): Promise<void> {
  if (!USE_NATIVE_GOOGLE_SIGNIN || Platform.OS !== 'android') return;

  try {
    await GoogleSignin.signOut();
  } catch {
    // Best-effort cleanup.
  }
}
