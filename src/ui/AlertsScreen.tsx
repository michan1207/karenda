import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';

import { addDays, ConflictAlert, DateKey, Impact, monthlyReflection, planActions, Resolution, statusOf } from '../engine';
import { AlertMark, Button, Card, Decorations, MascotSays, Notice, PillHeading, Ribbon, Text } from './components';
import { dayTitle, shortDate } from './format';
import { Colors, fonts, radius, useColors } from './theme';
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

/** alerts は対応済みを除いた、今日から30日間のお知らせ */
type Props = { k: Karenda; today: DateKey; alerts: ConflictAlert[] };

export default function AlertsScreen({ k, today, alerts }: Props) {
  const colors = useColors();
  const [template, setTemplate] = useState(TEMPLATES[0][0]);
  // null の間は見本の文のまま。書き換えたら、その文を送る
  const [edited, setEdited] = useState<string | null>(null);
  const text = edited ?? template;
  const line =
    k.starts.length === 0
      ? '生理が始まった日を記録すると、ここでお知らせできるよ'
      : k.access === 'denied'
        ? 'カレンダーを見せてもらえると、予定との重なりを調べられるよ'
        : alerts.length
          ? `気をつけたい予定が${alerts.length}件あるよ。早めに準備しようね`
          : '重なる予定はないよ。いい調子！';

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Decorations colors={colors} />
      <View style={styles.title}>
        <Ribbon colors={colors} text={`これから${UPCOMING_DAYS}日のお知らせ`} />
      </View>
      <Text style={[styles.sub, styles.center, { color: colors.muted }]}>
        {dayTitle(today)}〜{dayTitle(addDays(today, UPCOMING_DAYS))}
      </Text>
      <MascotSays colors={colors} text={line} />
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
          label="パートナーに伝える"
          disabled={!text.trim()}
          onPress={async () => {
            const result = await Share.share({ message: text }).catch(() => null);
            // どの見本を使ったかだけ数える。文そのものは残さない
            if (result?.action === Share.sharedAction) {
              k.track('partner_message_sent', { template: edited === null ? (TEMPLATES.find(([body]) => body === template)?.[1] ?? '') : '書き換え' });
            }
          }}
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
        <AlertCard key={`${alert.eventId}|${alert.date}`} alert={alert} k={k} today={today} />
      ))}

      <ReflectionCard k={k} today={today} />
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
                ? { borderColor: colors.pink, backgroundColor: colors.pinkSoft }
                : { borderColor: colors.line, backgroundColor: colors.surface },
            ]}
          >
            <Text style={[styles.chipText, { color: selected ? colors.pinkText : colors.text }, selected && styles.chipSelected]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 何日も続く予定の、日ごとのきつさ。いちばんきつい日だけ色を付ける */
function SeriesBars({ colors, tone, series }: { colors: Colors; tone: string; series: NonNullable<ConflictAlert['series']> }) {
  return (
    <View>
      <Text style={[styles.sub, { color: colors.muted }]}>日ごとのきつさ（色のついた日がいちばんきつい日）</Text>
      <View style={styles.bars}>
        {series.days.map((day) => {
          const peak = day.date === series.peakDate;
          return (
            <View
              key={day.date}
              accessible
              accessibilityLabel={`${dayTitle(day.date)} ${day.label}${peak ? ' いちばんきつい日' : ''}`}
              style={styles.barColumn}
            >
              <View style={[styles.barTrack, { backgroundColor: colors.line }]}>
                <View style={[styles.bar, { height: `${Math.max(8, day.score)}%`, backgroundColor: peak ? tone : colors.muted }]} />
              </View>
              <Text style={[styles.barLabel, { color: peak ? tone : colors.muted }]}>{shortDate(day.date)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** 今月、お知らせで何をしたかの数。段取りできた数（ずらした・準備した・断った）を目立たせる。責める言い方はしない */
function ReflectionCard({ k, today }: { k: Karenda; today: DateKey }) {
  const colors = useColors();
  const reflection = monthlyReflection(k.resolutions, today.slice(0, 7));
  return (
    <Card colors={colors}>
      <PillHeading colors={colors} text={`${Number(today.slice(5, 7))}月のふりかえり`} />
      {reflection.total === 0 ? (
        <Text style={[styles.message, { color: colors.muted }]}>
          今月はまだ、対応した予定はありません。お知らせのカードで「ずらした」「準備した」などを押すと、ここで数えます。
        </Text>
      ) : (
        <>
          {RESOLUTIONS.map(([resolution, label]) => (
            <Text key={resolution} style={[styles.message, { color: colors.text }]}>
              {label} {reflection.byResolution[resolution]}件
            </Text>
          ))}
          <Text style={[styles.message, styles.strongText, { color: colors.pinkText }]}>
            段取りできた予定 {reflection.actionCount}件
          </Text>
        </>
      )}
    </Card>
  );
}

const IMPACT_LABEL: Record<Impact, string> = {
  moveable: '日にちを動かせる予定',
  mitigable: '準備で軽くできる予定',
  fixed: '日にちを動かせない予定',
};

const RESOLUTIONS: [Resolution, string][] = [
  ['shifted', 'ずらした'],
  ['prepared', '準備した'],
  ['declined', '断った'],
  ['proceeded', 'そのまま迎えた'],
];

/** 1件のお知らせ。なぜ・動かせるか・どうするかを出し、確認した／何をしたかを残せる */
function AlertCard({ alert, k, today }: { alert: ConflictAlert; k: Karenda; today: DateKey }) {
  const colors = useColors();
  const strong = alert.grade === 'A';
  const tone = strong ? colors.alertStrong : colors.alertMild;
  const title = alert.title || '（タイトルなし）';
  const state = statusOf(k.statuses, alert.eventId, alert.date).state;
  const actions = useMemo(
    () => planActions({ alert, event: alert.event, starts: k.starts, settings: k.settings, keywords: k.keywords, today }),
    [alert, k.starts, k.settings, k.keywords, today],
  );
  const altDates = actions.flatMap((action) => (action.kind === 'suggestAltDate' ? [action.date] : []));
  const deadline = actions.flatMap((action) => (action.kind === 'deadline' ? [action.text] : []))[0];
  const tasks = actions.flatMap((action) => (action.kind === 'prepTask' ? [action.text] : []));
  const decline = actions.flatMap((action) => (action.kind === 'declineTemplate' ? [action.text] : []))[0];

  return (
    <Card colors={colors} style={{ backgroundColor: strong ? colors.alertStrongSoft : colors.alertMildSoft, borderColor: tone }}>
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
            {strong ? 'A 要注意' : 'B 注意'}
          </Text>
        </View>
        <Text style={[styles.date, { color: colors.muted }]}>
          {alert.series
            ? `${dayTitle(alert.series.days[0].date)}〜${dayTitle(alert.series.days[alert.series.days.length - 1].date)}`
            : dayTitle(alert.date)}
        </Text>
      </View>
      <Text style={[styles.eventTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.message, { color: colors.text }]}>{alert.reasonText}</Text>
      {alert.series && <SeriesBars colors={colors} tone={tone} series={alert.series} />}
      {alert.confidenceNote && <Text style={[styles.sub, { color: colors.muted }]}>{alert.confidenceNote}</Text>}
      <Text style={[styles.sub, { color: colors.muted }]}>{IMPACT_LABEL[alert.impact]}</Text>
      {deadline && <Text style={[styles.message, styles.strongText, { color: colors.text }]}>{deadline}</Text>}
      {altDates.length > 0 && (
        <Text style={[styles.message, { color: colors.text }]}>ずらすなら：{altDates.map(dayTitle).join('、')}</Text>
      )}
      {tasks.map((task) => (
        <Text key={task} style={[styles.message, { color: colors.text }]}>
          ・{task}
        </Text>
      ))}
      {decline && (
        <Button colors={colors} kind="secondary" label="断りの文を送る" onPress={() => Share.share({ message: decline }).catch(() => {})} />
      )}
      {state === 'unreviewed' ? (
        <Button colors={colors} kind="secondary" label="確認した" onPress={() => k.dismiss(alert.eventId, alert.date)} />
      ) : (
        <Text style={[styles.sub, { color: colors.muted }]}>確認済み</Text>
      )}
      <Text style={[styles.sub, { color: colors.muted }]}>どうしましたか？選ぶと一覧から外れます。</Text>
      <View style={styles.chips}>
        {RESOLUTIONS.map(([resolution, label]) => (
          <Pressable
            key={resolution}
            accessibilityRole="button"
            accessibilityLabel={`「${title}」は${label}`}
            onPress={() => k.resolve(alert.eventId, alert.date, resolution)}
            style={[styles.chip, { borderColor: tone }]}
          >
            <Text style={[styles.chipText, { color: colors.text }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  title: { marginTop: 8 },
  center: { textAlign: 'center' },
  sub: { fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 13 },
  chipSelected: { fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.regular,
  },
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
  strongText: { fontWeight: '700' },
  bars: { flexDirection: 'row', gap: 6, paddingVertical: 4 },
  barColumn: { flex: 1, alignItems: 'center', gap: 4 },
  barTrack: { width: 14, height: 48, borderRadius: radius.pill, overflow: 'hidden', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: radius.pill },
  barLabel: { fontSize: 11 },
});
