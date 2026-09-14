import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '@/constants/theme';

type Option<T extends string> = {
  label: string;
  value: T;
};

type SegmentedControlProps<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <View style={styles.wrap}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            accessibilityRole="button"
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [styles.option, active && styles.active, pressed && styles.pressed]}
          >
            <Text style={[styles.label, active && styles.activeLabel]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 4,
    padding: 4
  },
  option: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flex: 1,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 10
  },
  active: {
    backgroundColor: colors.surface,
    shadowColor: '#1C1437',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1
  },
  pressed: {
    opacity: 0.78
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700'
  },
  activeLabel: {
    color: colors.primary
  }
});
