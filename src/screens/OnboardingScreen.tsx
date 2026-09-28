import { Feather } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii } from '@/constants/theme';

import { requestBatteryExemption } from '@/services/battery';

type OnboardingScreenProps = {
  onComplete: (provider: 'google' | 'local') => void;
  onRequestNotifications: () => Promise<void>;
  isReplay?: boolean;
};

const SLIDES = [
  {
    type: 'intro' as const,
    title: 'You save things. Then forget them.',
    body: 'Saved folders become quiet piles of good intentions.',
    icon: 'folder' as const
  },
  {
    type: 'intro' as const,
    title: 'SaveIt remembers for you.',
    body: 'Daily reminders bring the right thing back before it disappears.',
    icon: 'bell' as const
  },
  {
    type: 'notifications' as const,
    title: 'Stay on track.',
    body: 'We’ll send one daily reminder with your highest priority save so you actually watch it.',
    icon: 'message-circle' as const
  },
  {
    type: 'battery' as const,
    title: 'Never miss a reminder.',
    body: 'To make sure your reminders always arrive — even if you don\'t open SaveIt for weeks — allow it to run in the background.',
    icon: 'battery' as const
  },
  {
    type: 'share' as const,
    title: 'Add to Share Sheet',
    body: 'Tap Share in any app → More(...) → Edit → Enable SaveIt for one-tap saving.',
    icon: 'share-2' as const
  }
];

