import { Feather } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, shadow } from '@/constants/theme';
import { daysBetween } from '@/services/time';
import { SavedItem } from '@/types';

type ReminderCardProps = {
  item: SavedItem;
  onDone: () => void;
  onWatchLater: () => void;
};

export function ReminderCard({ item, onDone, onWatchLater }: ReminderCardProps) {
  const days = daysBetween(item.saved_at);
  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Feather name="bell" size={20} color={colors.surface} />
      </View>
      <View style={styles.content}>
        <Text style={styles.message}>You saved this {days} days ago - still unwatched.</Text>
        <Text style={styles.title} numberOfLines={2}>
          {item.clean_title}
        </Text>
        <View style={styles.actions}>
          <Pressable style={[styles.button, styles.primary]} onPress={() => Linking.openURL(item.url)}>
            <Text style={styles.primaryText}>Watch now</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.secondary, { flexDirection: 'row', gap: 6 }]} onPress={onWatchLater}>
            <Feather name="clock" size={13} color={colors.surface} />
            <Text style={styles.secondaryText}>Later</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.secondary]} onPress={onDone}>
            <Text style={styles.secondaryText}>Done ✓</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...shadow,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
    padding: 14
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: radii.pill,
    height: 42,
    justifyContent: 'center',
    width: 42
  },
  content: {
    flex: 1
  },
  message: {
    color: '#EDEBFF',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18
  },
  title: {
    color: colors.surface,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 23,
    marginTop: 4
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12
  },
  button: {
    alignItems: 'center',
    borderRadius: radii.pill,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 14
  },
  primary: {
    backgroundColor: colors.surface
  },
  secondary: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderColor: 'rgba(255,255,255,0.28)',
    borderWidth: 1
  },
  primaryText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900'
  },
  secondaryText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: '900'
  }
});
