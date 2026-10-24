import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { addDays, ConflictAlert, DateKey } from '../engine';
import { Button, Notice } from './components';
import { dayTitle } from './format';
import { useColors } from './theme';
import type { Karenda } from './useKarenda';
import { UPCOMING_DAYS } from './useUpcomingAlerts';

/** alerts は閉じたものを除いた、今日から30日間の警告 */
type Props = { k: Karenda; today: DateKey; alerts: ConflictAlert[] };

export default function AlertsScreen({ k, today, alerts }: Props) {
  const colors = useColors();

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        これから{UPCOMING_DAYS}日のお知らせ
      </Text>
      <Text style={[styles.sub, { color: colors.muted }]}>
        {dayTitle(today)}〜{dayTitle(addDays(today, UPCOMING_DAYS))}
      </Text>

      {k.access === 'denied' && (
        <Notice
          colors={colors}
          text="カレンダーへのアクセスが許可されていないため、予定との重なりを調べられません。"
          action={{ label: '設定アプリで許可する', onPress: () => Linking.openSettings() }}
        />
      )}
      {k.starts.length === 0 ? (
        <Notice colors={colors} text="生理の記録がまだ無いため、お知らせはありません。カレンダーで開始日を記録してください。" />
      ) : (
        k.access === 'granted' &&
        alerts.length === 0 && (
          <Notice colors={colors} text="気をつけたい時期と重なる予定はありません。" />
        )
      )}

      {alerts.map((alert) => (
        <AlertCard key={`${alert.eventId}|${alert.date}`} alert={alert} onDismiss={() => k.dismiss(alert.eventId, alert.date)} />
      ))}
    </ScrollView>
  );
}

function AlertCard({ alert, onDismiss }: { alert: ConflictAlert; onDismiss: () => void }) {
  const colors = useColors();
  const tone = alert.level === 'red' ? colors.red : colors.yellow;
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line, borderLeftColor: tone }]}>
      <View style={styles.cardHead}>
        <Text style={[styles.badge, { color: tone, borderColor: tone }]}>
          {alert.level === 'red' ? 'しっかり注意' : '少し注意'}
        </Text>
        <Text style={[styles.date, { color: colors.muted }]}>{dayTitle(alert.date)}</Text>
      </View>
      <Text style={[styles.eventTitle, { color: colors.text }]}>{alert.title || '（タイトルなし）'}</Text>
      <Text style={[styles.message, { color: colors.text }]}>{alert.message}</Text>
      <View style={styles.actions}>
        <Button colors={colors} kind="secondary" label="わかった" onPress={onDismiss} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '700', marginTop: 8 },
  sub: { fontSize: 13 },
  card: { borderWidth: 1, borderLeftWidth: 4, borderRadius: 12, padding: 14, gap: 6 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  badge: { fontSize: 12, fontWeight: '700', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  date: { fontSize: 13 },
  eventTitle: { fontSize: 16, fontWeight: '700' },
  message: { fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
});
