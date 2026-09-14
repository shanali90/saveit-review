import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '@/constants/theme';

export type AppTab = 'home' | 'discover' | 'settings';

type BottomNavProps = {
  value: AppTab;
  onChange: (tab: AppTab) => void;
};

const TABS: Array<{ value: AppTab; label: string; icon: keyof typeof Feather.glyphMap }> = [
  { value: 'home', label: 'Home', icon: 'home' },
  { value: 'discover', label: 'Discover', icon: 'compass' },
  { value: 'settings', label: 'Settings', icon: 'settings' }
];

export function BottomNav({ value, onChange }: BottomNavProps) {
  return (
    <View style={styles.nav}>
      {TABS.map((tab) => {
        const active = value === tab.value;
        return (
          <Pressable
            accessibilityRole="tab"
            key={tab.value}
            onPress={() => onChange(tab.value)}
            style={({ pressed }) => [styles.item, active && styles.activeItem, pressed && styles.pressed]}
          >
            <Feather name={tab.icon} size={20} color={active ? colors.primary : colors.textMuted} />
            <Text style={[styles.label, active && styles.activeLabel]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginHorizontal: 18,
    marginTop: 8,
    padding: 6
  },
  item: {
    alignItems: 'center',
    borderRadius: radii.md,
    flex: 1,
    gap: 3,
    minHeight: 54,
    justifyContent: 'center'
  },
  activeItem: {
    backgroundColor: colors.primarySoft
  },
  pressed: {
    opacity: 0.75
  },
  label: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800'
  },
  activeLabel: {
    color: colors.primary
  }
});
