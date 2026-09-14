import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';

import { colors, radii } from '@/constants/theme';

type IconButtonProps = {
  name: keyof typeof Feather.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  badgeCount?: number;
  style?: ViewStyle;
};

export function IconButton({ name, onPress, accessibilityLabel, badgeCount, style }: IconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, style]}
    >
      <Feather name={name} size={21} color={colors.text} />
      {Boolean(badgeCount) && badgeCount! > 0 && <Pressable pointerEvents="none" style={styles.badge} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }]
  },
  badge: {
    backgroundColor: colors.primary,
    borderColor: colors.surface,
    borderRadius: 6,
    borderWidth: 2,
    height: 12,
    position: 'absolute',
    right: 8,
    top: 8,
    width: 12
  }
});
