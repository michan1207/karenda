import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ConflictAlert } from '../engine';
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
  const tone = kind === 'danger' ? colors.danger : colors.accent;
  // 押せない時は透過で薄くせず、地と文字の色を変える（透過だと文字が読めなくなる）
  const fill = disabled ? colors.disabledSurface : filled ? tone : 'transparent';
  const border = disabled ? colors.disabledSurface : tone;
  const text = disabled ? colors.muted : filled ? colors.onAccent : tone;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: fill, borderColor: border, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Text style={[styles.buttonLabel, { color: text }]}>{label}</Text>
    </Pressable>
  );
}

// 予定と重なる印。しっかり注意＝塗りの丸、少し注意＝枠だけの丸で、色が見分けにくくても形で分かる
export function AlertMark({ colors, level, size }: { colors: Colors; level: ConflictAlert['level']; size: 12 | 16 }) {
  const strong = level === 'red';
  const tone = strong ? colors.alertStrong : colors.alertMild;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.mark,
        { width: size, height: size, borderRadius: size / 2, borderColor: tone, backgroundColor: strong ? tone : 'transparent' },
      ]}
    >
      <Text
        allowFontScaling={false}
        style={[styles.markText, { fontSize: size * 0.7, lineHeight: size * 0.9, color: strong ? colors.onAccent : tone }]}
      >
        !
      </Text>
    </View>
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
  mark: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  markText: { fontWeight: '800', textAlign: 'center' },
});
