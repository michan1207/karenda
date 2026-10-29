import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Card, Decorations, Heart, Mascot, MASCOT_NAME, Ribbon, Text } from './components';
import { useColors } from './theme';

const POINTS = [
  {
    title: '予定と体調の「ぶつかり」を先に知らせます',
    body: '生理やPMSの時期に出張やプレゼンが重なりそうなとき、前もってお知らせします。',
  },
  {
    title: 'データはこの端末の中だけ',
    body: '記録も予定も外部のサーバーには送りません。アカウント登録もいりません。',
  },
  {
    title: 'カレンダーは読むだけ',
    body: 'このあとカレンダーへのアクセスを確認します。予定を書き換えたり、外に送ったりはしません。',
  },
  {
    title: '予測は目安です',
    body: '医療的な診断や避妊には使えません。体調が気になるときは医療機関に相談してください。',
  },
];

export default function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const colors = useColors();
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Decorations colors={colors} />
      <View style={styles.hero}>
        <Mascot colors={colors} size={150} />
        <Text style={[styles.name, { color: colors.pinkText, backgroundColor: colors.surface }]}>
          案内役の{MASCOT_NAME}だよ。よろしくね
        </Text>
        <Ribbon colors={colors} text="Cocomia" />
      </View>
      <Text style={[styles.lead, { color: colors.text }]}>体調の波に合わせて、予定を守るカレンダー</Text>
      {POINTS.map((point) => (
        <Card key={point.title} colors={colors} style={styles.point}>
          <View style={styles.pointHead}>
            <Heart color={colors.heart} size={12} />
            <Text style={[styles.pointTitle, { color: colors.pinkText }]}>{point.title}</Text>
          </View>
          <Text style={[styles.pointBody, { color: colors.muted }]}>{point.body}</Text>
        </Card>
      ))}
      <Button colors={colors} label="はじめる" onPress={onDone} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, gap: 14 },
  hero: { alignItems: 'center', gap: 8, marginTop: 16 },
  name: { fontSize: 14, fontWeight: '700', borderRadius: 999, overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 4 },
  lead: { fontSize: 17, marginBottom: 8, textAlign: 'center' },
  point: { gap: 4 },
  pointHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pointTitle: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  pointBody: { fontSize: 14, lineHeight: 21 },
});
