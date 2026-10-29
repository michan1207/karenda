import { useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { addDays, ConflictAlert, DateKey } from '../engine';
import { AlertMark, Button, Card, Notice, PillHeading } from './components';
import { dayTitle } from './format';
import { Colors, radius, useColors } from './theme';
import type { Karenda } from './useKarenda';
import { UPCOMING_DAYS } from './useUpcomingAlerts';

/** パートナーにLINEなどで送る見本の文と、選ぶボタンの名前（2026-10-28 オーナー指定の文面） */
const TEMPLATES: [string, string][] = [
  ['本日より省エネモード（生理）に入りました🔋\n省電力で動くので、やさしく見守ってください（笑）', '省エネモード'],
  ['【緊急速報】生理が始まりました！\n本日から「取扱注意（優しく接する）」指定期間となります⚠️笑', '緊急速報'],
  ['生理到来につき、本日よりポンコツ化しております🤖\nちょっとボーッとしてても許してね！', 'ポンコツ化'],
  ['生理でHP（体力量）がほぼゼロです……🪫\nゴロゴロしながら充電するので、温かい目で見守ってください！', 'HPほぼゼロ'],
  ['今日から生理になっちゃいました💦\nちょっと体調重めなので、のんびり過ごさせてもらえると助かります！', '体調重め'],
  [
    '生理が始まったので、もしイライラしたり落ち込んで見えたらごめんね😢\nホルモンのせいなので優しくしてもらえると嬉しいです！',
    'イライラごめん',
  ],
  ['今日から生理になっちゃった！\n今度の予定は、無理せずゆっくり過ごせるプランにしてもらえると助かります🙇‍♀️', '予定ゆっくり'],
  ['今日から生理期間に入りました！\n今月も体調見ながらマイペースに過ごします〜！', 'マイペース'],
];

/** alerts は閉じたものを除いた、今日から30日間の警告 */
type Props = { k: Karenda; today: DateKey; alerts: ConflictAlert[] };

export default function AlertsScreen({ k, today, alerts }: Props) {
  const colors = useColors();
  const [template, setTemplate] = useState(TEMPLATES[0][0]);
  // null の間は見本の文のまま。書き換えたら、その文を送る
  const [edited, setEdited] = useState<string | null>(null);
  const text = edited ?? template;

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        これから{UPCOMING_DAYS}日のお知らせ
      </Text>
      <Text style={[styles.sub, { color: colors.muted }]}>
        {dayTitle(today)}〜{dayTitle(addDays(today, UPCOMING_DAYS))}
      </Text>
      <Card colors={colors}>
        <PillHeading colors={colors} text="パートナーに送る文の見本" />
        <Chips
          colors={colors}
          options={TEMPLATES}
          value={template}
          onPick={(id) => {
            setTemplate(id);
            setEdited(null);
          }}
        />
        <TextInput
          accessibilityLabel="送る文"
          value={text}
          onChangeText={setEdited}
          multiline
          style={[styles.input, { color: colors.text, borderColor: colors.line, backgroundColor: colors.background }]}
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
          文は自由に書き換えられます。見本を押すと元の文に戻ります。LINEなどで送れて、予定の中身は送りません。
        </Text>
      </Card>

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

function Chips<T extends string>({
  colors,
  options,
  value,
  onPick,
}: {
  colors: Colors;
  options: [T, string][];
  value: T;
  onPick: (id: T) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map(([id, label]) => {
        const selected = id === value;
        return (
          <Pressable
            key={id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onPick(id)}
            hitSlop={4}
            style={[
              styles.chip,
              selected
                ? { borderColor: colors.accent, backgroundColor: colors.pms }
                : { borderColor: colors.line, backgroundColor: colors.surface },
            ]}
          >
            <Text style={[styles.chipText, { color: selected ? colors.accent : colors.text }, selected && styles.chipSelected]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function AlertCard({ alert, onDismiss }: { alert: ConflictAlert; onDismiss: () => void }) {
  const colors = useColors();
  const strong = alert.level === 'red';
  const tone = strong ? colors.alertStrong : colors.alertMild;
  return (
    <Card colors={colors} style={{ backgroundColor: strong ? colors.alertStrongSoft : colors.alertMildSoft }}>
      <View style={styles.cardHead}>
        <View style={styles.badgeRow}>
          <AlertMark colors={colors} strong={strong} />
          <Text
            style={[
              styles.badge,
              { borderColor: tone },
              strong ? { color: colors.onAccent, backgroundColor: tone } : { color: tone },
            ]}
          >
            {strong ? 'しっかり注意' : '少し注意'}
          </Text>
        </View>
        <Text style={[styles.date, { color: colors.muted }]}>{dayTitle(alert.date)}</Text>
      </View>
      <Text style={[styles.eventTitle, { color: colors.text }]}>{alert.title || '（タイトルなし）'}</Text>
      <Text style={[styles.message, { color: colors.text }]}>{alert.message}</Text>
      <View style={styles.actions}>
        <Button colors={colors} kind="secondary" label="わかった" onPress={onDismiss} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '700', marginTop: 8 },
  sub: { fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 13 },
  chipSelected: { fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, lineHeight: 22 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: {
    fontSize: 12,
    fontWeight: '700',
    borderWidth: 1,
    borderRadius: radius.pill,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  date: { fontSize: 13 },
  eventTitle: { fontSize: 16, fontWeight: '700' },
  message: { fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
});
