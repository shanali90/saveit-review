import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii } from '@/constants/theme';

export function DiscoverScreen() {
  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.content}>
        <Text style={styles.title}>Discover</Text>
        <View style={styles.panel}>
          <Feather name="compass" size={34} color={colors.primary} />
          <Text style={styles.panelTitle}>Coming after the save loop is perfect.</Text>
          <Text style={styles.panelText}>
            This tab is reserved for future recommendations without distracting from the core library.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: colors.background,
    flex: 1
  },
  content: {
    flex: 1,
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
  panel: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 260,
    padding: 22
  },
  panelTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24,
    marginTop: 14,
    textAlign: 'center'
  },
  panelText: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: 'center'
  }
});
