import { Feather } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useMemo, useState } from 'react';
import { Alert, Linking, Platform as RNPlatform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SegmentedControl } from '@/components/SegmentedControl';
import { colors, platformColors, radii } from '@/constants/theme';
import { parseReminderTime } from '@/services/time';
import { platformDisplayName } from '@/services/url';
import { getInstalledVersionName } from '@/services/updateChecker';
import { getOemGuidance, requestBatteryExemption } from '@/services/battery';
import { MaxItemsWarning, NotificationStyle, Platform as SavePlatform, ReminderFrequency, UserSettings } from '@/types';

type SettingsMode = 'demo' | 'authenticated';

type SettingsScreenProps = {
  settings: UserSettings;
  doneCount: number;
  mode: SettingsMode;
  onUpdateSettings: (patch: Partial<UserSettings>) => void | Promise<void>;
  onClearDone: () => void;
  onClearAllData: () => void;
  onSignOut: () => void;
  onRequestNotifications: () => void;
  onSignInGoogle?: () => void;
  onShowTutorial: () => void;
  onToast?: (msg: string) => void;
};

const FREQUENCY_OPTIONS = [
  { label: 'Daily', value: 'daily' as const },
  { label: 'Every 2 days', value: 'every2days' as const },
  { label: 'Weekly', value: 'weekly' as const }
];

const STYLE_OPTIONS = [
  { label: 'Summary', value: 'summary' as const },
  { label: 'Individual', value: 'individual' as const }
];

const MAX_OPTIONS: MaxItemsWarning[] = [10, 20, 50, 'unlimited'];

