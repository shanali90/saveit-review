import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useShareIntent } from 'expo-share-intent';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, AppState, Easing, NativeModules, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppTab, BottomNav } from '@/components/BottomNav';
import { ItemDetailSheet } from '@/components/ItemDetailSheet';
import { QuickSaveModal } from '@/components/QuickSaveModal';
import { UpdateModal } from '@/components/UpdateModal';
import { colors, radii, shadow } from '@/constants/theme';
import { useSavedItems } from '@/hooks/useSavedItems';
import {
  configureNotificationActions,
  cleanupLegacyQuickReminders,
  ensureDailyReminderScheduled,
  listenForNotificationResponses,
  requestNotificationAccess
} from '@/services/notifications';
import { readOnboarded, writeOnboarded } from '@/services/storage';
import { getPersistedUserId, isSupabaseConfigured, runMigrations, supabase } from '@/services/supabase';
import { extractFirstUrl } from '@/services/url';
import { nativeGoogleSignIn, nativeGoogleSignOut } from '@/services/googleAuth';
import { DiscoverScreen } from '@/screens/DiscoverScreen';
import { HomeScreen } from '@/screens/HomeScreen';
import { GuideScreen } from '@/screens/GuideScreen';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { AppRelease, checkForUpdate, fetchCurrentRelease } from '@/services/updateChecker';
import { WhatsNewModal } from '@/components/WhatsNewModal';
import * as Updates from 'expo-updates';
import { SavedItem } from '@/types';

