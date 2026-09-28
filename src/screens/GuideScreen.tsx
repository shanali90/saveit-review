import { Feather } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii } from '@/constants/theme';

type GuideScreenProps = {
  onClose: () => void;
};

const SECTIONS = [
  {
    icon: 'share-2' as const,
    title: '1. Saving a post',
    steps: [
      'Open any app (Instagram, YouTube, TikTok, etc.)',
      'Tap the Share button on the post you want to save',
      'Pick SaveIt from the share sheet',
      'Add a note about why you\'re saving it (optional)',
      'Tap Save — done! You\'ll get a reminder later.',
    ],
  },
  {
    icon: 'search' as const,
    title: '2. Finding SaveIt in the share sheet',
    steps: [
      'SaveIt may appear at the far end of the share row the first time.',
      'Android automatically moves frequently used apps forward over time.',
      'On some devices, you can long-press the SaveIt icon in the share sheet to pin it for faster access.',
    ],
  },
  {
    icon: 'home' as const,
    title: '3. Where saved posts go',
    steps: [
      'All — everything you\'ve saved, newest first.',
      'Unwatched — posts you haven\'t watched or read yet.',
      'Done — posts you\'ve marked as watched.',
      'Reminders — posts with a custom reminder set.',
      'Discover — browse your saves by category.',
      'Settings — reminders, notifications, and account.',
    ],
  },
  {
    icon: 'tag' as const,
    title: '4. Categories',
    steps: [
      'SaveIt automatically categorizes each save (Cooking, Tech, Fitness, etc.).',
      'To change a category, open the post detail and tap the category chip.',
      'Categories help you rediscover content in the Discover tab.',
    ],
  },
  {
    icon: 'bell' as const,
    title: '5. Notification buttons',
    steps: [
      'Watch now — opens the link directly in the original app.',
      'Mark done — marks the post as watched and archives it.',
      'Snooze — pushes the reminder back by one day.',
    ],
  },
  {
    icon: 'clock' as const,
    title: '6. How reminders work',
    steps: [
      'SaveIt sends a daily reminder with your top-priority unwatched save.',
      'You choose the time and frequency in Settings.',
      'You can also set a custom reminder for any specific post.',
      'Tip: allow SaveIt to run in the background (Settings → Background Reminders) so reminders arrive even if you haven\'t opened the app in weeks.',
    ],
  },
];

export function GuideScreen({ onClose }: GuideScreenProps) {
  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>How to use SaveIt</Text>
        <Pressable onPress={onClose} style={styles.closeButton}>
          <Feather name="x" size={22} color={colors.text} />
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.iconCircle}>
                <Feather name={section.icon} size={18} color={colors.primary} />
              </View>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
            {section.steps.map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.bullet} />
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        ))}
        <View style={styles.footer}>
          <Feather name="heart" size={16} color={colors.textMuted} />
          <Text style={styles.footerText}>Crafted by Shan Ali Keerio</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  closeButton: {
    padding: 6,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EFEDFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: 44,
    marginBottom: 8,
    gap: 10,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 7,
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerText: {
    fontSize: 13,
    color: colors.textMuted,
  },
});
