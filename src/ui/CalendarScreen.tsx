import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  addDays,
  AFTER_PERIOD_DAYS,
  computeGuard,
  ConflictAlert,
  DateKey,
  fromDateKey,
  isInMonth,
  monthGrid,
  nearestPeriod,
  PeriodPhase,
  periodPhase,
  shiftMonth,
  ZoneDay,
} from '../engine';
import { AlertMark, Button, Card, Decorations, Heart, MascotSays, Notice, PillHeading, Ribbon, Text } from './components';
import { dayTitle, predictionLines, WEEKDAYS, zoneLabel } from './format';
import { MOOD_NOTES } from './moodNotes';
import { Colors, radius, useColors } from './theme';
import { useEvents } from './useEvents';
import type { Karenda } from './useKarenda';

type Props = { k: Karenda; today: DateKey };

/** 生理の時期のミアの一言。なぐさめるより、次にできることを少しやさしく言う */
const DURING_LINES = [
  '重い予定は、ずらせるか見てみる？',
  '移動の多い予定は、時間にゆとりを持たせよう',
  '替えのナプキン、かばんに入れておこう',
  '夜の予定は、早めに切り上げられると楽だよ',
  'あたたかい飲みものを用意しておこう',
  '家のことは、だれかに頼めないかな？',
  '座って過ごせる予定だと、少し楽かも',
  'パートナーへのひとことは「お知らせ」から送れるよ',
];

/** ミアが選んだ日について話す一言。時期は予測なので「かも」「と言われている」で言い切らない */
function mascotLine(phase: PeriodPhase | undefined, who: string, recorded: boolean, day: DateKey): string {
  if (!recorded) return 'はじめまして！生理が始まった日を選んで、記録してみてね';
  if (phase === 'before') return `${who}PMSの時期かも。ゆっくり過ごしてね`;
  // 同じ言葉が続かないよう、日付で順番に変える
  if (phase === 'during') return `${who}生理の時期かも。${DURING_LINES[fromDateKey(day).getDate() % DURING_LINES.length]}`;
  if (phase === 'after') return `${who}生理のあとの時期。疲れが出やすいと言われているよ`;
  return `${who}気をつけたい時期の外だよ。予定もたのしんでね`;
}

