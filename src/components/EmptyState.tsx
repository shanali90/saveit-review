import { Feather } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '@/constants/theme';

export function EmptyState({ mode }: { mode: 'all' | 'unwatched' | 'done' | 'reminders' | 'search' }) {
  const intro = useRef(new Animated.Value(mode === 'unwatched' ? 0 : 1)).current;
  const copy =
    mode === 'done'
      ? 'Nothing finished yet — your saves are waiting.'
      : mode === 'reminders'
        ? 'No active reminders yet.'
      : mode === 'unwatched'
        ? 'Nothing saved yet — go find something worth watching.'
        : mode === 'search'
          ? 'No saves match that search.'
          : 'Nothing saved yet — go find something worth watching.';

  useEffect(() => {
    if (mode !== 'unwatched') {
      intro.setValue(1);
      return;
    }
    intro.setValue(0);
    Animated.timing(intro, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true
    }).start();
  }, [intro, mode]);

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          opacity: intro,
          transform: [{ translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }]
        }
      ]}
    >
      <View style={styles.illustration}>
        <Feather name="bookmark" size={38} color={colors.primary} />
        <View style={styles.dotOne} />
        <View style={styles.dotTwo} />
      </View>
      <Text style={styles.text}>{copy}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 260,
    paddingHorizontal: 28
  },
  illustration: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.lg,
    height: 96,
    justifyContent: 'center',
    marginBottom: 18,
    overflow: 'hidden',
    width: 112
  },
  dotOne: {
    backgroundColor: '#F5B84B',
    borderRadius: 8,
    height: 16,
    position: 'absolute',
    right: 16,
    top: 14,
    width: 16
  },
  dotTwo: {
    backgroundColor: '#6CC3B2',
    borderRadius: 6,
    bottom: 16,
    height: 12,
    left: 18,
    position: 'absolute',
    width: 12
  },
  text: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center'
  }
});