WebBrowser.maybeCompleteAuthSession();
SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function App() {
  const shareIntentState = useShareIntent({ scheme: 'saveit' });

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <SaveItApp shareIntentState={shareIntentState} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

type ShareIntentState = ReturnType<typeof useShareIntent>;

function SaveItApp({ shareIntentState }: { shareIntentState: ShareIntentState }) {
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured || !supabase);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const {
    items,
    settings,
    isReady,
    errors,
    unwatchedCount,
    doneCount,
    saveDraft,
    updateItem,
    markDone,
    markUnwatched,
    deleteItem,
    snoozeItem,
    clearDone,
    clearAllData,
    changeCategory,
    updateSettings,
    dismissError,
    checkSharedSaves,
    syncNow,
    mode
  } = useSavedItems({ authReady, authUserId });

  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [quickSaveVisible, setQuickSaveVisible] = useState(false);
  const [isShareMode, setIsShareMode] = useState(false);
  const [incomingUrl, setIncomingUrl] = useState<string | undefined>();
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [celebratingId, setCelebratingId] = useState<string | null>(null);
  const [updateRelease, setUpdateRelease] = useState<AppRelease | null>(null);
  const [tutorialReplay, setTutorialReplay] = useState(false);
  const [guideVisible, setGuideVisible] = useState(false);

  // Refs for notification response handler — avoids putting items/snoozeItem/deleteItem
  // in the useEffect dependency array, which was causing the action→re-render→re-mount→
  // re-fire loop that made notification actions fire repeatedly.
  const notifItemsRef = useRef<SavedItem[]>([]);
  const snoozeItemRef = useRef(snoozeItem);
  const deleteItemRef = useRef(deleteItem);
  const [notificationDenied, setNotificationDenied] = useState(false);
  const [showOverlayPrompt, setShowOverlayPrompt] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [bootReady, setBootReady] = useState(false);
  const [jsSurfaceReady, setJsSurfaceReady] = useState(false);
  const insets = useSafeAreaInsets();
  const lastShareRef = useRef<string | null>(null);
  const nativeSplashHiddenRef = useRef(false);
  const { hasShareIntent, shareIntent, resetShareIntent, error: shareIntentError } = shareIntentState;
  const [whatsNewRelease, setWhatsNewRelease] = useState<AppRelease | null>(null);
  const [minSplashDone, setMinSplashDone] = useState(false);
  const initialUrl = Linking.useURL();

  // Enforce a 2-second minimum splash screen for brand visibility
  useEffect(() => {
    const timer = setTimeout(() => setMinSplashDone(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  // Keep refs current on every render
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { notifItemsRef.current = items; }, [items]);
  useEffect(() => { snoozeItemRef.current = snoozeItem; }, [snoozeItem]);
  useEffect(() => { deleteItemRef.current = deleteItem; }, [deleteItem]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? null,
    [items, selectedItemId]
  );

  const handleMarkDone = useCallback(async (itemId: string) => {
    setCelebratingId(itemId);
    setTimeout(() => {
      markDone(itemId)
        .catch(() => undefined)
        .finally(() => setCelebratingId(null));
    }, 320);
  }, [markDone]);

  useEffect(() => {
    let mounted = true;
    async function boot() {
      try {
        const alreadyOnboarded = await readOnboarded();
        if (mounted) setOnboarded(alreadyOnboarded);
      } catch {
        if (mounted) setOnboarded(false);
      } finally {
        if (mounted) setBootReady(true);
      }

      configureNotificationActions().catch(() => {
        // Reminder setup is retried later and should not force onboarding to re-run.
      });
      cleanupLegacyQuickReminders().catch(() => undefined);
    }
    boot();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!authReady) return;
    let mounted = true;

    // Check for app updates only after auth state is restored
    // This ensures any RLS policies on app_releases don't fail for authenticated users.
    checkForUpdate().then((release) => {
      if (!mounted) return;
      if (release) {
        setUpdateRelease(release);
      } else {
        const currentUpdateId = Updates.updateId;
        if (currentUpdateId) {
          AsyncStorage.getItem('whats_new:shown_update_id_v3').then(async (shownId) => {
            if (shownId !== currentUpdateId) {
              const currentRelease = await fetchCurrentRelease();
              if (mounted) {
                if (currentRelease && currentRelease.release_notes) {
                  setWhatsNewRelease(currentRelease);
                } else {
                  AsyncStorage.setItem('whats_new:shown_update_id_v3', currentUpdateId).catch(() => {});
                }
              }
            }
          }).catch(() => {});
        }
      }
    });

    return () => { mounted = false; };
  }, [authReady]);

  useEffect(() => {
    if (!bootReady || !jsSurfaceReady || nativeSplashHiddenRef.current) return;
    nativeSplashHiddenRef.current = true;
    requestAnimationFrame(() => {
      SplashScreen.hideAsync().catch(() => undefined);
    });
  }, [bootReady, jsSurfaceReady]);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    let mounted = true;
    const AUTH_TIMEOUT_MS = 5000;

    // PRIORITY 0 FIX — OFFLINE AUTH-STATE RESOLUTION
    // Step 1: Read the persisted user ID directly from AsyncStorage FIRST.
    // This is instant and never requires network. If a signed-in session
    // exists locally (even with an expired access token), we set authUserId
    // immediately — so the app knows "this is an authenticated user" before
    // any network call. This prevents the Demo Mode fallback when offline.
    getPersistedUserId()
      .then((persistedUserId) => {
        if (!mounted) return;
        if (persistedUserId) {
          // Set auth state from local storage — the user IS signed in,
          // even if the token is expired and can't be refreshed right now.
          setAuthUserId(persistedUserId);
          setAuthReady(true);
          writeOnboarded(true).catch(() => undefined);
          setOnboarded(true);
        }

        // Step 2: Still attempt getSession() to get a fresh/validated session.
        // If the token is valid or can be refreshed, this returns immediately.
        // If offline with expired token, it hangs — the timeout catches that.
        const sessionPromise = supabase!.auth.getSession();
        const timeoutPromise = new Promise<{ data: { session: null } }>(
          (resolve) => setTimeout(() => resolve({ data: { session: null } }), AUTH_TIMEOUT_MS)
        );

        return Promise.race([sessionPromise, timeoutPromise])
          .then(({ data }) => {
            if (!mounted) return;
            const freshUserId = data.session?.user.id ?? null;
            if (freshUserId) {
              // Fresh session available — use it (may be same as persisted)
              setAuthUserId(freshUserId);
              setAuthReady(true);
              writeOnboarded(true).catch(() => undefined);
              setOnboarded(true);
            } else if (!persistedUserId) {
              // No fresh session AND no persisted session — genuinely not signed in.
              setAuthReady(true);
            }
            // If freshUserId is null BUT persistedUserId exists, we keep the
            // persisted value (already set above). The timeout lost the race,
            // but we know the user is signed in from local storage.
          })
          .catch(() => {
            if (mounted && !persistedUserId) {
              // getSession() threw AND no persisted session — allow demo mode.
              setAuthReady(true);
            }
            // If persistedUserId exists, auth is already set — nothing more to do.
          });
      })
      .catch(() => {
        // getPersistedUserId() failed — fall back to the original flow.
        if (mounted) setAuthReady(true);
      });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setAuthUserId(null);
        return;
      }
      
      const userId = session?.user.id ?? null;
      if (userId) {
        setAuthUserId(userId);
        setAuthReady(true);
        writeOnboarded(true).catch(() => undefined);
        setOnboarded(true);
      }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authUserId) return;
    runMigrations().catch(() => {
      // Authenticated data calls still surface normal errors later; demo mode never runs migrations.
    });
  }, [authUserId]);

  useEffect(() => {
    let mounted = true;

    async function checkOverlayPrompt() {
      try {
        const alreadyShown = await AsyncStorage.getItem(OVERLAY_PROMPT_SHOWN_KEY);
        if (alreadyShown === 'true') return;
        const granted = await SaveItOverlay?.canDrawOverlays?.();
        if (mounted && granted === false) {
          setShowOverlayPrompt(true);
        }
      } catch {
        // Overlay permission is an Android enhancement; never block the core app.
      }
    }

    if (onboarded) checkOverlayPrompt();
    return () => {
      mounted = false;
    };
  }, [onboarded]);

  useEffect(() => {
    if (!isReady) return;

    let cancelled = false;
    async function drainOverlayQueue() {
      try {
        const importedCount = await checkSharedSaves();
        if (!cancelled && importedCount > 0) {
          setToast(importedCount === 1 ? 'Imported 1 quick save' : `Imported ${importedCount} quick saves`);
        }
      } catch {
        // Keep foregrounding smooth even if the queue cannot be read.
      }
    }

    drainOverlayQueue();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        drainOverlayQueue();
        ensureDailyReminderScheduled(notifItemsRef.current, settingsRef.current).catch(() => undefined);
      }
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [checkSharedSaves, isReady]);

  useEffect(() => {
    if (!isReady || !settings.notifications_enabled) return;
    requestNotificationAccess()
      .then((granted) => setNotificationDenied(!granted))
      .catch(() => setNotificationDenied(true));
  }, [isReady, settings.notifications_enabled]);

  // Self-healing: re-schedule daily reminder if Android killed it
  useEffect(() => {
    if (!isReady) return;
    ensureDailyReminderScheduled(items, settings).catch(() => undefined);
  }, [isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // SECTION 1 FIX: Notification response handler uses refs instead of direct
  // state values. This removes items/snoozeItem/deleteItem from the deps,
  // preventing the loop: action → items change → useEffect re-mount →
  // getLastNotificationResponseAsync() re-fires → same action re-runs.
  //
  // Only handleMarkDone remains as a dep (stable via useCallback with [markDone]).
  // The effect mounts ONCE and the listener + cold-start check run exactly once.
  useEffect(() => {
    const subscription = listenForNotificationResponses({
      markDone: handleMarkDone,
      snooze: async (itemId) => {
        const item = notifItemsRef.current.find((candidate) => candidate.id === itemId);
        if (item && item.snooze_count >= 4) {
          Alert.alert("You've snoozed this 5 times.", 'Remove it from your library?', [
            { text: 'Keep it', style: 'cancel', onPress: () => snoozeItemRef.current(itemId) },
            { text: 'Remove', style: 'destructive', onPress: () => deleteItemRef.current(itemId) }
          ]);
        } else {
          await snoozeItemRef.current(itemId);
        }
      },
      focusItem: (itemId) => {
        setActiveTab('home');
        setSelectedItemId(itemId);
      }
    });
    return () => subscription.remove();
  }, [handleMarkDone]);

  useEffect(() => {
    if (!hasShareIntent) return;
    const shared = extractShareIntentUrl(shareIntent);
    if (shared && shared !== lastShareRef.current) {
      lastShareRef.current = shared;
      setIsShareMode(true);
      setIncomingUrl(shared);
      setQuickSaveVisible(true);
    }
    resetShareIntent();
  }, [hasShareIntent, resetShareIntent, shareIntent]);

  useEffect(() => {
    function handleDeepLink(urlStr: string | null) {
      if (!urlStr) return;
      try {
        const parsed = Linking.parse(urlStr);
        const isShareLink = parsed.hostname === 'share' || parsed.path === 'share';
        if (isShareLink && parsed.queryParams?.url) {
          const sharedUrl = parsed.queryParams.url as string;
          if (!sharedUrl.startsWith('http://') && !sharedUrl.startsWith('https://')) return;
          if (sharedUrl.length > 2048) return;
          if (sharedUrl && sharedUrl !== lastShareRef.current) {
            lastShareRef.current = sharedUrl;
            setIsShareMode(true);
            setIncomingUrl(sharedUrl);
            setQuickSaveVisible(true);
          }
        }
      } catch {
        // Ignore invalid URLs
      }
    }

    // Handle cold start
    handleDeepLink(initialUrl);

    // Handle incoming links while app is alive
    const subscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    return () => subscription.remove();
  }, [initialUrl]);

  useEffect(() => {
    if (shareIntentError) setToast('Could not read shared content');
  }, [shareIntentError]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  const completeOnboarding = useCallback(async (provider: 'google' | 'local') => {
    if (provider === 'google') {
      if (!isSupabaseConfigured || !supabase) {
        Alert.alert('Sign-in unavailable', 'Google sign-in is not configured for this build yet.');
        return;
      }

      try {
        // Native Google Sign-In Flow
        const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '141400262143-6c89l9oavd2q0e8v8o2781s6c1cmlc4k.apps.googleusercontent.com'; // Fallback to a placeholder if not in env
        
        const nativeResult = await nativeGoogleSignIn(webClientId);

        if (nativeResult.status === 'success') {
          const { data, error } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: nativeResult.idToken,
          });

          if (error) throw error;
          
          setAuthUserId(data.session?.user.id ?? null);
          setAuthReady(true);
          await writeOnboarded(true);
          setOnboarded(true);
          return;
        } else if (nativeResult.status === 'cancelled') {
          return; // User aborted
        }

        // Fall back to web OAuth flow
        console.log('[SaveIt] Falling back to web OAuth flow:', nativeResult.status === 'unavailable' ? nativeResult.reason : '');
        
        const redirectTo = 'saveit://auth/callback';
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            skipBrowserRedirect: true
          }
        });
        if (error) throw error;
        if (!data.url) throw new Error('Missing Google auth URL');

        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type !== 'success') return;

        const code = extractAuthCode(result.url);
        if (!code) throw new Error('Missing Google auth code');

        const { data: sessionData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;

        setAuthUserId(sessionData.session?.user.id ?? null);
        setAuthReady(true);
        await writeOnboarded(true);
        setOnboarded(true);
        return;
      } catch (error) {
        const msg = errorMessage(error);
        const isConfigError = msg.toLowerCase().includes('provider') ||
          msg.toLowerCase().includes('not enabled') ||
          msg.toLowerCase().includes('not configured') ||
          msg.toLowerCase().includes('unauthorized');
        Alert.alert(
          'Google sign-in failed',
          isConfigError
            ? 'Google sign-in is not configured for this build yet. The Supabase project needs a Google OAuth Client ID and Secret saved under Authentication → Providers → Google.'
            : `Google sign-in failed: ${msg}`
        );
        return;
      }
    }

    await writeOnboarded(true);
    setOnboarded(true);
  }, []);

  const handleClearAllData = useCallback(async () => {
    try {
      await clearAllData();
      setSelectedItemId(null);
      setToast(mode === 'authenticated' ? 'Cloud data cleared' : 'Demo data cleared');
    } catch {
      Alert.alert('Could not clear data', 'Please try again once you are online.');
    }
  }, [clearAllData, mode]);

  const handleSignOut = useCallback(async () => {
    try {
      if (supabase) await supabase.auth.signOut();
      await nativeGoogleSignOut();
      setAuthUserId(null);
      setSelectedItemId(null);
      await writeOnboarded(true);
      setOnboarded(true);
      setToast('Signed out. Demo mode is active.');
    } catch {
      setToast('Could not sign out right now');
    }
  }, []);

  const handleRequestNotifications = useCallback(async () => {
    try {
      const granted = await requestNotificationAccess();
      setNotificationDenied(!granted);
      if (granted) {
        await updateSettings({ notifications_enabled: true });
        setToast('Reminders enabled');
      }
    } catch {
      setNotificationDenied(true);
    }
  }, [updateSettings]);

  const handleDismissOverlayPrompt = useCallback(async () => {
    setShowOverlayPrompt(false);
    try {
      await AsyncStorage.setItem(OVERLAY_PROMPT_SHOWN_KEY, 'true');
    } catch {
      // Non-critical preference.
    }
  }, []);

  const handleOpenOverlaySettings = useCallback(async () => {
    await handleDismissOverlayPrompt();
    try {
      await SaveItOverlay?.openOverlaySettings?.();
    } catch {
      Alert.alert('Permission settings unavailable', 'Open Android settings and allow SaveIt to appear on top.');
    }
  }, [handleDismissOverlayPrompt]);

  const showNotificationBanner =
    notificationDenied &&
    settings.notifications_enabled &&
    shouldShowPermissionBanner(settings.notification_permission_banner_last_seen);

  const handleJsSurfaceReady = useCallback(() => {
    setJsSurfaceReady(true);
  }, []);

  if (onboarded === null || !authReady || !isReady || !minSplashDone) {
    return <LoadingScreen onReady={handleJsSurfaceReady} />;
  }

  if (!onboarded && !authUserId && !isShareMode) {
    return (
      <View style={styles.shell} onLayout={handleJsSurfaceReady}>
        <StatusBar style="dark" />
        <OnboardingScreen 
          onComplete={(provider) => {
            if (tutorialReplay) {
              setTutorialReplay(false);
              setOnboarded(true);
            } else {
              completeOnboarding(provider);
            }
          }} 
          onRequestNotifications={handleRequestNotifications} 
          isReplay={tutorialReplay}
        />
      </View>
    );
  }

  return (
    <View style={styles.shell} onLayout={handleJsSurfaceReady}>
      <StatusBar style="dark" />
      <View style={styles.screen}>
        {activeTab === 'home' && (
          <HomeScreen
            celebratingId={celebratingId}
            errors={errors}
            items={items}
            onDismissError={dismissError}
            onDismissNotificationBanner={() =>
              updateSettings({ notification_permission_banner_last_seen: new Date().toISOString() })
            }
            onMarkDone={handleMarkDone}
            onMarkUnwatched={markUnwatched}
            onDeleteItem={deleteItem}
            onOpenItem={(item: SavedItem) => setSelectedItemId(item.id)}
            onOpenQuickSave={() => {
              setIncomingUrl(undefined);
              setQuickSaveVisible(true);
            }}
            onOpenSettings={() => setActiveTab('settings')}
            onRefresh={syncNow}
            settings={settings}
            showNotificationBanner={showNotificationBanner}
            showOverlayPrompt={showOverlayPrompt}
            onDismissOverlayPrompt={handleDismissOverlayPrompt}
            onOpenOverlaySettings={handleOpenOverlaySettings}
            unwatchedCount={unwatchedCount}
            onShowGuide={() => setGuideVisible(true)}
          />
        )}
        {activeTab === 'discover' && <DiscoverScreen />}
        {activeTab === 'settings' && (
          <SettingsScreen
            doneCount={doneCount}
            mode={mode}
            onClearAllData={handleClearAllData}
            onClearDone={clearDone}
            onRequestNotifications={handleRequestNotifications}
            onSignOut={handleSignOut}
            onUpdateSettings={updateSettings}
            settings={settings}
            onSignInGoogle={() => completeOnboarding('google')}
            onShowTutorial={() => {
              setTutorialReplay(true);
              setOnboarded(false);
            }}
            onShowGuide={() => setGuideVisible(true)}
            onToast={setToast}
          />
        )}
      </View>

      <View style={[styles.navWrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <BottomNav value={activeTab} onChange={setActiveTab} />
      </View>

      <QuickSaveModal
        initialUrl={incomingUrl}
        onClose={() => {
          setQuickSaveVisible(false);
          if (isShareMode) {
            // On Android, exiting share mode should ideally close the app activity
            // Since we're in JS, we can't easily kill the app, but we can reset the mode
            setIsShareMode(false);
          }
        }}
        onSave={saveDraft}
        onSaved={setToast}
        returnToSource={isShareMode}
        visible={quickSaveVisible}
      />

      <ItemDetailSheet
        item={selectedItem}
        onCategoryChange={changeCategory}
        onClose={() => setSelectedItemId(null)}
        onDelete={deleteItem}
        onDone={handleMarkDone}
        onUpdate={updateItem}
      />

      {toast && <Toast message={toast} top={Math.max(insets.top, 14)} />}

      {isShareMode && !quickSaveVisible && (
        <View style={StyleSheet.absoluteFill}>
          <View style={[styles.scrim, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
        </View>
      )}

      {updateRelease && (
        <UpdateModal
          release={updateRelease}
          onClose={() => setUpdateRelease(null)}
        />
      )}
      {whatsNewRelease && !updateRelease && (
        <WhatsNewModal
          release={whatsNewRelease}
          onClose={() => setWhatsNewRelease(null)}
        />
      )}
      {guideVisible && (
        <View style={StyleSheet.absoluteFill}>
          <GuideScreen onClose={() => setGuideVisible(false)} />
        </View>
      )}
    </View>
  );
}

const OVERLAY_PROMPT_SHOWN_KEY = 'saveit:overlay_permission_prompt_shown:v1';

type SaveItOverlayNativeModule = {
  canDrawOverlays?: () => Promise<boolean>;
  openOverlaySettings?: () => Promise<void>;
};

const SaveItOverlay = NativeModules.SaveItOverlay as SaveItOverlayNativeModule | undefined;

function LoadingScreen({ onReady }: { onReady: () => void }) {
  const markOpacity = useRef(new Animated.Value(0)).current;
  const markScale = useRef(new Animated.Value(0.92)).current;
  const wordmarkOpacity = useRef(new Animated.Value(0)).current;
  const wordmarkTranslate = useRef(new Animated.Value(8)).current;
  const creditOpacity = useRef(new Animated.Value(0)).current;
  const creditTranslate = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(markOpacity, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(markScale, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        })
      ]),
      Animated.parallel([
        Animated.timing(wordmarkOpacity, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(wordmarkTranslate, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        })
      ]),
      Animated.parallel([
        Animated.timing(creditOpacity, {
          toValue: 1,
          duration: 360,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(creditTranslate, {
          toValue: 0,
          duration: 360,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        })
      ])
    ]).start();
  }, [creditOpacity, creditTranslate, markOpacity, markScale, wordmarkOpacity, wordmarkTranslate]);

  return (
    <LinearGradient colors={['#0A0A1A', '#24184F', '#2D1B69']} onLayout={onReady} style={styles.loading}>
      <Animated.View style={[styles.loadingMark, { opacity: markOpacity, transform: [{ scale: markScale }] }]}>
        <Feather name="bookmark" size={30} color="#F3DFA2" />
      </Animated.View>
      <Animated.Text
        style={[
          styles.loadingText,
          { opacity: wordmarkOpacity, transform: [{ translateY: wordmarkTranslate }] }
        ]}
      >
        SaveIt
      </Animated.Text>
      <Animated.Text
        style={[
          styles.loadingCredit,
          { opacity: creditOpacity, transform: [{ translateY: creditTranslate }] }
        ]}
      >
        Crafted by Shan Ali Keerio
      </Animated.Text>
    </LinearGradient>
  );
}

