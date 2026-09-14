import { Feather } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as Linking from 'expo-linking';
import { useEffect, useRef, useState } from 'react';
import * as Updates from 'expo-updates';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native';

import { colors, radii, shadow, spacing } from '@/constants/theme';
import { AppRelease, dismissUpdatePrompt, recordUpdatePromptShown } from '@/services/updateChecker';

type UpdateModalProps = {
  release: AppRelease;
  onClose: () => void;
};

export function UpdateModal({ release, onClose }: UpdateModalProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const rippleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isUpdating) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(rippleAnim, {
            toValue: 1,
            duration: 1200,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(rippleAnim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          })
        ])
      ).start();
    } else {
      rippleAnim.setValue(0);
    }
  }, [isUpdating, rippleAnim]);

  useEffect(() => {
    // Entrance animation: fade + scale-in
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 340,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // Play a short, soft notification sound
    let sound: Audio.Sound | undefined;
    (async () => {
      try {
        const { sound: s } = await Audio.Sound.createAsync(
          require('../../assets/update-chime.wav'),
          { volume: 0.4 }
        );
        sound = s;
        await sound.playAsync();
      } catch {
        // Sound is a nice-to-have; never block the popup
      }
    })();

    // Record that we showed this prompt to the user
    recordUpdatePromptShown().catch(() => undefined);

    return () => {
      if (sound) {
        sound.unloadAsync().catch(() => undefined);
      }
    };
  }, [opacity, scale]);

  async function handleUpdate() {
    if (release.update_type === 'ota') {
      setIsUpdating(true);
      setUpdateError(null);
      try {
        const check = await Updates.checkForUpdateAsync();
        if (check.isAvailable) {
          await Updates.fetchUpdateAsync();
          // Dismiss only AFTER a successful download — if the OTA fails,
          // the user should be prompted again on the next app open.
          await dismissUpdatePrompt(release.latest_version_code);
          await Updates.reloadAsync();
        } else {
          setUpdateError("Update no longer available.");
          setIsUpdating(false);
        }
      } catch (err: any) {
        setUpdateError("Failed to update: " + (err.message || "Unknown error"));
        setIsUpdating(false);
      }
      return;
    }

    // Native update: dismiss immediately since we're sending the user
    // to an external download — we can't track whether they complete it.
    await dismissUpdatePrompt(release.latest_version_code);
    try {
      await Linking.openURL(release.download_url);
    } catch {
      // If the URL can't be opened, just close the modal
    }
    onClose();
  }

  async function handleIgnore() {
    await dismissUpdatePrompt(release.latest_version_code);
    onClose();
  }

  return (
    <Modal animationType="none" transparent visible onRequestClose={handleIgnore}>
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.card,
            {
              opacity,
              transform: [{ scale }],
            },
          ]}
        >
          {/* Icon badge */}
          <View style={styles.iconBadge}>
            {isUpdating && (
              <Animated.View style={[
                StyleSheet.absoluteFill,
                styles.ripple,
                {
                  opacity: rippleAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.6, 0]
                  }),
                  transform: [{
                    scale: rippleAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 2]
                    })
                  }]
                }
              ]} />
            )}
            <Feather name="download" size={24} color={colors.primary} />
          </View>

          {/* Title */}
          <Text style={styles.title}>{isUpdating ? 'Updating...' : 'Update Available'}</Text>

          {/* Body */}
          <Text style={styles.body}>
            {isUpdating
              ? 'Downloading the latest version. Please wait...'
              : `A new version of SaveIt is available${release.latest_version_name ? ` (v${release.latest_version_name})` : ''}.`}
          </Text>

          {updateError && (
            <Text style={styles.errorText}>{updateError}</Text>
          )}

          {/* Release notes */}
          {!isUpdating && release.release_notes ? (
            <View style={styles.notesContainer}>
              <Text style={styles.notesLabel}>What's new</Text>
              <Text style={styles.notesText}>{release.release_notes}</Text>
            </View>
          ) : null}

          {/* Buttons */}
          <Pressable
            accessibilityRole="button"
            disabled={isUpdating}
            onPress={handleUpdate}
            style={({ pressed }) => [
              styles.updateButton,
              isUpdating && styles.updateButtonDisabled,
              pressed && !isUpdating && styles.updateButtonPressed,
            ]}
          >
            {!isUpdating && release.update_type !== 'ota' && (
              <Feather name="external-link" size={17} color={colors.surface} />
            )}
            {isUpdating && <ActivityIndicator size="small" color={colors.surface} style={{ marginRight: 8 }} />}
            <Text style={styles.updateButtonText}>
              {isUpdating ? 'Updating...' : (release.update_type === 'ota' ? 'Install Update' : 'Update')}
            </Text>
          </Pressable>

          {!isUpdating && (
            <Pressable
              accessibilityRole="button"
              onPress={handleIgnore}
              style={({ pressed }) => [
                styles.ignoreButton,
                pressed && styles.ignoreButtonPressed,
              ]}
            >
              <Text style={styles.ignoreButtonText}>Ignore for now</Text>
            </Pressable>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(21, 20, 31, 0.34)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  card: {
    ...shadow,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    maxWidth: 360,
    paddingHorizontal: spacing.xl,
    paddingTop: 28,
    paddingBottom: spacing.xl,
    width: '100%',
  },
  iconBadge: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    height: 52,
    justifyContent: 'center',
    marginBottom: spacing.lg,
    width: 52,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  body: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  notesContainer: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  notesLabel: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  notesText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  updateButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 20,
    minHeight: 50,
  },
  updateButtonPressed: {
    backgroundColor: colors.primaryPressed,
  },
  updateButtonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '900',
  },
  ignoreButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: spacing.sm,
    minHeight: 44,
  },
  ignoreButtonPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  ignoreButtonText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '800',
  },
  ripple: {
    backgroundColor: colors.primarySoft,
    borderRadius: 26,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  updateButtonDisabled: {
    opacity: 0.8,
  }
});
