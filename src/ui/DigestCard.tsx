import { Pressable, StyleSheet, View } from 'react-native';

import { DateKey, MonthlyDigest } from '../engine';
import { AlertMark, Button, Card, Text } from './components';
import { dayTitle } from './format';
import { Colors, radius } from './theme';

/** その月の要注意のまとめ。上位3件を押すとその日を開き、ボタンでお知らせに移る */
export default function DigestCard({
  colors,
  digest,
  isThisMonth,
  month,
  onPick,
  openAlerts,
  nextMonth,
}: {
  colors: Colors;
  digest: MonthlyDigest;
  isThisMonth: boolean;
  month: number;
  onPick: (day: DateKey) => void;
  openAlerts: () => void;
  nextMonth: () => void;
}) {
  const name = isThisMonth ? '今月' : `${month}月`;
  if (digest.isEmpty) {
    return (
      <Card colors={colors}>
        <Text style={[styles.digestTitle, { color: colors.text }]}>{name}、重なる予定はありません</Text>
        {isThisMonth && <Button colors={colors} kind="secondary" label="来月を見る" onPress={nextMonth} />}
      </Card>
    );
  }
  return (
    <Card colors={colors}>
      <View style={styles.digestHead}>
        <Text style={[styles.digestTitle, { color: colors.text }]}>
          {name}の要注意 {digest.conflicts.length}件
        </Text>
        {digest.unreviewedCount > 0 && (
          <Text style={[styles.digestBadge, { color: colors.onAccent, backgroundColor: colors.alertStrong }]}>
            未確認 {digest.unreviewedCount}件
          </Text>
        )}
      </View>
      {digest.topThree.map((alert) => {
        const strong = alert.grade === 'A';
        const label = strong ? 'A 要注意' : 'B 注意';
        return (
          <Pressable
            key={`${alert.eventId}|${alert.date}`}
            accessibilityRole="button"
            // 日付の枠の読み上げと見分けがつくよう、予定の名前から読む
            accessibilityLabel={`「${alert.title}」${dayTitle(alert.date)} ${label}`}
            onPress={() => onPick(alert.date)}
            style={styles.digestRow}
          >
            <AlertMark colors={colors} strong={strong} />
            <Text style={[styles.digestGrade, { color: strong ? colors.alertStrong : colors.alertMild }]}>{alert.grade}</Text>
            <Text style={[styles.detailText, styles.digestText, { color: colors.text }]}>
              {dayTitle(alert.date)} {alert.title || '（タイトルなし）'}
            </Text>
          </Pressable>
        );
      })}
      <Button colors={colors} kind="secondary" label="お知らせで対処する" onPress={openAlerts} />
    </Card>
  );
}

const styles = StyleSheet.create({
  digestHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  digestTitle: { fontSize: 16, fontWeight: '700' },
  digestBadge: { fontSize: 12, fontWeight: '700', borderRadius: radius.pill, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 2 },
  digestRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  digestGrade: { fontSize: 14, fontWeight: '700' },
  digestText: { flexShrink: 1 },
  detailText: { fontSize: 14, lineHeight: 21 },
});
