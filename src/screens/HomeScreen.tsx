import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorBanner } from '@/components/ErrorBanner';
import { IconButton } from '@/components/IconButton';
import { EmptyState } from '@/components/EmptyState';
import { ReminderCard } from '@/components/ReminderCard';
import { SaveCard } from '@/components/SaveCard';
import { SegmentedControl } from '@/components/SegmentedControl';
import { colors, platformColors, radii } from '@/constants/theme';
import { getOldestOverdueItem, shouldShowCapacityWarning } from '@/services/reminders';
import { platformDisplayName } from '@/services/url';
import { AppError, Platform, SavedItem, UserSettings } from '@/types';

type LibraryStatus = 'all' | 'unwatched' | 'done' | 'reminders';
type PlatformFilter = 'all' | Platform;

type HomeScreenProps = {
  items: SavedItem[];
  settings: UserSettings;
  unwatchedCount: number;
  errors: AppError[];
  celebratingId: string | null;
  showNotificationBanner: boolean;
  showOverlayPrompt: boolean;
  onDismissError: (id: string) => void;
  onOpenQuickSave: () => void;
  onOpenItem: (item: SavedItem) => void;
  onMarkDone: (itemId: string) => void;
  onMarkUnwatched: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
  onOpenSettings: () => void;
  onDismissNotificationBanner: () => void;
  onDismissOverlayPrompt: () => void;
  onOpenOverlaySettings: () => void;
  onShowGuide: () => void;
  onRefresh: () => Promise<void>;
};

const STATUS_OPTIONS = [
  { label: 'All', value: 'all' as const },
  { label: 'Unwatched', value: 'unwatched' as const },
  { label: 'Done', value: 'done' as const },
  { label: 'Reminders', value: 'reminders' as const }
];

const PLATFORM_OPTIONS: PlatformFilter[] = ['all', 'youtube', 'instagram', 'tiktok'];

