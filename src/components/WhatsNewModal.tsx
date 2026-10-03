import { Feather } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, shadow, spacing } from '@/constants/theme';
import { AppRelease } from '@/services/updateChecker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';

type WhatsNewModalProps = {
  release: AppRelease;
  onClose: () => void;
};

export function WhatsNewModal({ release, onClose }: WhatsNewModalProps) {
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

    return () => {
      if (sound) {
        sound.unloadAsync().catch(() => undefined);
      }
    };
  }, [opacity, scale]);

  async function handleDismiss() {
    try {
      if (Updates.updateId) {
        await AsyncStorage.setItem('whats_new:shown_update_id_v3', Updates.updateId);
      }
    } catch {
      // ignore
    }
    onClose();
  }

  return (
    <Modal animationType="none" transparent visible onRequestClose={handleDismiss}>
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
            <Feather name="check-circle" size={24} color={colors.primary} />
          </View>

          {/* Title */}
          <Text style={styles.title}>App Updated</Text>

          {/* Body */}
          <Text style={styles.body}>
            SaveIt has been updated to the latest version. Here's what changed:
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
            onPress={handleDismiss}
            style={({ pressed }) => [
              styles.updateButton,
              pressed && styles.updateButtonPressed,
            ]}
          >
            <Text style={styles.updateButtonText}>Awesome, thanks!</Text>
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
  }
});