export function SettingsScreen({
  settings,
  doneCount,
  mode,
  onUpdateSettings,
  onClearDone,
  onClearAllData,
  onSignOut,
  onRequestNotifications,
  onSignInGoogle,
  onShowTutorial,
  onToast
}: SettingsScreenProps) {
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const reminderDate = useMemo(() => dateFromReminderTime(settings.reminder_time), [settings.reminder_time]);

  function confirmClearDone() {
    if (doneCount === 0) return;
    Alert.alert('Clear all Done items?', 'Your archive history for completed saves will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear archive', style: 'destructive', onPress: onClearDone }
    ]);
  }

  function confirmClearAllData() {
    const isDemo = mode === 'demo';
    Alert.alert(isDemo ? 'Clear demo data?' : 'Clear all saved data?', isDemo
      ? 'This removes only the demo saves and settings stored on this device.'
      : 'This removes only your SaveIt rows in Supabase. Your Google account and demo data are untouched.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear data', style: 'destructive', onPress: onClearAllData }
    ]);
  }

  function handleReminderTimeChange(event: DateTimePickerEvent, selectedDate?: Date) {
    if (RNPlatform.OS === 'android') setTimePickerVisible(false);
    if (event.type !== 'set' || !selectedDate) return;
    void onUpdateSettings({ reminder_time: formatReminderTimeValue(selectedDate) });
  }

  function openReminderTimePicker() {
    if (RNPlatform.OS === 'android') {
      DateTimePickerAndroid.open({
        display: 'clock',
        mode: 'time',
        value: reminderDate,
        onChange: handleReminderTimeChange
      });
      return;
    }

    setTimePickerVisible(true);
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Settings</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reminders</Text>
          <View style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Reminder time</Text>
              <Text style={styles.rowHint}>Daily reminder time.</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={openReminderTimePicker} style={styles.timeButton}>
              <Feather name="clock" size={16} color={colors.primary} />
              <Text style={styles.timeButtonText}>{formatReminderTimeLabel(settings.reminder_time)}</Text>
            </Pressable>
          </View>
          {timePickerVisible && (
            <DateTimePicker
              display={RNPlatform.OS === 'ios' ? 'spinner' : 'default'}
              mode="time"
              onChange={handleReminderTimeChange}
              value={reminderDate}
            />
          )}

          <Text style={styles.controlLabel}>Frequency</Text>
          <SegmentedControl<ReminderFrequency>
            options={FREQUENCY_OPTIONS}
            value={settings.reminder_frequency}
            onChange={(reminder_frequency) => onUpdateSettings({ reminder_frequency })}
          />

          <Text style={styles.controlLabel}>Notification style</Text>
          <SegmentedControl<NotificationStyle>
            options={STYLE_OPTIONS}
            value={settings.notification_style}
            onChange={(notification_style) => onUpdateSettings({ notification_style })}
          />

          <View style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Notifications</Text>
              <Text style={styles.rowHint}>Reminders are the point of the app.</Text>
            </View>
            <Switch
              onValueChange={(value) => {
                onUpdateSettings({ notifications_enabled: value });
                if (value) onRequestNotifications();
              }}
              thumbColor={settings.notifications_enabled ? colors.primary : colors.surface}
              trackColor={{ false: colors.border, true: '#CFCBFF' }}
              value={settings.notifications_enabled}
            />
          </View>
          {RNPlatform.OS === 'android' && (
            <>
              <View style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 8, paddingTop: 16 }]}>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>Background Reminders</Text>
                  <Text style={styles.rowHint}>Prevent reminders from stopping after weeks of inactivity.</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={requestBatteryExemption}
                  style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
                >
                  <Text style={styles.actionButtonText}>Allow</Text>
                </Pressable>
              </View>
              {getOemGuidance() ? (
                <Text style={styles.oemGuidance}>{getOemGuidance()}</Text>
              ) : null}
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Library limits</Text>
          <View style={styles.maxGrid}>
            {MAX_OPTIONS.map((option) => {
              const active = settings.max_items_warning === option;
              return (
                <Pressable
                  key={String(option)}
                  onPress={() => onUpdateSettings({ max_items_warning: option })}
                  style={[styles.maxButton, active && styles.maxButtonActive]}
                >
                  <Text style={[styles.maxText, active && styles.maxTextActive]}>
                    {option === 'unlimited' ? 'Unlimited' : option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connected platforms</Text>
          <View style={styles.platformList}>
            {settings.seen_platforms.length === 0 ? (
              <Text style={styles.emptyText}>Platforms appear here after your first save.</Text>
            ) : (
              settings.seen_platforms.map((platform) => <PlatformSeen key={platform} platform={platform} />)
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Archive management</Text>
          <Pressable
            disabled={doneCount === 0}
            onPress={confirmClearDone}
            style={[styles.archiveButton, doneCount === 0 && styles.disabledButton]}
          >
            <Feather name="archive" size={18} color={doneCount === 0 ? colors.textMuted : colors.primary} />
            <Text style={[styles.archiveText, doneCount === 0 && styles.disabledText]}>
              Clear all Done items ({doneCount})
            </Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data</Text>
          <Pressable style={styles.deleteAccountButton} onPress={confirmClearAllData}>
            <Text style={styles.deleteAccountText}>Clear all data</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          {mode === 'authenticated' ? (
            <Pressable style={styles.accountButton} onPress={onSignOut}>
              <Text style={styles.accountText}>Sign out</Text>
            </Pressable>
          ) : (
            <View style={styles.demoAccountContainer}>
              <View style={styles.demoStatus}>
                <Feather name="hard-drive" size={17} color={colors.textMuted} />
                <Text style={styles.demoStatusText}>Demo mode</Text>
              </View>
              {onSignInGoogle && (
                <Pressable style={styles.googleSignInButton} onPress={onSignInGoogle}>
                  <Feather name="chrome" size={17} color={colors.surface} />
                  <Text style={styles.googleSignInText}>Sign in with Google</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>
          <Pressable 
            style={[styles.archiveButton, { borderColor: colors.border, backgroundColor: colors.surfaceMuted, marginBottom: 12 }]}
            onPress={onShowTutorial}
          >
            <Feather name="help-circle" size={18} color={colors.primary} />
            <Text style={[styles.archiveText, { color: colors.primary }]}>Show tutorial again</Text>
          </Pressable>
          <Pressable 
            style={[styles.archiveButton, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}
            onPress={() => {
              const version = getInstalledVersionName();
              const os = RNPlatform.OS;
              const subject = `SaveIt Feedback (v${version} ${os})`;
              void Linking.openURL(`mailto:shanalikiru123@gmail.com?subject=${encodeURIComponent(subject)}`);
              if (onToast) onToast('Opening your email app to send the report...');
            }}
          >
            <Feather name="mail" size={18} color={colors.text} />
            <Text style={[styles.archiveText, { color: colors.text }]}>
              Report a problem
            </Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.aboutText}>SaveIt v{getInstalledVersionName()} · Crafted by Shan Ali Keerio</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PlatformSeen({ platform }: { platform: SavePlatform }) {
  const palette = platformColors[platform];
  return (
    <View style={styles.platformSeen}>
      <View style={[styles.platformDot, { backgroundColor: palette.accent }]} />
      <Text style={[styles.platformSeenText, { color: palette.fg }]}>{platformDisplayName(platform)}</Text>
    </View>
  );
}

function dateFromReminderTime(time: string): Date {
  const { hour, minute } = parseReminderTime(time);
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
}

function formatReminderTimeValue(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function formatReminderTimeLabel(time: string): string {
  const { hour, minute } = parseReminderTime(time);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute.toString().padStart(2, '0')} ${suffix}`;
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: colors.background,
    flex: 1
  },
  content: {
    paddingBottom: 18,
    paddingHorizontal: 18,
    paddingTop: 8
  },
  title: {
    color: colors.text,
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: 0,
    marginBottom: 14
  },
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    marginBottom: 12,
    padding: 14
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 12
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14
  },
  rowCopy: {
    flex: 1
  },
  rowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800'
  },
  rowHint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3
  },
  timeButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12
  },
  timeButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900'
  },
  controlLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 8,
    marginTop: 8,
    textTransform: 'uppercase'
  },
  maxGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  maxButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 14
  },
  maxButtonActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary
  },
  maxText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '900'
  },
  maxTextActive: {
    color: colors.primary
  },
  platformList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  platformSeen: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 12
  },
  platformDot: {
    borderRadius: 4,
    height: 8,
    width: 8
  },
  platformSeenText: {
    fontSize: 13,
    fontWeight: '900'
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20
  },
  archiveButton: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: '#DAD6FF',
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 46
  },
  archiveText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '900'
  },
  disabledButton: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border
  },
  disabledText: {
    color: colors.textMuted
  },
  accountButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    justifyContent: 'center',
    minHeight: 44
  },
  accountText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900'
  },
  demoStatus: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 44
  },
  demoStatusText: {
    color: colors.textMuted,
    fontSize: 15,
    minHeight: 44
  },
  demoAccountContainer: {
    gap: 8
  },
  googleSignInButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 44
  },
  googleSignInText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '900'
  },
  actionButton: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill
  },
  actionButtonPressed: {
    backgroundColor: '#DAD6FF'
  },
  actionButtonText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 13
  },
  oemGuidance: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
    fontStyle: 'italic'
  },
  deleteAccountButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginTop: 8
  },
  deleteAccountText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '900'
  },
  aboutText: {
    color: '#666666',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18
  }
});
