import { ReactNode } from 'react';
import { Image, Pressable, Text as BaseText, StyleProp, StyleSheet, TextProps, View, ViewStyle } from 'react-native';

import { Colors, fonts, radius } from './theme';

/** 文字はすべてこれを通す。同梱のフォントは fontWeight では太くならないので、太さに合う書体を選ぶ */
export function Text({ style, ...props }: TextProps) {
  const weight = StyleSheet.flatten(style)?.fontWeight;
  const bold = weight === '600' || weight === '700' || weight === 'bold';
  return <BaseText {...props} style={[style, { fontFamily: bold ? fonts.bold : fonts.regular, fontWeight: 'normal' }]} />;
}

/** 白い地・ピンクの枠・大きな角丸・やわらかい影のカード。カード状のものはすべてこれを通す */
export function Card({ colors, style, children }: { colors: Colors; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line, boxShadow: colors.shadow }, style]}>
      {children}
    </View>
  );
}

const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const;

/** 飾りのハート。絵文字は端末で形が変わるので、正方形と丸2つで描く */
export function Heart({ color, size = 10 }: { color: string; size?: number }) {
  const a = size / 1.707; // 正方形の一辺＝丸の直径
  const cx = size / 2;
  const cy = a * 0.854;
  const part = { position: 'absolute', width: a, height: a, backgroundColor: color, top: cy - a / 2 } as const;
  return (
    <View {...hidden} style={{ width: size, height: a * 1.561 }}>
      <View style={[part, { left: cx - a / 2, transform: [{ rotate: '45deg' }] }]} />
      <View style={[part, { left: cx - 0.854 * a, top: cy - 0.854 * a, borderRadius: a / 2 }]} />
      <View style={[part, { left: cx - 0.146 * a, top: cy - 0.854 * a, borderRadius: a / 2 }]} />
    </View>
  );
}

/** 飾りのお花。花びら5枚と黄色いしべ */
export function Flower({ colors, size = 14 }: { colors: Colors; size?: number }) {
  const petal = size * 0.42;
  const r = (size - petal) / 2;
  return (
    <View {...hidden} style={{ width: size, height: size }}>
      {[0, 72, 144, 216, 288].map((deg) => (
        <View
          key={deg}
          style={{
            position: 'absolute',
            width: petal,
            height: petal,
            borderRadius: petal / 2,
            backgroundColor: colors.flower,
            left: r + r * Math.sin((deg * Math.PI) / 180),
            top: r - r * Math.cos((deg * Math.PI) / 180),
          }}
        />
      ))}
      <View
        style={{
          position: 'absolute',
          width: petal * 0.8,
          height: petal * 0.8,
          borderRadius: petal,
          backgroundColor: colors.sparkle,
          left: (size - petal * 0.8) / 2,
          top: (size - petal * 0.8) / 2,
        }}
      />
    </View>
  );
}

/** 画面の上のほうに散らすハート・お花・キラキラ。触れても何も起きない */
export function Decorations({ colors }: { colors: Colors }) {
  const sparkle = (size: number) => (
    <Text allowFontScaling={false} style={{ fontSize: size, lineHeight: size + 2, color: colors.sparkle }}>
      ✦
    </Text>
  );
  return (
    <View {...hidden} pointerEvents="none" style={styles.decorations}>
      <View style={[styles.deco, { top: 6, left: '4%' }]}>
        <Heart color={colors.heart} size={16} />
      </View>
      <View style={[styles.deco, { top: 2, left: '30%' }]}>{sparkle(12)}</View>
      <View style={[styles.deco, { top: 8, right: '28%' }]}>
        <Flower colors={colors} size={16} />
      </View>
      <View style={[styles.deco, { top: 4, right: '5%' }]}>{sparkle(14)}</View>
      <View style={[styles.deco, { top: 64, right: '2%' }]}>
        <Heart color={colors.flower} size={12} />
      </View>
      <View style={[styles.deco, { top: 70, left: '1%' }]}>
        <Flower colors={colors} size={12} />
      </View>
    </View>
  );
}

/** 画面の見出し。ハートで挟んだピンクのリボン */
export function Ribbon({ colors, text }: { colors: Colors; text: string }) {
  return (
    <View style={[styles.ribbon, { backgroundColor: colors.pink, boxShadow: colors.shadow }]}>
      <Heart color={colors.onPink} size={12} />
      <Text accessibilityRole="header" style={[styles.ribbonText, { color: colors.onPink }]}>
        {text}
      </Text>
      <Heart color={colors.onPink} size={12} />
    </View>
  );
}

/** カードの中の見出し。お花とハートで挟んだ淡いピンクのカプセル */
export function PillHeading({ colors, text }: { colors: Colors; text: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: colors.pinkSoft }]}>
      <Flower colors={colors} size={14} />
      <Text accessibilityRole="header" style={[styles.pillText, { color: colors.pinkText }]}>
        {text}
      </Text>
      <Heart color={colors.heart} />
    </View>
  );
}

/** 案内役のうさぎ（assets/mascot.png）。飾りなので読み上げない */
export function Mascot({ size }: { size: number }) {
  return <Image {...hidden} source={require('../../assets/mascot.png')} style={{ width: size, height: size }} />;
}

/** うさぎと吹き出し。吹き出しの文だけ読み上げる */
export function MascotSays({ colors, text, size = 76 }: { colors: Colors; text: string; size?: number }) {
  return (
    <View style={styles.mascotRow}>
      <Mascot size={size} />
      <View style={[styles.bubble, { backgroundColor: colors.surface, borderColor: colors.line, boxShadow: colors.shadow }]}>
        <Text style={[styles.body, { color: colors.text }]}>{text}</Text>
      </View>
    </View>
  );
}

/** 予定と重なる印。しっかり注意は塗りの丸、少し注意は枠だけの丸で、色だけに頼らない */
export function AlertMark({ colors, strong, size = 16 }: { colors: Colors; strong: boolean; size?: number }) {
  const tone = strong ? colors.alertStrong : colors.alertMild;
  return (
    <View
      {...hidden}
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
    <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.line }]}>
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
  const tone = disabled ? colors.muted : kind === 'danger' ? colors.danger : filled ? colors.pink : colors.pinkText;
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
          : {
              backgroundColor: filled ? tone : colors.surface,
              borderColor: filled ? tone : kind === 'danger' ? tone : colors.line,
              boxShadow: filled ? colors.shadow : undefined,
              opacity: pressed ? 0.7 : 1,
            },
      ]}
    >
      <Text style={[styles.buttonLabel, { color: filled && !disabled ? colors.onPink : tone }]}>{label}</Text>
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
  card: { borderWidth: 2, borderRadius: radius.card, padding: 16, gap: 10 },
  decorations: { position: 'absolute', top: 0, left: 0, right: 0, height: 90 },
  deco: { position: 'absolute' },
  ribbon: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 8,
    borderRadius: radius.pill,
    paddingHorizontal: 22,
    paddingVertical: 8,
  },
  ribbonText: { fontSize: 19, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
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
  mascotRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bubble: { flex: 1, borderWidth: 2, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  mark: { borderRadius: radius.pill, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  markText: { fontWeight: '700', textAlign: 'center' },
  notice: { borderWidth: 2, borderRadius: 18, padding: 14, gap: 6 },
  body: { fontSize: 14, lineHeight: 21 },
  link: { minHeight: 44, justifyContent: 'center' },
  linkLabel: { fontSize: 15, fontWeight: '600' },
  button: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 2, alignItems: 'center' },
  buttonLabel: { fontSize: 16, fontWeight: '600' },
});
