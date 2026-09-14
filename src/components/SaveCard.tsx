import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useEffect, useRef } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { PlatformBadge } from '@/components/PlatformBadge';
import { colors, platformColors, radii, shadow } from '@/constants/theme';
import { formatRelativeTime } from '@/services/time';
import { SavedItem } from '@/types';

type SaveCardProps = {
  item: SavedItem;
  onPress: () => void;

  onMarkDone?: () => void;
  onDelete?: () => void;
  celebrating?: boolean;
};

function SaveCardComponent({ item, onPress, onMarkDone, onDelete, celebrating }: SaveCardProps) {
  const burst = useRef(new Animated.Value(0)).current;
  const swipeableRef = useRef<Swipeable>(null);

  useEffect(() => {
    if (!celebrating) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    burst.setValue(0);
    Animated.timing(burst, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true
    }).start();
  }, [burst, celebrating]);

  const burstStyle = {
    opacity: burst.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 0] }),
    transform: [
      { scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.28] }) },
      { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [8, -6] }) }
    ]
  };

  const handleSwipeDone = useCallback(() => {
    swipeableRef.current?.close();
    if (!item.is_done) onMarkDone?.();
  }, [item.is_done, onMarkDone]);

  const handleSwipeDelete = useCallback(() => {
    swipeableRef.current?.close();
    onDelete?.();
  }, [onDelete]);

  const headline = item.save_reason?.trim() || item.clean_title;

  const content = (
    <Pressable
    accessibilityRole="button"
    onPress={onPress}
    style={({ pressed }) => [
      styles.card,
      item.is_done && styles.doneCard,
      celebrating && styles.celebratingCard,
      pressed && styles.pressed
    ]}
  >
    <View style={styles.content}>
      <Text style={[styles.headline, item.is_done && styles.doneTitle]} numberOfLines={3}>
        {headline}
      </Text>
      <View style={styles.metaRow}>
        <PlatformBadge platform={item.platform} />
        {item.creator_handle ? (
          <Text style={styles.creator} numberOfLines={1}>
            {item.creator_handle}
          </Text>
        ) : null}
        <Text style={styles.time}>{formatRelativeTime(item.saved_at)}</Text>
      </View>
      <View style={styles.supportRow}>
        <View style={styles.category}>
          <Text style={styles.categoryText}>{item.category}</Text>
        </View>
        {item.is_important && (
          <View style={styles.important}>
            <Feather name="star" size={11} color="#C9A84C" />
            <Text style={styles.importantText}>Important</Text>
          </View>
        )}
        {hasActiveCustomReminder(item) && (
          <View style={styles.reminder}>
            <Feather name="clock" size={11} color={colors.primary} />
            <Text style={styles.reminderText}>{formatCustomReminderTime(item.custom_reminder_at)}</Text>
          </View>
        )}
        {item.sync_status !== 'synced' && <Text style={styles.sync}>Syncing...</Text>}
      </View>
    </View>
    <MiniThumbnail item={item} />
    {celebrating && (
      <Animated.View pointerEvents="none" style={[styles.burst, burstStyle]}>
        <Feather name="check" size={28} color={colors.success} />
      </Animated.View>
    )}
  </Pressable>
  );

  if (!onDelete && !onMarkDone) return content;

  return (
    <Swipeable
      ref={swipeableRef}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={() => (
        <Pressable
          accessibilityRole="button"
          onPress={handleSwipeDone}
          style={[styles.swipeAction, styles.doneAction]}
        >
          <Feather name="check" size={22} color={colors.surface} />
          <Text style={styles.swipeText}>Done</Text>
        </Pressable>
      )}
      renderRightActions={() => (
        <Pressable
          accessibilityRole="button"
          onPress={handleSwipeDelete}
          style={[styles.swipeAction, styles.deleteAction]}
        >
          <Feather name="trash-2" size={21} color={colors.surface} />
          <Text style={styles.swipeText}>Delete</Text>
        </Pressable>
      )}
    >
      {content}
    </Swipeable>
  );
}

export const SaveCard = memo(SaveCardComponent);

function hasActiveCustomReminder(item: SavedItem): boolean {
  return Boolean(item.custom_reminder_at && new Date(item.custom_reminder_at).getTime() > Date.now());
}

function formatCustomReminderTime(value: string | null): string {
  if (!value) return 'Reminder';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Reminder';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function MiniThumbnail({ item }: { item: SavedItem }) {
  if (item.thumbnail_url) {
    return <Image source={{ uri: item.thumbnail_url }} resizeMode="cover" style={styles.miniThumbnail} />;
  }

  const palette = platformColors[item.platform];
  return (
    <LinearGradient colors={[palette.bg, colors.surface]} style={styles.miniThumbnailFallback}>
      <Feather name="bookmark" size={18} color={palette.fg} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    ...shadow,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
    minHeight: 112,
    padding: 10,
    position: 'relative'
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.995 }]
  },
  doneCard: {
    backgroundColor: '#FAFAFC'
  },
  celebratingCard: {
    backgroundColor: colors.successSoft,
    borderColor: '#BDEAD4'
  },
  content: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12
  },
  headline: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 23
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8
  },
  supportRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8
  },
  category: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    minHeight: 24,
    justifyContent: 'center',
    paddingHorizontal: 8
  },
  categoryText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800'
  },
  important: {
    alignItems: 'center',
    backgroundColor: '#FFF6D8',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 4,
    minHeight: 24,
    paddingHorizontal: 8
  },
  importantText: {
    color: '#8A6A16',
    fontSize: 11,
    fontWeight: '900'
  },
  reminder: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 4,
    minHeight: 24,
    paddingHorizontal: 8
  },
  reminderText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900'
  },
  doneTitle: {
    color: colors.textMuted,
    textDecorationLine: 'line-through'
  },
  creator: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    maxWidth: 132
  },
  time: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700'
  },
  sync: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700'
  },
  bookmarkButton: {
    display: 'none'
  },
  miniThumbnail: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    height: 58,
    width: 58,
    alignSelf: 'center'
  },
  miniThumbnailFallback: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
    width: 58,
    alignSelf: 'center'
  },
  burst: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: '#BDEAD4',
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -24,
    position: 'absolute',
    top: 32,
    width: 48
  },
  swipeAction: {
    alignItems: 'center',
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginBottom: 12,
    paddingHorizontal: 16,
    width: 110
  },
  doneAction: {
    backgroundColor: colors.success
  },
  deleteAction: {
    backgroundColor: colors.danger
  },
  swipeText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: '900'
  }
});
