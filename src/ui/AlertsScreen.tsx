import { useState } from 'react';
import { Linking, ScrollView, Share, StyleSheet, View } from 'react-native';

import { Action, addDays, ConflictAlert, DateKey, Guard, Impact, monthlyReflection, Resolution, statusOf } from '../engine';
import { AlertMark, Button, Card, Chip, Decorations, Input, MascotSays, Notice, PillHeading, Ribbon, Text } from './components';
import { dayTitle, gradeLabel, shortDate, titleOf } from './format';
import { PARTNER_TEMPLATES } from './partnerTemplates';
import { radius, useColors } from './theme';
import type { Karenda } from './useKarenda';
import { UPCOMING_DAYS } from './useUpcomingAlerts';

/** alerts は対応済みを除いた、今日から30日間のお知らせ */
type Props = { k: Karenda; today: DateKey; alerts: ConflictAlert[]; actionsOf: Guard['actionsOf'] };

export function AlertsScreen({ k, today, alerts, actionsOf }: Props) {
  const colors = useColors();
  const [template, setTemplate] = useState(PARTNER_TEMPLATES[0][0]);
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
      <Decorations />
      <View style={styles.title}>
        <Ribbon text={`これから${UPCOMING_DAYS}日のお知らせ`} />
      </View>
      <Text style={[styles.sub, styles.center, { color: colors.muted }]}>
        {dayTitle(today)}〜{dayTitle(addDays(today, UPCOMING_DAYS))}
      </Text>
      <MascotSays text={line} />
      <Card>
        <PillHeading text="パートナーに送る文の見本" />
        <Chips
          options={PARTNER_TEMPLATES}
          value={template}
          onPick={(id) => {
            setTemplate(id);
            setEdited(null);
          }}
        />
        <Input
          accessibilityLabel="送る文"
          value={text}
          onChangeText={setEdited}
          multiline
          style={styles.draft}
        />
        {/* 送る前に開けなかっただけなので、失うものは無い */}
        <Button
          label="パートナーに伝える"
          disabled={!text.trim()}
          onPress={async () => {
            const result = await Share.share({ message: text }).catch(() => null);
            // どの見本を使ったかだけ数える。文そのものは残さない
            if (result?.action === Share.sharedAction) {
              k.track('partner_message_sent', { template: edited === null ? (PARTNER_TEMPLATES.find(([body]) => body === template)?.[1] ?? '') : '書き換え' });
            }
          }}
        />
        <Text style={[styles.sub, { color: colors.muted }]}>
          文は自由に書き換えられます。見本を押すと元の文に戻ります。LINEなどで送れて、予定の中身は送りません。
        </Text>
      </Card>

      {k.access === 'denied' &&
        (k.calendarSkipped ? (
          <Notice
            text="カレンダーは使っていません。このアプリの中だけに入れた予定との重なりを調べています。"
            action={{ label: 'カレンダーを使う', onPress: () => void k.enableCalendar() }}
          />
        ) : (
          <Notice
            text="カレンダーへのアクセスが許可されていないため、予定との重なりを調べられません。"
            action={{ label: '設定アプリで許可する', onPress: () => Linking.openSettings() }}
          />
        ))}
      {k.starts.length === 0 ? (
        <Notice text="生理の記録がまだ無いため、お知らせはありません。カレンダーで開始日を記録してください。" />
      ) : (
        k.access === 'granted' &&
        alerts.length === 0 && (
          <Notice text="気をつけたい時期と重なる予定はありません。" />
        )
      )}

      {alerts.map((alert) => (
        <AlertCard key={`${alert.eventId}|${alert.date}`} alert={alert} actions={actionsOf(alert)} k={k} today={today} />
      ))}

      <ReflectionCard k={k} today={today} />
    </ScrollView>
  );
}

function Chips<T extends string>({
  options,
  value,
  onPick,
}: {
  options: [T, string][];
  value: T;
  onPick: (id: T) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map(([id, label]) => (
        <Chip key={id} label={label} selected={id === value} onPress={() => onPick(id)} />
      ))}
    </View>
  );
}

/** 何日も続く予定の、日ごとのきつさ。いちばんきつい日だけ色を付ける */
function SeriesBars({ tone, series }: { tone: string; series: NonNullable<ConflictAlert['series']> }) {
  const colors = useColors();
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
    <Card>
      <PillHeading text={`${Number(today.slice(5, 7))}月のふりかえり`} />
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
function AlertCard({ alert, actions, k, today }: { alert: ConflictAlert; actions: Action[]; k: Karenda; today: DateKey }) {
  const colors = useColors();
  const strong = alert.grade === 'A';
  const tone = strong ? colors.alertStrong : colors.alertMild;
  const title = titleOf(alert.title);
  const state = statusOf(k.statuses, alert.eventId).state;
  const altDates = actions.flatMap((action) => (action.kind === 'suggestAltDate' ? [action.date] : []));
  const deadline = actions.flatMap((action) => (action.kind === 'deadline' ? [action.text] : []))[0];
  const tasks = actions.flatMap((action) => (action.kind === 'prepTask' ? [action.text] : []));
  const decline = actions.flatMap((action) => (action.kind === 'declineTemplate' ? [action.text] : []))[0];

  return (
    <Card style={{ backgroundColor: strong ? colors.alertStrongSoft : colors.alertMildSoft, borderColor: tone }}>
      <View style={styles.cardHead}>
        <View style={styles.badgeRow}>
          <AlertMark strong={strong} />
          <Text
            style={[
              styles.badge,
              { borderColor: tone },
              strong ? { color: colors.onAccent, backgroundColor: tone } : { color: tone },
            ]}
          >
            {gradeLabel(alert.grade)}
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
      {alert.series && <SeriesBars tone={tone} series={alert.series} />}
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
        <Button kind="secondary" label="断りの文を送る" onPress={() => Share.share({ message: decline }).catch(() => {})} />
      )}
      {state === 'unreviewed' ? (
        <Button kind="secondary" label="確認した" onPress={() => k.dismiss(alert.eventId, alert.date)} />
      ) : (
        <Text style={[styles.sub, { color: colors.muted }]}>確認済み</Text>
      )}
      <Text style={[styles.sub, { color: colors.muted }]}>どうしましたか？選ぶと一覧から外れます。</Text>
      <View style={styles.chips}>
        {RESOLUTIONS.map(([resolution, label]) => (
          <Chip
            key={resolution}
            label={label}
            accessibilityLabel={`「${title}」は${label}`}
            tone={tone}
            onPress={() => k.resolve(alert.eventId, alert.date, resolution)}
          />
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
  draft: { lineHeight: 22 },
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
  date: { fontSize: 13, flexShrink: 1 },
  eventTitle: { fontSize: 16, fontWeight: '700' },
  message: { fontSize: 14, lineHeight: 21 },
  strongText: { fontWeight: '700' },
  bars: { flexDirection: 'row', gap: 6, paddingVertical: 4 },
  barColumn: { flex: 1, alignItems: 'center', gap: 4 },
  barTrack: { width: 14, height: 48, borderRadius: radius.pill, overflow: 'hidden', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: radius.pill },
  barLabel: { fontSize: 11 },
});