export default function CalendarScreen({ k, today }: Props) {
  const colors = useColors();
  const [{ year, month }, setMonth] = useState(() => {
    const date = fromDateKey(today);
    return { year: date.getFullYear(), month: date.getMonth() + 1 };
  });
  const [selected, setSelected] = useState<DateKey>(today);

  const grid = useMemo(() => monthGrid(year, month), [year, month]);
  const events = useEvents(k.calendar, k.access, grid.from, grid.until);

  const guard = useMemo(
    () =>
      computeGuard({
        starts: k.starts,
        settings: k.settings,
        keywords: k.keywords,
        events,
        // 月初の日も「生理の終わりごろ」を判定できるよう、少し前から作る
        range: { from: addDays(grid.from, -AFTER_PERIOD_DAYS), until: grid.until },
      }),
    [k.starts, k.settings, k.keywords, events, grid],
  );

  const alertsByDay = useMemo(() => {
    const map = new Map<DateKey, ConflictAlert[]>();
    for (const alert of guard.alerts) map.set(alert.date, [...(map.get(alert.date) ?? []), alert]);
    return map;
  }, [guard.alerts]);

  const goMonth = (delta: number) => setMonth(shiftMonth(year, month, delta));
  const selectedEvents = events.filter((event) => event.start <= selected && event.end >= selected);
  const alertFor = (eventId: string) => guard.alerts.find((alert) => alert.eventId === eventId);
  const isRecorded = k.starts.includes(selected);
  const phase = periodPhase(selected, guard.zones);
  const selectedZone = guard.zones.get(selected);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Decorations colors={colors} />
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="前の月"
          onPress={() => goMonth(-1)}
          hitSlop={4}
          style={[styles.nav, { backgroundColor: colors.surface, boxShadow: colors.shadow }]}
        >
          <Text style={[styles.navText, { color: colors.pink }]}>‹</Text>
        </Pressable>
        <Ribbon colors={colors} text={`${year}年${month}月`} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="次の月"
          onPress={() => goMonth(1)}
          hitSlop={4}
          style={[styles.nav, { backgroundColor: colors.surface, boxShadow: colors.shadow }]}
        >
          <Text style={[styles.navText, { color: colors.pink }]}>›</Text>
        </Pressable>
      </View>

      <MascotSays colors={colors} text={mascotLine(phase, selected === today ? '今日は' : 'この日は', k.starts.length > 0, selected)} />

      {k.access === 'denied' && (
        <Notice
          colors={colors}
          text="カレンダーへのアクセスが許可されていないため、予定との重なりは表示できません。予定はこの端末の中で読むだけで、外には送りません。"
          action={{ label: '設定アプリで許可する', onPress: () => Linking.openSettings() }}
        />
      )}
      {k.starts.length === 0 && (
        <Notice colors={colors} text="生理が始まった日を選んで記録すると、気をつけたい時期がカレンダーに色で表示されます。" />
      )}
      {guard.prediction?.provisional && (
        <Notice colors={colors} text="記録がまだ少ないため、28日周期を仮定した仮の予測です。" />
      )}

      <Card colors={colors} style={styles.grid}>
        <View style={styles.weekRow}>
          {WEEKDAYS.map((label, i) => (
            <Text
              key={label}
              maxFontSizeMultiplier={1.4}
              style={[styles.weekday, { color: i === 6 ? colors.pink : i === 5 ? colors.accent : colors.muted }]}
            >
              {label}
            </Text>
          ))}
        </View>
        {grid.weeks.map((week) => (
          <View key={week[0]} style={styles.weekRow}>
            {week.map((day) => (
              <DayCell
                key={day}
                day={day}
                colors={colors}
                zone={guard.zones.get(day)}
                alerts={alertsByDay.get(day) ?? []}
                inMonth={isInMonth(day, year, month)}
                isToday={day === today}
                isSelected={day === selected}
                onPress={() => setSelected(day)}
              />
            ))}
          </View>
        ))}

        <View style={styles.legend}>
          <LegendItem color={colors.heavy} label="生理ヘビー期" textColor={colors.muted} />
          <LegendItem color={colors.heavyEdge} label="生理かもしれない日" textColor={colors.muted} />
          <LegendItem color={colors.pms} label="PMS警戒期" textColor={colors.muted} />
          <View style={styles.legendItem}>
            <AlertMark colors={colors} strong size={12} />
            <Text style={[styles.legendText, { color: colors.muted }]}>予定と重なる日</Text>
          </View>
        </View>
      </Card>

      <Card colors={colors}>
        <PillHeading colors={colors} text={dayTitle(selected)} />
        <ZoneBadge colors={colors} zone={selectedZone} />
        {guard.prediction &&
          selectedZone?.predicted &&
          predictionLines(guard.prediction, nearestPeriod(guard.prediction, selected)).map((line, i) => (
            <Text key={line} style={[styles.detailText, { color: i === 0 ? colors.text : colors.muted }]}>
              {line}
            </Text>
          ))}
        {selectedEvents.length === 0 ? (
          <Text style={[styles.detailText, { color: colors.muted }]}>
            {k.access === 'granted' ? 'この日の予定はありません' : '予定は表示できません'}
          </Text>
        ) : (
          selectedEvents.map((event) => {
            const alert = alertFor(event.id);
            return (
              <View key={event.id} style={styles.eventRow}>
                <View style={styles.eventHead}>
                  {alert && <AlertMark colors={colors} strong={alert.level === 'red'} />}
                  <Text style={[styles.eventTitle, { color: colors.text }]}>{event.title || '（タイトルなし）'}</Text>
                </View>
                {alert && (
                  <Text style={[styles.detailText, { color: alert.level === 'red' ? colors.alertStrong : colors.alertMild }]}>
                    {alert.message}
                  </Text>
                )}
              </View>
            );
          })
        )}
        {isRecorded ? (
          <Button colors={colors} kind="secondary" label="この日の記録を消す" onPress={() => k.removeStart(selected)} />
        ) : selected <= today ? (
          <Button colors={colors} label="この日を生理開始日として記録" onPress={() => k.addStart(selected)} />
        ) : null}
      </Card>

      {phase && <MoodNotes phase={phase} colors={colors} />}

      <Text style={[styles.footnote, { color: colors.muted }]}>
        予測は目安です。医療的な診断や避妊には使えません。データはこの端末の中だけで扱います。
      </Text>
    </ScrollView>
  );
}