function Toast({ message, top }: { message: string; top: number }) {
  return (
    <View style={[styles.toast, { top: top + 8 }]}>
      <Feather name="check-circle" size={18} color={colors.success} />
      <Text style={styles.toastText}>{message}</Text>
    </View>
  );
}

function extractShareIntentUrl(shareIntent: ShareIntentState['shareIntent']): string | undefined {
  const candidate = shareIntent.webUrl || shareIntent.text || '';
  const extracted = extractFirstUrl(candidate);
  return extracted.startsWith('http') ? extracted : undefined;
}

function extractAuthCode(url: string): string | null {
  try {
    const parsed = new URL(url);
    const queryCode = parsed.searchParams.get('code');
    if (queryCode) return queryCode;

    const hash = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash;
    return new URLSearchParams(hash).get('code');
  } catch {
    return null;
  }
}

function shouldShowPermissionBanner(lastSeen: string | null): boolean {
  if (!lastSeen) return true;
  return Date.now() - new Date(lastSeen).getTime() > 7 * 86_400_000;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  shell: {
    backgroundColor: colors.background,
    flex: 1
  },
  screen: {
    flex: 1
  },
  navWrap: {
    backgroundColor: colors.background,
    paddingTop: 2
  },
  loading: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center'
  },
  loadingMark: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderColor: 'rgba(243, 223, 162, 0.34)',
    borderWidth: 1,
    borderRadius: radii.lg,
    height: 78,
    justifyContent: 'center',
    width: 78
  },
  loadingText: {
    color: '#F3DFA2',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 14
  },
  loadingCredit: {
    bottom: 34,
    color: '#B9B2CA',
    fontSize: 12,
    fontWeight: '700',
    position: 'absolute'
  },
  toast: {
    ...shadow,
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 14,
    position: 'absolute'
  },
  toastText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900'
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(21, 20, 31, 0.34)'
  }
});
