import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from './components';
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
      <Text accessibilityRole="header" style={[styles.title, { color: colors.accent }]}>
        Cocomia
      </Text>
      <Text style={[styles.lead, { color: colors.text }]}>体調の波に合わせて、予定を守るカレンダー</Text>
      {POINTS.map((point) => (
        <View key={point.title} style={[styles.point, { borderColor: colors.line, backgroundColor: colors.surface }]}>
          <Text style={[styles.pointTitle, { color: colors.text }]}>{point.title}</Text>
          <Text style={[styles.pointBody, { color: colors.muted }]}>{point.body}</Text>
        </View>
      ))}
      <Button colors={colors} label="はじめる" onPress={onDone} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, gap: 14 },
  title: { fontSize: 34, fontWeight: '700', marginTop: 24 },
  lead: { fontSize: 17, marginBottom: 8 },
  point: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 4 },
  pointTitle: { fontSize: 16, fontWeight: '700' },
  pointBody: { fontSize: 14, lineHeight: 21 },
});
