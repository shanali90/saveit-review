import { Feather } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as Linking from 'expo-linking';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, shadow, spacing } from '@/constants/theme';
import { AppRelease, recordUpdatePromptShown } from '@/services/updateChecker';

type UpdateModalProps = {
  release: AppRelease;
  onClose: () => void;
};

export function UpdateModal({ release, onClose }: UpdateModalProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

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
    recordUpdatePromptShown(release.latest_version_code).catch(() => undefined);

    return () => {
      if (sound) {
        sound.unloadAsync().catch(() => undefined);
      }
    };
  }, [opacity, scale]);

  async function handleUpdate() {
    try {
      await Linking.openURL(release.download_url);
    } catch {
      // If the URL can't be opened, just close the modal
    }
    onClose();
  }

  async function handleIgnore() {
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
            <Feather name="download" size={24} color={colors.primary} />
          </View>

          {/* Title */}
          <Text style={styles.title}>Update Available</Text>

          {/* Body */}
          <Text style={styles.body}>
            A new version of SaveIt is available
            {release.latest_version_name ? ` (v${release.latest_version_name})` : ''}.
          </Text>

          {/* Release notes */}
          {release.release_notes ? (
            <View style={styles.notesContainer}>
              <Text style={styles.notesLabel}>What's new</Text>
              <Text style={styles.notesText}>{release.release_notes}</Text>
            </View>
          ) : null}

          {/* Buttons */}
          <Pressable
            accessibilityRole="button"
            onPress={handleUpdate}
            style={({ pressed }) => [
              styles.updateButton,
              pressed && styles.updateButtonPressed,
            ]}
          >
            <Feather name="external-link" size={17} color={colors.surface} />
            <Text style={styles.updateButtonText}>Update</Text>
          </Pressable>

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
});
