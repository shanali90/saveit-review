import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '@/constants/theme';
import { AppError } from '@/types';

type ErrorBannerProps = {
  error: AppError;
  onDismiss: (id: string) => void;
};

export function ErrorBanner({ error, onDismiss }: ErrorBannerProps) {
  return (
    <View style={styles.banner}>
      <Feather name="alert-circle" size={18} color={colors.warning} />
      <Text style={styles.text}>{error.message}</Text>
      <Pressable accessibilityRole="button" onPress={() => onDismiss(error.id)} style={styles.close}>
        <Feather name="x" size={18} color={colors.warning} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: 'center',
    backgroundColor: colors.warningSoft,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 18,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  text: {
    color: colors.warning,
    flex: 1,
    fontSize: 13,
    lineHeight: 18
  },
  close: {
    padding: 4
  }
});
