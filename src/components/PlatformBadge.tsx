import { StyleSheet, Text, View } from 'react-native';

import { platformColors, radii } from '@/constants/theme';
import { Platform } from '@/types';
import { platformDisplayName } from '@/services/url';

export function PlatformBadge({ platform }: { platform: Platform }) {
  const palette = platformColors[platform];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <View style={[styles.dot, { backgroundColor: palette.accent }]} />
      <Text style={[styles.label, { color: palette.fg }]}>{platformDisplayName(platform)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 5,
    minHeight: 24,
    paddingHorizontal: 8
  },
  dot: {
    borderRadius: 4,
    height: 8,
    width: 8
  },
  label: {
    fontSize: 11,
    fontWeight: '800'
  }
});
