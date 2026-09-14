import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Image, StyleSheet, Text } from 'react-native';

import { colors, platformColors, radii } from '@/constants/theme';
import { Platform } from '@/types';
import { platformDisplayName } from '@/services/url';

type ThumbnailProps = {
  uri?: string;
  platform: Platform;
  size?: 'small' | 'large';
};

export function Thumbnail({ uri, platform, size = 'small' }: ThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const dimensions = size === 'large' ? styles.large : styles.small;

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        onError={() => setFailed(true)}
        resizeMode="cover"
        style={[styles.image, dimensions]}
      />
    );
  }

  const palette = platformColors[platform];
  return (
    <LinearGradient
      colors={[palette.bg, colors.surface]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.fallback, dimensions]}
    >
      <Feather name="bookmark" size={size === 'large' ? 36 : 22} color={palette.fg} />
      {size === 'large' && <Text style={[styles.fallbackText, { color: palette.fg }]}>{platformDisplayName(platform)}</Text>}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md
  },
  small: {
    height: 78,
    width: 86
  },
  large: {
    aspectRatio: 16 / 9,
    width: '100%'
  },
  fallback: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center'
  },
  fallbackText: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 8
  }
});
