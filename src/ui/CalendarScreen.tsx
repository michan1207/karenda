import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  addDays,
  AFTER_PERIOD_DAYS,
  computeGuard,
  ConflictAlert,
  DateKey,
  fromDateKey,
  isInMonth,
  monthGrid,
  PeriodPhase,
  periodPhase,
  shiftMonth,
  ZoneDay,
} from '../engine';
import { Button, Notice } from './components';
import { dayTitle, WEEKDAYS, zoneLabel } from './format';
import { MOOD_NOTES } from './moodNotes';
import { Colors, useColors } from './theme';
import { useEvents } from './useEvents';
import type { Karenda } from './useKarenda';

type Props = { k: Karenda; today: DateKey };

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

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="前の月" onPress={() => goMonth(-1)} hitSlop={12}>
          <Text style={[styles.nav, { color: colors.accent }]}>‹</Text>
        </Pressable>
        <Text accessibilityRole="header" style={[styles.month, { color: colors.text }]}>
          {year}年{month}月
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="次の月" onPress={() => goMonth(1)} hitSlop={12}>
          <Text style={[styles.nav, { color: colors.accent }]}>›</Text>
        </Pressable>
      </View>

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

      <View style={styles.weekRow}>
        {WEEKDAYS.map((label) => (
          <Text key={label} maxFontSizeMultiplier={1.4} style={[styles.weekday, { color: colors.muted }]}>
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
        <LegendItem color={colors.pms} label="PMS警戒期" textColor={colors.muted} />
        <Text style={[styles.legendText, { color: colors.muted }]}>⚠ 予定と重なる日</Text>
      </View>

      <View style={[styles.detail, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <Text style={[styles.detailTitle, { color: colors.text }]}>{dayTitle(selected)}</Text>
        <Text style={[styles.detailZone, { color: colors.muted }]}>{zoneLabel(guard.zones.get(selected))}</Text>
        {selectedEvents.length === 0 ? (
          <Text style={[styles.detailText, { color: colors.muted }]}>
            {k.access === 'granted' ? 'この日の予定はありません' : '予定は表示できません'}
          </Text>
        ) : (
          selectedEvents.map((event) => {
            const alert = alertFor(event.id);
            return (
              <View key={event.id} style={styles.eventRow}>
                <Text style={[styles.eventTitle, { color: colors.text }]}>
                  {alert ? '⚠ ' : ''}
                  {event.title || '（タイトルなし）'}
                </Text>
                {alert && (
                  <Text style={[styles.detailText, { color: alert.level === 'red' ? colors.red : colors.yellow }]}>
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
      </View>

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
  const background = zone?.zone === 'heavy' ? colors.heavy : zone?.zone === 'pms' ? colors.pms : 'transparent';
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
        style={[styles.cellDay, { color: colors.text }, isToday && { color: colors.accent, fontWeight: '700' }]}
      >
        {fromDateKey(day).getDate()}
      </Text>
      <Text maxFontSizeMultiplier={1.4} style={[styles.cellMark, { color: red ? colors.red : colors.yellow }]}>
        {alerts.length ? '⚠' : ' '}
      </Text>
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

function MoodNotes({ phase, colors }: { phase: PeriodPhase; colors: Colors }) {
  const note = MOOD_NOTES[phase];
  return (
    <View style={[styles.detail, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <Text accessibilityRole="header" style={[styles.detailTitle, { color: colors.text }]}>
        {note.title}
      </Text>
      <Text style={[styles.detailText, { color: colors.text }]}>{note.summary}</Text>
      <View>
        {note.feelings.map((feeling) => (
          <Text key={feeling} style={[styles.detailText, { color: colors.text }]}>
            ・{feeling}
          </Text>
        ))}
      </View>
      <Text style={[styles.moodLabel, { color: colors.muted }]}>関係する病名・言葉</Text>
      <View>
        {note.names.map((name) => (
          <Text key={name} style={[styles.detailText, { color: colors.text }]}>
            ・{name}
          </Text>
        ))}
      </View>
      <Text style={[styles.detailZone, { color: colors.muted }]}>
        感じ方には個人差があり、ここに書いたことは目安です。つらさが続く時や生活に支障がある時は、婦人科や心療内科に相談してみてください。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  nav: { fontSize: 32, paddingHorizontal: 12 },
  month: { fontSize: 22, fontWeight: '700' },
  weekRow: { flexDirection: 'row', gap: 4 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12 },
  cell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellDay: { fontSize: 16 },
  cellMark: { fontSize: 12, lineHeight: 14 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  legendText: { fontSize: 12 },
  detail: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8, marginTop: 8 },
  detailTitle: { fontSize: 17, fontWeight: '700' },
  detailZone: { fontSize: 13 },
  detailText: { fontSize: 14, lineHeight: 21 },
  eventRow: { gap: 2 },
  eventTitle: { fontSize: 15, fontWeight: '600' },
  moodLabel: { fontSize: 13, fontWeight: '600' },
  footnote: { fontSize: 12, textAlign: 'center', marginTop: 8 },
});