function DayCell({
  day,
  colors,
  zone,
  alerts,
  inMonth,
  isToday,
  isSelected,
  onPress,
}: {
  day: DateKey;
  colors: Colors;
  zone: ZoneDay | undefined;
  alerts: ConflictAlert[];
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  onPress: () => void;
}) {
  const red = alerts.some((alert) => alert.level === 'red');
  // 予測の幅のはし（中心の日からずれた日）は薄くする
  const heavyColor = zone?.zone === 'heavy' && zone.predicted && !zone.periodDay ? colors.heavyEdge : colors.heavy;
  const zoneColor = zone?.zone === 'heavy' ? heavyColor : zone?.zone === 'pms' ? colors.pms : 'transparent';
  const background = isToday ? colors.pink : zoneColor;
  const label = [dayTitle(day), zone ? zoneLabel(zone) : null, alerts.length ? '予定と重なっています' : null]
    .filter(Boolean)
    .join('、');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isSelected }}
      onPress={onPress}
      style={[
        styles.cell,
        { backgroundColor: background, opacity: inMonth ? 1 : 0.4 },
        isSelected && { borderColor: colors.accent },
      ]}
    >
      <Text
        maxFontSizeMultiplier={1.4}
        style={[styles.cellDay, { color: colors.text }, isToday && { color: colors.onPink, fontWeight: '700' }]}
      >
        {fromDateKey(day).getDate()}
      </Text>
      <View style={styles.cellMark}>{alerts.length > 0 && <AlertMark colors={colors} strong={red} size={12} />}</View>
    </Pressable>
  );
}

function LegendItem({ color, label, textColor }: { color: string; label: string; textColor: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={[styles.legendText, { color: textColor }]}>{label}</Text>
    </View>
  );
}

/** 選んだ日の時期。生理・PMSの日はカレンダーと同じ色のカプセルで見せる */
function ZoneBadge({ colors, zone }: { colors: Colors; zone: ZoneDay | undefined }) {
  const background = zone?.zone === 'heavy' ? colors.heavy : zone?.zone === 'pms' ? colors.pms : undefined;
  if (!background) return <Text style={[styles.detailZone, { color: colors.muted }]}>{zoneLabel(zone)}</Text>;
  return (
    <Text style={[styles.detailZone, styles.zoneBadge, { color: colors.text, backgroundColor: background }]}>
      {zoneLabel(zone)}
    </Text>
  );
}

function Bullet({ colors, text }: { colors: Colors; text: string }) {
  return (
    <View style={styles.bullet}>
      <View style={styles.bulletMark}>
        <Heart color={colors.heart} size={9} />
      </View>
      <Text style={[styles.detailText, styles.bulletText, { color: colors.text }]}>{text}</Text>
    </View>
  );
}

function MoodNotes({ phase, colors }: { phase: PeriodPhase; colors: Colors }) {
  const note = MOOD_NOTES[phase];
  return (
    <Card colors={colors}>
      <PillHeading colors={colors} text={note.title} />
      <Text style={[styles.detailText, { color: colors.text }]}>{note.summary}</Text>
      <View>
        {note.feelings.map((feeling) => (
          <Bullet key={feeling} colors={colors} text={feeling} />
        ))}
      </View>
      <Text style={[styles.detailZone, { color: colors.muted }]}>
        感じ方には個人差があり、ここに書いたことは目安です。つらさが続く時や生活に支障がある時は、婦人科や心療内科に相談してみてください。
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  nav: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  bullet: { flexDirection: 'row', gap: 6 },
  bulletMark: { height: 21, justifyContent: 'center' },
  bulletText: { flex: 1 },
  navText: { fontSize: 26, lineHeight: 30, fontWeight: '700' },
  grid: { padding: 12, gap: 4 },
  weekRow: { flexDirection: 'row', gap: 4 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12 },
  cell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellDay: { fontSize: 16 },
  cellMark: { height: 12 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: radius.pill },
  legendText: { fontSize: 12 },
  detailZone: { fontSize: 13 },
  detailText: { fontSize: 14, lineHeight: 21 },
  zoneBadge: { alignSelf: 'flex-start', borderRadius: radius.pill, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 3 },
  eventRow: { gap: 2 },
  eventHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eventTitle: { fontSize: 15, fontWeight: '600' },
  footnote: { fontSize: 12, textAlign: 'center', marginTop: 8 },
});
