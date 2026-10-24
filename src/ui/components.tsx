import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from './theme';

export function Notice({
  colors,
  text,
  action,
}: {
  colors: Colors;
  text: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <Text style={[styles.body, { color: colors.text }]}>{text}</Text>
      {action && (
        <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={8}>
          <Text style={[styles.link, { color: colors.accent }]}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function Button({
  colors,
  label,
  onPress,
  kind = 'primary',
  disabled = false,
}: {
  colors: Colors;
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  const filled = kind === 'primary';
  const tone = kind === 'danger' ? colors.red : colors.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: filled ? tone : 'transparent', borderColor: tone, opacity: disabled || pressed ? 0.6 : 1 },
      ]}
    >
      <Text style={[styles.buttonLabel, { color: filled ? colors.onAccent : tone }]}>{label}</Text>
    </Pressable>
  );
}

export function Section({ colors, title, children }: { colors: Colors; title: string; children: ReactNode }) {
  return (
    <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

export const styles = StyleSheet.create({
  notice: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 6 },
  body: { fontSize: 14, lineHeight: 21 },
  link: { fontSize: 15, fontWeight: '600' },
  button: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1.5, alignItems: 'center' },
  buttonLabel: { fontSize: 16, fontWeight: '600' },
  section: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
});
