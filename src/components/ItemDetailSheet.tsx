import { Feather } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View
} from 'react-native';

import { PlatformBadge } from '@/components/PlatformBadge';
import { Thumbnail } from '@/components/Thumbnail';
import { CATEGORIES } from '@/constants/categories';
import { colors, radii } from '@/constants/theme';
import { formatRelativeTime } from '@/services/time';
import { platformDisplayName } from '@/services/url';
import { Category, SavedItem } from '@/types';

type ItemDetailSheetProps = {
  item: SavedItem | null;
  onClose: () => void;
  onDone: (itemId: string) => void;
  onDelete: (itemId: string) => void;
  onUpdate: (itemId: string, patch: Partial<SavedItem>) => void | Promise<void>;
  onCategoryChange: (itemId: string, category: Category) => void;
};

export function ItemDetailSheet({
  item,
  onClose,
  onDone,
  onDelete,
  onUpdate,
  onCategoryChange
}: ItemDetailSheetProps) {
  const [reason, setReason] = useState('');
  const [reminderPickerVisible, setReminderPickerVisible] = useState(false);
  const [reminderDraftDate, setReminderDraftDate] = useState(() => nextDefaultReminderDate());

  useEffect(() => {
    setReason(item?.save_reason ?? '');
    setReminderPickerVisible(false);
    setReminderDraftDate(item?.custom_reminder_at ? new Date(item.custom_reminder_at) : nextDefaultReminderDate());
  }, [item]);

  if (!item) return null;
  const currentItem = item;

  function commitReason() {
    onUpdate(currentItem.id, { save_reason: reason.trim() || null });
  }

  function confirmDelete() {
    Alert.alert('Delete this save?', 'This removes it from your library.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          onDelete(currentItem.id);
          onClose();
        }
      }
    ]);
  }

  function pickReminder() {
    const initialDate = resolveFutureReminderDate(
      currentItem.custom_reminder_at ? new Date(currentItem.custom_reminder_at) : reminderDraftDate
    );
    setReminderDraftDate(initialDate);

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        display: 'clock',
        mode: 'time',
        value: initialDate,
        onChange: handleReminderPickerChange
      });
      return;
    }

    setReminderPickerVisible(true);
  }

  function handleReminderPickerChange(event: DateTimePickerEvent, selectedDate?: Date) {
    if (event.type === 'dismissed' || !selectedDate) return;
    const nextDate = resolveFutureReminderDate(selectedDate);
    setReminderDraftDate(nextDate);

    if (Platform.OS === 'android') {
      void setReminder(nextDate);
    }
  }

  function cancelReminderPicker() {
    setReminderPickerVisible(false);
  }

  function confirmReminderPicker() {
    setReminderPickerVisible(false);
    void setReminder(resolveFutureReminderDate(reminderDraftDate));
  }

  async function setReminder(date: Date) {
    await onUpdate(currentItem.id, { custom_reminder_at: date.toISOString() });
  }

  async function clearReminder() {
    setReminderPickerVisible(false);
    await onUpdate(currentItem.id, { custom_reminder_at: null });
  }

  return (
    <Modal animationType="slide" transparent visible={Boolean(currentItem)} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <Pressable style={styles.scrim} onPress={onClose} />
        <TouchableWithoutFeedback accessible={false} onPress={Keyboard.dismiss}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <Text style={styles.title}>{currentItem.clean_title}</Text>
              <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
                <Feather name="x" size={22} color={colors.text} />
              </Pressable>
            </View>

            <Thumbnail uri={currentItem.thumbnail_url} platform={currentItem.platform} size="large" />

            <View style={styles.metaRow}>
              <PlatformBadge platform={currentItem.platform} />
              <View style={styles.categoryPill}>
                <Text style={styles.categoryText}>{currentItem.category}</Text>
              </View>
              {currentItem.creator_handle ? <Text style={styles.creator}>{currentItem.creator_handle}</Text> : null}
              {currentItem.is_important ? (
                <View style={styles.importantPill}>
                  <Feather name="star" size={12} color="#C9A84C" />
                  <Text style={styles.importantText}>Important</Text>
                </View>
              ) : null}
              <Text style={styles.time}>{formatRelativeTime(currentItem.saved_at)}</Text>
            </View>

            {currentItem.summary ? (
              <Text style={styles.summary}>{currentItem.summary}</Text>
            ) : (
              <Text style={styles.summaryMuted}>Summary is still being prepared.</Text>
            )}

            <Text style={styles.sectionLabel}>Save reason</Text>
            <TextInput
              onBlur={commitReason}
              onChangeText={setReason}
              placeholder="Add why this mattered"
              placeholderTextColor={colors.textMuted}
              style={styles.reasonInput}
              value={reason}
            />

            <Text style={styles.sectionLabel}>Category</Text>
            <View style={styles.categoryGrid}>
              {CATEGORIES.map((category) => {
                const selected = category === currentItem.category;
                return (
                  <Pressable
                    key={category}
                    onPress={() => onCategoryChange(currentItem.id, category)}
                    style={[styles.categoryChoice, selected && styles.categoryChoiceSelected]}
                  >
                    <Text style={[styles.categoryChoiceText, selected && styles.categoryChoiceTextSelected]}>{category}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sectionLabel}>Source</Text>
            <Pressable style={styles.source} onPress={() => Linking.openURL(currentItem.url).catch(() => undefined)}>
              <Feather name="external-link" size={16} color={colors.primary} />
              <Text style={styles.sourceText} numberOfLines={1}>
                {currentItem.url}
              </Text>
            </Pressable>

            <View style={styles.actions}>
              <Pressable
                style={[styles.actionButton, styles.openButton]}
                onPress={() => Linking.openURL(currentItem.url).catch(() => undefined)}
              >
                <Feather name="play-circle" size={18} color={colors.surface} />
                <Text style={styles.openButtonText}>Open on {platformDisplayName(currentItem.platform)}</Text>
              </Pressable>
              <Pressable
                style={[styles.actionButton, styles.doneButton]}
                onPress={() => {
                  onDone(currentItem.id);
                  onClose();
                }}
              >
                <Feather name="check" size={18} color={colors.success} />
                <Text style={styles.doneButtonText}>Mark as Done</Text>
              </Pressable>
              <Pressable style={[styles.actionButton, styles.reminderButton]} onPress={pickReminder}>
                <Feather name="clock" size={18} color={colors.primary} />
                <Text style={styles.reminderButtonText}>
                  {currentItem.custom_reminder_at ? 'Edit Reminder' : 'Set Reminder'}
                </Text>
              </Pressable>
              {currentItem.custom_reminder_at ? (
                <Pressable style={[styles.actionButton, styles.clearReminderButton]} onPress={() => void clearReminder()}>
                  <Feather name="x-circle" size={18} color={colors.textMuted} />
                  <Text style={styles.clearReminderText}>Clear Reminder</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.deleteButton} onPress={confirmDelete}>
                <Text style={styles.deleteButtonText}>Delete</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
      <Modal animationType="fade" transparent visible={reminderPickerVisible} onRequestClose={cancelReminderPicker}>
        <Pressable style={styles.reminderOverlay} onPress={cancelReminderPicker}>
          <Pressable style={styles.reminderPickerCard} onPress={(event) => event.stopPropagation()}>
            <View style={styles.reminderPickerHeader}>
              <Text style={styles.reminderPickerTitle}>Set reminder</Text>
              <Pressable accessibilityRole="button" onPress={cancelReminderPicker} style={styles.reminderIconButton}>
                <Feather name="x" size={19} color={colors.text} />
              </Pressable>
            </View>
            <DateTimePicker
              display={Platform.OS === 'ios' ? 'spinner' : 'spinner'}
              mode="time"
              onChange={handleReminderPickerChange}
              value={reminderDraftDate}
            />
            <View style={styles.reminderPickerActions}>
              <Pressable style={[styles.reminderPickerButton, styles.reminderCancelButton]} onPress={cancelReminderPicker}>
                <Text style={styles.reminderCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.reminderPickerButton, styles.reminderDoneButton]} onPress={confirmReminderPicker}>
                <Text style={styles.reminderDoneText}>Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

function nextDefaultReminderDate(): Date {
  const date = new Date(Date.now() + 60 * 60_000);
  date.setSeconds(0, 0);
  return resolveFutureReminderDate(date);
}

function resolveFutureReminderDate(date: Date): Date {
  const next = new Date();
  next.setHours(date.getHours(), date.getMinutes(), 0, 0);
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
  return next;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end'
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(21, 20, 31, 0.34)'
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingHorizontal: 18,
    paddingTop: 10
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.border,
    borderRadius: radii.pill,
    height: 4,
    marginBottom: 12,
    width: 44
  },
  content: {
    paddingBottom: 28
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 14
  },
  title: {
    color: colors.text,
    flex: 1,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    height: 42,
    justifyContent: 'center',
    width: 42
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14
  },
  categoryPill: {
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
  creator: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900'
  },
  importantPill: {
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
  time: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800'
  },
  summary: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 16
  },
  summaryMuted: {
    color: colors.textMuted,
    fontSize: 15,
    fontStyle: 'italic',
    lineHeight: 22,
    marginTop: 16
  },
  sectionLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 8,
    marginTop: 18,
    textTransform: 'uppercase'
  },
  reasonInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 14
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  categoryChoice: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12
  },
  categoryChoiceSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary
  },
  categoryChoiceText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '800'
  },
  categoryChoiceTextSelected: {
    color: colors.primary
  },
  source: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12
  },
  sourceText: {
    color: colors.primary,
    flex: 1,
    fontSize: 13,
    fontWeight: '700'
  },
  actions: {
    gap: 10,
    marginTop: 18
  },
  actionButton: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 14
  },
  openButton: {
    backgroundColor: colors.primary
  },
  openButtonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '900'
  },
  doneButton: {
    backgroundColor: colors.successSoft,
    borderColor: '#BDEAD4',
    borderWidth: 1
  },
  doneButtonText: {
    color: colors.success,
    fontSize: 15,
    fontWeight: '900'
  },
  reminderButton: {
    backgroundColor: colors.primarySoft,
    borderColor: '#DAD6FF',
    borderWidth: 1
  },
  reminderButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '900'
  },
  clearReminderButton: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1
  },
  clearReminderText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '900'
  },
  deleteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44
  },
  deleteButtonText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '900'
  },
  reminderOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(21, 20, 31, 0.34)',
    justifyContent: 'center',
    padding: 22
  },
  reminderPickerCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: 14,
    width: '100%'
  },
  reminderPickerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  reminderPickerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900'
  },
  reminderIconButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: 'center',
    width: 36
  },
  reminderPickerActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10
  },
  reminderPickerButton: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44
  },
  reminderCancelButton: {
    backgroundColor: colors.surfaceMuted
  },
  reminderDoneButton: {
    backgroundColor: colors.primary
  },
  reminderCancelText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900'
  },
  reminderDoneText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '900'
  }
});
