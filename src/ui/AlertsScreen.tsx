import { useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { addDays, ConflictAlert, DateKey, partnerMessage, PartnerWording } from '../engine';
import { Button, Notice } from './components';
import { dayTitle } from './format';
import { useColors } from './theme';
import type { Karenda } from './useKarenda';
import { UPCOMING_DAYS } from './useUpcomingAlerts';

const WORDINGS: [PartnerWording, string][] = [
  ['period', '生理'],
  ['girlsDay', '女の子の日'],
  ['soft', '体調をぼかす'],
  ['monthly', '月のもの'],
  ['thatDay', 'あの日'],
  ['moon', 'お月さまの日'],
  ['lowHp', 'HPひくめ'],
  ['rest', 'おやすみモード'],
];

/** alerts は閉じたものを除いた、今日から30日間の警告 */
type Props = { k: Karenda; today: DateKey; alerts: ConflictAlert[] };

export default function AlertsScreen({ k, today, alerts }: Props) {
  const colors = useColors();
  const [wording, setWording] = useState<PartnerWording>('period');
  const message = partnerMessage(k.starts, k.settings, today, wording);
  // null の間は見本の文のまま。書き換えたら、その文を送る
  const [edited, setEdited] = useState<string | null>(null);
  const text = edited ?? message ?? '';
  const pick = (id: PartnerWording) => {
    setWording(id);
    setEdited(null);
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        これから{UPCOMING_DAYS}日のお知らせ
      </Text>
      <Text style={[styles.sub, { color: colors.muted }]}>
        {dayTitle(today)}〜{dayTitle(addDays(today, UPCOMING_DAYS))}
      </Text>
      {message && (
        <View style={[styles.share, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.sub, { color: colors.muted }]}>パートナーに伝える言い方</Text>
          <View style={styles.chips}>
            {WORDINGS.map(([id, label]) => {
              const selected = id === wording;
              return (
                <Pressable
                  key={id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => pick(id)}
                  hitSlop={4}
                  style={[styles.chip, { borderColor: selected ? colors.accent : colors.line }]}
                >
                  <Text style={[styles.chipText, { color: selected ? colors.accent : colors.text }]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            accessibilityLabel="送る文"
            value={text}
            onChangeText={setEdited}
            multiline
            style={[styles.input, { color: colors.text, borderColor: colors.line }]}
          />
          {/* 送る前に開けなかっただけなので、失うものは無い */}
          <Button
            colors={colors}
            kind="secondary"
            label="パートナーに伝える"
            disabled={!text.trim()}
            onPress={() => Share.share({ message: text }).catch(() => {})}
          />
          <Text style={[styles.sub, { color: colors.muted }]}>
            文は自由に書き換えられます。言い方を押すと見本に戻ります。LINEなどで送れて、予定の中身は送りません。
          </Text>
        </View>
      )}

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
  share: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 13 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, lineHeight: 22 },
  card: { borderWidth: 1, borderLeftWidth: 4, borderRadius: 12, padding: 14, gap: 6 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  badge: { fontSize: 12, fontWeight: '700', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  date: { fontSize: 13 },
  eventTitle: { fontSize: 16, fontWeight: '700' },
  message: { fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
});
