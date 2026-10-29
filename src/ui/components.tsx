import { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { Colors, radius } from './theme';

/** 白い地・大きめの角丸・やわらかい影のカード。カード状のものはすべてこれを通す */
export function Card({ colors, style, children }: { colors: Colors; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return <View style={[styles.card, { backgroundColor: colors.surface, boxShadow: colors.shadow }, style]}>{children}</View>;
}

/** 飾りのハート。絵文字は端末で形が変わるので、正方形と丸2つで描く */
export function Heart({ color, size = 10 }: { color: string; size?: number }) {
  const a = size / 1.707; // 正方形の一辺＝丸の直径
  const cx = size / 2;
  const cy = a * 0.854;
  const part = { position: 'absolute', width: a, height: a, backgroundColor: color, top: cy - a / 2 } as const;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: a * 1.561 }}>
      <View style={[part, { left: cx - a / 2, transform: [{ rotate: '45deg' }] }]} />
      <View style={[part, { left: cx - 0.854 * a, top: cy - 0.854 * a, borderRadius: a / 2 }]} />
      <View style={[part, { left: cx - 0.146 * a, top: cy - 0.854 * a, borderRadius: a / 2 }]} />
    </View>
  );
}

/** ハートで挟んだカプセル型の見出し（Amicuna のピル見出し） */
export function PillHeading({ colors, text }: { colors: Colors; text: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: colors.roseSoft }]}>
      <Heart color={colors.rose} />
      <Text accessibilityRole="header" style={[styles.pillText, { color: colors.text }]}>
        {text}
      </Text>
      <Heart color={colors.rose} />
    </View>
  );
}

/** 予定と重なる印。しっかり注意は塗りの丸、少し注意は枠だけの丸で、色だけに頼らない */
export function AlertMark({ colors, strong, size = 16 }: { colors: Colors; strong: boolean; size?: number }) {
  const tone = strong ? colors.alertStrong : colors.alertMild;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.mark,
        { width: size, height: size, borderColor: tone, backgroundColor: strong ? tone : 'transparent' },
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
    <View style={[styles.notice, { backgroundColor: colors.roseSoft }]}>
      <Text style={[styles.body, { color: colors.text }]}>{text}</Text>
      {action && (
        <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={8} style={styles.link}>
          <Text style={[styles.linkLabel, { color: colors.accent }]}>{action.label}</Text>
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
  const tone = disabled ? colors.muted : kind === 'danger' ? colors.danger : colors.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        disabled
          ? { backgroundColor: colors.disabledSurface, borderColor: colors.disabledSurface }
          : { backgroundColor: filled ? tone : colors.surface, borderColor: tone, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={[styles.buttonLabel, { color: filled && !disabled ? colors.onAccent : tone }]}>{label}</Text>
    </Pressable>
  );
}

export function Section({ colors, title, children }: { colors: Colors; title: string; children: ReactNode }) {
  return (
    <Card colors={colors}>
      <PillHeading colors={colors} text={title} />
      {children}
    </Card>
  );
}

export const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: 16, gap: 10 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  pillText: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  mark: { borderRadius: radius.pill, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  markText: { fontWeight: '700', textAlign: 'center' },
  notice: { borderRadius: radius.lg, padding: 14, gap: 6 },
  body: { fontSize: 14, lineHeight: 21 },
  link: { minHeight: 44, justifyContent: 'center' },
  linkLabel: { fontSize: 15, fontWeight: '600' },
  button: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1.5, alignItems: 'center' },
  buttonLabel: { fontSize: 16, fontWeight: '600' },
});