export function HomeScreen({
  items,
  settings,
  unwatchedCount,
  errors,
  celebratingId,
  showNotificationBanner,
  showOverlayPrompt,
  onDismissError,
  onOpenQuickSave,
  onOpenItem,
  onMarkDone,
  onMarkUnwatched,
  onDeleteItem,
  onOpenSettings,
  onDismissNotificationBanner,
  onDismissOverlayPrompt,
  onOpenOverlaySettings,
  onShowGuide,
  onRefresh
}: HomeScreenProps) {
  const [status, setStatus] = useState<LibraryStatus>('all');
  const [platform, setPlatform] = useState<PlatformFilter>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [undoItem, setUndoItem] = useState<SavedItem | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reminderDismissedToday, setReminderDismissedToday] = useState(false);

  useEffect(() => {
    async function checkReminder() {
      try {
        const lastShown = await AsyncStorage.getItem('reminder_banner:last_shown_date');
        const today = new Date().toISOString().split('T')[0];
        if (lastShown === today) {
          setReminderDismissedToday(true);
        }
      } catch (e) {}
    }
    checkReminder();
  }, []);

  const handleDismissReminderForToday = useCallback(async () => {
    setReminderDismissedToday(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      await AsyncStorage.setItem('reminder_banner:last_shown_date', today);
    } catch (e) {}
  }, []);

  useEffect(
    () => () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    },
    []
  );

  const overdueItem = useMemo(() => getOldestOverdueItem(items), [items]);
  const capacityWarning = shouldShowCapacityWarning(items, settings);
  const completedThisWeek = useMemo(() => {
    const cutoff = Date.now() - 7 * 86_400_000;
    return items.filter((item) => item.done_at && new Date(item.done_at).getTime() >= cutoff).length;
  }, [items]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      if (status === 'unwatched' && item.is_done) return false;
      if (status === 'done' && !item.is_done) return false;
      if (status === 'reminders' && !hasActiveCustomReminder(item)) return false;
      if (platform !== 'all' && item.platform !== platform) return false;
      if (!normalizedQuery) return true;
      return [
        item.clean_title,
        item.raw_title,
        item.summary,
        item.save_reason ?? '',
        item.creator_handle ?? '',
        item.category,
        item.url
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [items, platform, query, status]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Haptics.selectionAsync().catch(() => undefined);
      await onRefresh();
    } catch {
      // Keep pull-to-refresh from surfacing background sync errors.
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const handleToggleSearch = useCallback(() => {
    setSearchOpen((current) => !current);
  }, []);

  const handleClearQuery = useCallback(() => {
    setQuery('');
  }, []);

  const handlePlatformChange = useCallback((nextPlatform: PlatformFilter) => {
    setPlatform(nextPlatform);
  }, []);

  const handleMarkDoneWithUndo = useCallback(
    (item: SavedItem) => {
      onMarkDone(item.id);
      setUndoItem(item);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(() => setUndoItem(null), 3000);
    },
    [onMarkDone]
  );

  const handleUndoDone = useCallback(() => {
    if (!undoItem) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
    onMarkUnwatched(undoItem.id);
    setUndoItem(null);
  }, [onMarkUnwatched, undoItem]);

  const confirmDelete = useCallback(
    (item: SavedItem) => {
      Alert.alert('Delete this save?', 'This removes it from your library.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDeleteItem(item.id) }
      ]);
    },
    [onDeleteItem]
  );

  const emptyMode = query
    ? 'search'
    : status === 'done'
      ? 'done'
      : status === 'reminders'
        ? 'reminders'
        : status === 'unwatched'
          ? 'unwatched'
          : 'all';

  return (
    <TouchableWithoutFeedback accessible={false} onPress={Keyboard.dismiss}>
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.topBar}>
        <Text style={styles.appName}>SaveIt</Text>
        <View style={styles.topActions}>
          <IconButton name="help-circle" onPress={onShowGuide} accessibilityLabel="How to use SaveIt" />
          <IconButton
            accessibilityLabel="Open notifications"
            badgeCount={unwatchedCount}
            name="bell"
            onPress={onOpenSettings}
          />
          <IconButton
            accessibilityLabel="Search library"
            name="search"
            onPress={handleToggleSearch}
          />
          <IconButton accessibilityLabel="Add URL" name="plus" onPress={onOpenQuickSave} />
        </View>
      </View>

      {searchOpen && (
        <View style={styles.searchWrap}>
          <Feather name="search" size={17} color={colors.textMuted} />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setQuery}
            placeholder="Search saves"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            value={query}
          />
          {Boolean(query) && (
            <Pressable onPress={handleClearQuery}>
              <Feather name="x" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      )}

      <View style={styles.filters}>
        <SegmentedControl options={STATUS_OPTIONS} value={status} onChange={setStatus} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.platforms}>
          {PLATFORM_OPTIONS.map((option) => {
            const active = option === platform;
            const palette = option === 'all' ? { bg: colors.surfaceMuted, fg: colors.text } : platformColors[option];
            return (
              <Pressable
                key={option}
                onPress={() => handlePlatformChange(option)}
                style={[styles.platformChip, { backgroundColor: active ? palette.bg : colors.surface }]}
              >
                <Text style={[styles.platformText, { color: active ? palette.fg : colors.textMuted }]}>
                  {option === 'all' ? 'All platforms' : platformDisplayName(option)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {unwatchedCount > 0 && (
        <View style={styles.unwatchedBanner}>
          <Text style={styles.unwatchedText}>You have {unwatchedCount} unwatched items</Text>
        </View>
      )}

      <Text style={styles.weeklyRecap}>You've completed {completedThisWeek} saves this week</Text>

      {showNotificationBanner && (
        <View style={styles.permissionBanner}>
          <View style={styles.permissionCopy}>
            <Text style={styles.permissionTitle}>Enable notifications to get reminded about your saves</Text>
          </View>
          <Pressable onPress={onOpenSettings} style={styles.permissionButton}>
            <Text style={styles.permissionButtonText}>Settings</Text>
          </Pressable>
          <Pressable onPress={onDismissNotificationBanner} style={styles.permissionClose}>
            <Feather name="x" size={17} color={colors.warning} />
          </Pressable>
        </View>
      )}

      {showOverlayPrompt && (
        <View style={styles.overlayBanner}>
          <View style={styles.permissionCopy}>
            <Text style={styles.overlayTitle}>Enable overlay permission for instant saves without leaving apps</Text>
          </View>
          <Pressable onPress={onOpenOverlaySettings} style={styles.overlayButton}>
            <Text style={styles.overlayButtonText}>Enable</Text>
          </Pressable>
          <Pressable onPress={onDismissOverlayPrompt} style={styles.permissionClose}>
            <Feather name="x" size={17} color={colors.primary} />
          </Pressable>
        </View>
      )}

      {capacityWarning && (
        <View style={styles.capacityBanner}>
          <Feather name="archive" size={18} color={colors.warning} />
          <Text style={styles.capacityText}>Your library is getting full. Consider clearing some done items.</Text>
        </View>
      )}

      {errors.map((error) => (
        <ErrorBanner key={error.id} error={error} onDismiss={onDismissError} />
      ))}

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {overdueItem && status !== 'done' && status !== 'reminders' && platformMatches(overdueItem, platform) && !reminderDismissedToday && (
          <ReminderCard
            item={overdueItem}
            onDone={() => {
              handleMarkDoneWithUndo(overdueItem);
              handleDismissReminderForToday();
            }}
            onWatchLater={handleDismissReminderForToday}
          />
        )}
        {filteredItems.length === 0 ? (
          <EmptyState mode={emptyMode} />
        ) : (
          filteredItems.map((item) => (
            <SaveCard
              celebrating={celebratingId === item.id}
              item={item}
              key={item.id}
              onDelete={() => confirmDelete(item)}
              onMarkDone={() => handleMarkDoneWithUndo(item)}
              onPress={() => onOpenItem(item)}
            />
          ))
        )}
      </ScrollView>
      {undoItem && (
        <View style={styles.undoToast}>
          <Text style={styles.undoText}>Marked done · </Text>
          <Pressable onPress={handleUndoDone}>
            <Text style={styles.undoAction}>Undo</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

function platformMatches(item: SavedItem, platform: PlatformFilter): boolean {
  return platform === 'all' || item.platform === platform;
}

function hasActiveCustomReminder(item: SavedItem): boolean {
  return Boolean(item.custom_reminder_at && new Date(item.custom_reminder_at).getTime() > Date.now());
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: colors.background,
    flex: 1
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 8
  },
  appName: {
    color: colors.text,
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: 0
  },
  topActions: {
    flexDirection: 'row',
    gap: 8
  },
  searchWrap: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 18,
    marginTop: 12,
    minHeight: 46,
    paddingHorizontal: 14
  },
  searchInput: {
    color: colors.text,
    flex: 1,
    fontSize: 15
  },
  filters: {
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 12
  },
  platforms: {
    gap: 8,
    paddingRight: 18
  },
  platformChip: {
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 12
  },
  platformText: {
    fontSize: 13,
    fontWeight: '800'
  },
  unwatchedBanner: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    marginHorizontal: 18,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  unwatchedText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '900'
  },
  weeklyRecap: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
    marginHorizontal: 18,
    marginTop: 10
  },
  permissionBanner: {
    alignItems: 'center',
    backgroundColor: colors.warningSoft,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 18,
    marginTop: 10,
    padding: 10
  },
  permissionCopy: {
    flex: 1
  },
  permissionTitle: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18
  },
  permissionButton: {
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 10
  },
  permissionButtonText: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '900'
  },
  permissionClose: {
    padding: 3
  },
  overlayBanner: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 18,
    marginTop: 10,
    padding: 10
  },
  overlayTitle: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18
  },
  overlayButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 12
  },
  overlayButtonText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '900'
  },
  capacityBanner: {
    alignItems: 'center',
    backgroundColor: colors.warningSoft,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 18,
    marginTop: 10,
    padding: 10
  },
  capacityText: {
    color: colors.warning,
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18
  },
  list: {
    paddingBottom: 18,
    paddingHorizontal: 18,
    paddingTop: 14
  },
  undoToast: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.text,
    borderRadius: radii.pill,
    bottom: 18,
    flexDirection: 'row',
    minHeight: 44,
    paddingHorizontal: 16,
    position: 'absolute'
  },
  undoText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '800'
  },
  undoAction: {
    color: '#C9A84C',
    fontSize: 14,
    fontWeight: '900'
  }
});