export function OnboardingScreen({ onComplete, onRequestNotifications, isReplay }: OnboardingScreenProps) {
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  function handleNext() {
    const advance = () => {
      if (isLast) {
        if (isReplay) onComplete('local');
      } else {
        setIndex((current) => current + 1);
      }
    };

    if (slide.type === 'notifications') {
      try {
        void onRequestNotifications().catch(() => undefined);
      } catch {
        // Notification setup should never block onboarding.
      } finally {
        advance();
      }
      return;
    }
    
    if (slide.type === 'battery') {
      try {
        void requestBatteryExemption();
      } catch {
        // Settings launch should never block onboarding
      } finally {
        advance();
      }
      return;
    }

    advance();
  }

  function handleTestShare() {
    Linking.openURL('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        {!isLast && (
          <Pressable style={styles.skipButton} onPress={() => isReplay ? onComplete('local') : setIndex(SLIDES.length - 1)}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.container}>
        <View style={styles.visual}>
          <LinearGradient colors={['#EFEDFF', '#FFFFFF']} style={styles.visualBg}>
            <View style={styles.phone}>
              {slide.type === 'intro' && index === 0 && (
                <>
                  <View style={[styles.savedRow, { width: '78%' }]} />
                  <View style={[styles.savedRow, { width: '92%' }]} />
                  <View style={[styles.savedRow, { width: '68%' }]} />
                  <View style={[styles.savedRow, { width: '84%' }]} />
                </>
              )}
              {slide.type === 'intro' && index === 1 && (
                <View style={styles.notification}>
                  <Feather name="bell" size={18} color={colors.primary} />
                  <View style={styles.notificationText}>
                    <View style={styles.notificationLine} />
                    <View style={[styles.notificationLine, { width: '62%' }]} />
                  </View>
                </View>
              )}
              {slide.type === 'notifications' && (
                <View style={styles.permitBox}>
                  <View style={styles.permitIcon}>
                    <Feather name="bell" size={32} color={colors.primary} />
                  </View>
                  <Text style={styles.permitLabel}>Allow Notifications</Text>
                  <View style={styles.permitDots}>
                    <View style={styles.dot} />
                    <View style={styles.dotActive} />
                  </View>
                </View>
              )}
              {slide.type === 'battery' && (
                <View style={styles.permitBox}>
                  <View style={styles.permitIcon}>
                    <Feather name="battery" size={32} color={colors.primary} />
                  </View>
                  <Text style={styles.permitLabel}>Allow Background</Text>
                  <View style={styles.permitDots}>
                    <View style={styles.dot} />
                    <View style={styles.dotActive} />
                  </View>
                </View>
              )}
              {slide.type === 'share' && (
                <View style={styles.shareSheet}>
                  <View style={styles.shareHandle} />
                  <View style={styles.shareIcons}>
                    <View style={styles.shareIcon} />
                    <View style={[styles.shareIcon, styles.shareIconActive]}>
                      <Feather name="bookmark" size={24} color={colors.surface} />
                    </View>
                    <View style={styles.shareIcon} />
                  </View>
                </View>
              )}
            </View>
            <View style={styles.visualBadge}>
              <Feather name={slide.icon} size={22} color={colors.surface} />
            </View>
          </LinearGradient>
        </View>

        <View style={styles.copy}>
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.body}>{slide.body}</Text>
        </View>

        <View style={styles.dots}>
          {SLIDES.map((_, dotIndex) => (
            <View key={dotIndex} style={[styles.dot, index === dotIndex && styles.dotActive]} />
          ))}
        </View>

        {isLast && !isReplay ? (
          <View style={styles.authStack}>
            <Pressable style={[styles.authButton, { backgroundColor: '#FF0000', borderColor: '#FF0000' }]} onPress={handleTestShare}>
              <Feather name="youtube" size={18} color={colors.surface} />
              <Text style={[styles.googleText, { color: colors.surface }]}>Test with YouTube</Text>
            </Pressable>
            <Pressable style={[styles.authButton, styles.googleButton]} onPress={() => onComplete('google')}>
              <Feather name="chrome" size={18} color={colors.primary} />
              <Text style={styles.googleText}>Continue with Google</Text>
            </Pressable>
            <Text style={styles.trustText}>We only use your email to sync saves securely.</Text>
            <Pressable style={styles.localButton} onPress={() => onComplete('local')}>
              <Text style={styles.localText}>Continue as Demo</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable accessibilityRole="button" style={styles.cta} onPress={handleNext}>
            <Text style={styles.ctaText}>
              {slide.type === 'notifications' ? 'Enable & Continue' : isLast ? 'Done' : 'Next'}
            </Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: colors.background,
    flex: 1
  },
  container: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 24,
    paddingTop: 0
  },
  header: {
    height: 48,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  skipButton: {
    padding: 8,
  },
  skipText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '700',
  },
  visual: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 320
  },
  visualBg: {
    alignItems: 'center',
    borderRadius: 28,
    height: '86%',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  phone: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 32,
    borderWidth: 8,
    height: 284,
    justifyContent: 'center',
    padding: 18,
    width: 174
  },
  savedRow: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    height: 34,
    marginBottom: 12
  },
  notification: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 12
  },
  notificationText: {
    flex: 1,
    gap: 8
  },
  notificationLine: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    height: 10,
    width: '84%'
  },
  permitBox: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center'
  },
  permitIcon: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.lg,
    height: 72,
    justifyContent: 'center',
    marginBottom: 16,
    width: 72
  },
  permitLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 20
  },
  permitDots: {
    flexDirection: 'row',
    gap: 6
  },
  shareSheet: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 22,
    bottom: 10,
    left: 10,
    padding: 14,
    position: 'absolute',
    right: 10
  },
  shareHandle: {
    alignSelf: 'center',
    backgroundColor: colors.border,
    borderRadius: radii.pill,
    height: 4,
    marginBottom: 14,
    width: 38
  },
  shareIcons: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  shareIcon: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    height: 46,
    width: 46
  },
  shareIconActive: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    justifyContent: 'center'
  },
  visualBadge: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    bottom: 28,
    height: 52,
    justifyContent: 'center',
    position: 'absolute',
    right: 32,
    width: 52
  },
  copy: {
    alignItems: 'center',
    marginTop: 10
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 38,
    textAlign: 'center'
  },
  body: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 12,
    paddingHorizontal: 12,
    textAlign: 'center'
  },
  testButton: {
    alignItems: 'center',
    borderColor: colors.primary,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: 20,
    minHeight: 44,
    paddingHorizontal: 16
  },
  testButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '900'
  },
  dots: {
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 8,
    marginVertical: 22
  },
  dot: {
    backgroundColor: colors.border,
    borderRadius: radii.pill,
    height: 8,
    width: 8
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 24
  },
  cta: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    minHeight: 56,
    justifyContent: 'center'
  },
  ctaText: {
    color: colors.surface,
    fontSize: 17,
    fontWeight: '900'
  },
  authStack: {
    gap: 10
  },
  authButton: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    minHeight: 54
  },
  googleButton: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1
  },
  googleText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '900'
  },
  trustText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 8,
    marginTop: -4,
  },
  localButton: {
    alignItems: 'center',
    minHeight: 40,
    justifyContent: 'center'
  },
  localText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '800'
  }
});
