import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View
} from 'react-native';

import { Thumbnail } from '@/components/Thumbnail';
import { colors, radii, shadow } from '@/constants/theme';
import { detectPlatform, fetchMetadataPreview, getHostLabel, normalizeUrl, platformDisplayName, youtubeThumbnail } from '@/services/url';
import { formatRelativeTime } from '@/services/time';
import { MetadataPreview, SaveDraft, SaveResult } from '@/types';

const REASON_CHIPS = ['Try later', 'Inspiration', 'Learn this', 'Show someone', 'Buy this'];

type QuickSaveModalProps = {
  visible: boolean;
  initialUrl?: string;
  onClose: () => void;
  onSave: (draft: SaveDraft, options?: { forceDuplicate?: boolean }) => Promise<SaveResult>;
  onSaved: (message: string) => void;
  returnToSource?: boolean;
};

export function QuickSaveModal({
  visible,
  initialUrl,
  onClose,
  onSave,
  onSaved,
  returnToSource = false
}: QuickSaveModalProps) {
  const [url, setUrl] = useState('');
  const [reason, setReason] = useState('');
  const [selectedChip, setSelectedChip] = useState<string | null>(null);
  const [isImportant, setIsImportant] = useState(false);
  const [preview, setPreview] = useState<MetadataPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // PRIORITY 2: Refs for auto-focus after modal animation
  const urlInputRef = useRef<TextInput>(null);
  const reasonInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setUrl(initialUrl ?? '');
      setReason('');
      setSelectedChip(null);
      setIsImportant(false);
      setPreview(null);
    }
  }, [initialUrl, visible]);

  // PRIORITY 2: Auto-focus the appropriate input after modal slide animation.
  // On Android, focusing too early (before animation completes) silently fails,
  // so we delay by 400ms which is safely after the default Modal slide-in duration.
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      if (initialUrl) {
        // URL is pre-filled from share — focus the reason input
        reasonInputRef.current?.focus();
      } else {
        // No URL yet — focus the URL input so user can paste
        urlInputRef.current?.focus();
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [visible, initialUrl]);

  useEffect(() => {
    if (!visible || !url.trim()) {
      setPreview(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const timeout = setTimeout(() => controller.abort(), 5000);
        const nextPreview = await fetchMetadataPreview(url, { signal: controller.signal });
        clearTimeout(timeout);
        if (!cancelled) setPreview(nextPreview);
      } catch {
        if (!cancelled) {
          setPreview(buildFallbackPreview(url));
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 100);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [url, visible]);

  const canSave = useMemo(() => Boolean(url.trim()) && !saving, [saving, url]);

  async function handleSave(forceDuplicate = false) {
    if (!canSave) return;
    setSaving(true);
    let result: SaveResult;
    try {
      // PRIORITY 1: Wrap save in a 10-second timeout so it can never hang
      // indefinitely (e.g., if RLS silently rejects or network stalls).
      const SAVE_TIMEOUT_MS = 10_000;
      const savePromise = onSave(
        {
          url,
          saveReason: reason,
          saveReasonChip: selectedChip,
          isImportant,
          preview: preview ?? undefined
        },
        { forceDuplicate }
      );
      const timeoutPromise = new Promise<SaveResult>((_, reject) =>
        setTimeout(() => reject(new Error('Save timed out — please check your connection and try again.')), SAVE_TIMEOUT_MS)
      );
      result = await Promise.race([savePromise, timeoutPromise]);
    } catch (err) {
      const message = err instanceof Error && err.message
        ? err.message
        : 'Could not save this link. Try again in a moment.';
      result = { status: 'error', message };
    } finally {
      setSaving(false);
    }

    if (result.status === 'duplicate') {
      Alert.alert(
        'Already saved',
        `You already saved this ${formatRelativeTime(result.item.saved_at)}. Save again?`,
        [
          { text: 'No', style: 'cancel' },
          { text: 'Save again', onPress: () => handleSave(true) }
        ]
      );
      return;
    }

    if (result.status === 'error') {
      Alert.alert('Could not save', result.message);
      return;
    }

    onSaved('Saved! Quick reminder in 15 min');
    onClose();
    if (returnToSource && Platform.OS !== 'web') {
      setTimeout(() => BackHandler.exitApp(), 120);
    }
  }

  async function handleClose() {
    if (canSave) {
      await handleSave();
    } else {
      onClose();
    }
  }

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <Pressable style={styles.scrim} onPress={handleClose} />
        <TouchableWithoutFeedback accessible={false} onPress={Keyboard.dismiss}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>Quick Save</Text>
              <Text style={styles.title}>Save this</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={handleClose} style={styles.closeButton}>
              <Feather name="x" size={22} color={colors.text} />
            </Pressable>
          </View>

          <TextInput
            ref={urlInputRef}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onChangeText={setUrl}
            placeholder="Paste or share a URL"
            placeholderTextColor={colors.textMuted}
            style={styles.urlInput}
            value={url}
          />

          <View style={styles.preview}>
            {previewLoading ? (
              <>
                <View style={styles.previewSkeletonImage} />
                <View style={styles.previewSkeletonContent}>
                  <View style={styles.skeletonLineWide} />
                  <View style={styles.skeletonLineShort} />
                </View>
              </>
            ) : preview ? (
              <>
                <Thumbnail uri={preview.thumbnailUrl} platform={preview.platform} />
                <View style={styles.previewContent}>
                  <Text style={styles.previewTitle} numberOfLines={2}>
                    {preview.rawTitle}
                  </Text>
                  <Text style={styles.previewMeta}>
                    {preview.platform === 'other' ? 'Saved from web' : platformDisplayName(preview.platform)}
                  </Text>
                </View>
              </>
            ) : (
              <View style={styles.previewEmpty}>
                <Feather name="link" size={18} color={colors.textMuted} />
                <Text style={styles.previewMeta}>Paste a link to generate a preview.</Text>
              </View>
            )}
          </View>

          <TextInput
            ref={reasonInputRef}
            onChangeText={setReason}
            placeholder="Why are you saving this?"
            placeholderTextColor={colors.textMuted}
            style={styles.reasonInput}
            value={reason}
          />

          <View style={styles.chips}>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: isImportant }}
              onPress={() => setIsImportant((current) => !current)}
              style={[styles.chip, styles.importantChip, isImportant && styles.importantSelected]}
            >
              <Feather name="star" size={14} color={isImportant ? colors.surface : colors.primary} />
              <Text style={[styles.chipText, styles.importantText, isImportant && styles.importantTextSelected]}>
                Important
              </Text>
            </Pressable>
            {REASON_CHIPS.map((chip) => {
              const selected = selectedChip === chip;
              return (
                <Pressable
                  key={chip}
                  onPress={() => setSelectedChip(selected ? null : chip)}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{chip}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={!canSave}
            onPress={() => handleSave()}
            style={({ pressed }) => [styles.saveButton, !canSave && styles.saveDisabled, pressed && styles.pressed]}
          >
            <Feather name="bookmark" size={19} color={colors.surface} />
            <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save to SaveIt'}</Text>
          </Pressable>
        </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function buildFallbackPreview(url: string): MetadataPreview {
  const normalizedUrl = normalizeUrl(url);
  const platform = detectPlatform(normalizedUrl);
  return {
    url,
    normalizedUrl,
    platform,
    rawTitle: getHostLabel(normalizedUrl),
    rawDescription: '',
    thumbnailUrl: platform === 'youtube' ? youtubeThumbnail(normalizedUrl) : '',
    creatorHandle: null
  };
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
    maxHeight: '88%',
    paddingBottom: 20,
    paddingHorizontal: 18,
    paddingTop: 10
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.border,
    borderRadius: radii.pill,
    height: 4,
    marginBottom: 14,
    width: 44
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 2
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    height: 42,
    justifyContent: 'center',
    width: 42
  },
  urlInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 14
  },
  preview: {
    ...shadow,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    minHeight: 92,
    padding: 10
  },
  previewContent: {
    flex: 1,
    minWidth: 0
  },
  previewTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20
  },
  previewMeta: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6
  },
  previewEmpty: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center'
  },
  previewSkeletonImage: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    height: 78,
    width: 86
  },
  previewSkeletonContent: {
    flex: 1,
    gap: 10
  },
  skeletonLineWide: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    height: 16,
    width: '86%'
  },
  skeletonLineShort: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    height: 14,
    width: '50%'
  },
  reasonInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    marginTop: 12,
    minHeight: 48,
    paddingHorizontal: 14
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12
  },
  chip: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12
  },
  chipSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '800'
  },
  chipTextSelected: {
    color: colors.primary
  },
  importantChip: {
    borderColor: '#DAD6FF'
  },
  importantSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  importantText: {
    color: colors.primary
  },
  importantTextSelected: {
    color: colors.surface
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 18,
    minHeight: 54
  },
  saveDisabled: {
    opacity: 0.5
  },
  pressed: {
    backgroundColor: colors.primaryPressed
  },
  saveText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '900'
  }
});
