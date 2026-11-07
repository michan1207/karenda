import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  addDays,
  alertsByDay,
  AFTER_PERIOD_DAYS,
  computeGuard,
  consultReasons,
  consultText,
  DateKey,
  EventColor,
  fromDateKey,
  gradeOf,
  monthlyDigest,
  Guard,
  isInMonth,
  monthGrid,
  nearestPeriod,
  periodPhase,
  ReviewTarget,
  shiftMonth,
  ZoneDay,
} from '../engine';
import { DayCell, Legend } from './DayCell';
import { AlertMark, Button, Card, Confirm, Decorations, MascotSays, Notice, PillHeading, Ribbon, Text } from './components';
import { DigestCard } from './DigestCard';
import { dayTitle, gradeLabel, predictionLines, timeRange, titleOf, WEEKDAYS, zoneLabel } from './format';
import { ManualEventForm } from './ManualEventForm';
import { mascotLine } from './mascotLines';
import { MoodNotesCard } from './MoodNotesCard';
import { ReviewCard } from './ReviewCard';
import { radius, useColors } from './theme';
import { useEvents } from './useEvents';
import type { Karenda } from './useKarenda';

type Props = { k: Karenda; today: DateKey; reviews: ReviewTarget[]; openAlerts: () => void };

// 隠すモードでは、生理に関わる色・言葉・印を何も出さず、予定だけのカレンダーにする
const HIDDEN: Guard = { prediction: null, zones: new Map(), alerts: [], actionsOf: () => [] };

export function CalendarScreen({ k, today, reviews, openAlerts }: Props) {
  const colors = useColors();
  const [{ year, month }, setMonth] = useState(() => {
    const date = fromDateKey(today);
    return { year: date.getFullYear(), month: date.getMonth() + 1 };
  });
  const [selected, setSelected] = useState<DateKey>(today);

  const grid = useMemo(() => monthGrid(year, month), [year, month]);
  const events = useEvents(k.calendar, k.access, grid.from, grid.until, k.manualEvents, k.resumed);

  const computed = useMemo(
    () =>
      computeGuard({
        starts: k.starts,
        settings: k.settings,
        keywords: k.keywords,
        events,
        // 月初の日も「生理の終わりごろ」を判定できるよう、少し前から作る
        range: { from: addDays(grid.from, -AFTER_PERIOD_DAYS), until: grid.until },
        today,
      }),
    [k.starts, k.settings, k.keywords, events, grid, today],
  );
  const hidden = k.hideMode;
  const guard = hidden ? HIDDEN : computed;
  const consult = useMemo(() => consultReasons(k.starts), [k.starts]);
  const thisMonth = today.slice(0, 7);

  const dayAlerts = useMemo(() => alertsByDay(guard.alerts), [guard.alerts]);

  // このアプリに入れた予定の色を、日のマスに点で出す（3つまで）
  const dotsByDay = useMemo(() => {
    const map = new Map<DateKey, EventColor[]>();
    for (const event of events) if (event.color) map.set(event.start, [...(map.get(event.start) ?? []), event.color].slice(0, 3));
    return map;
  }, [events]);

  const goMonth = (delta: number) => setMonth(shiftMonth(year, month, delta));
  const selectedEvents = events.filter((event) => event.start <= selected && event.end >= selected);
  // 同じ名前で続く予定はまとめて1件のお知らせになるので、元の予定のどれからでも引けるようにする
  const alertFor = (eventId: string) =>
    guard.alerts.find((alert) => (alert.event.memberIds ?? [alert.eventId]).includes(eventId));
  const isRecorded = k.starts.includes(selected);
  const phase = periodPhase(selected, guard.zones);
  const selectedZone = guard.zones.get(selected);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Decorations />
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
        <Ribbon text={`${year}年${month}月`} />
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

      <View style={styles.hideRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={hidden ? '生理の表示をもとに戻す' : '生理の表示をかくす'}
          onPress={() => k.setHideMode(!hidden)}
          hitSlop={8}
          style={[styles.hideButton, { backgroundColor: colors.surface, borderColor: colors.line }]}
        >
          <Text style={[styles.hideText, { color: colors.muted }]}>{hidden ? 'みせる' : 'かくす'}</Text>
        </Pressable>
      </View>

      {!hidden && k.starts.length > 0 && k.access === 'granted' && (
        <DigestCard
          digest={monthlyDigest(guard.alerts, `${year}-${String(month).padStart(2, '0')}`, k.statuses)}
          isThisMonth={today.startsWith(`${year}-${String(month).padStart(2, '0')}-`)}
          month={month}
          onPick={setSelected}
          openAlerts={openAlerts}
          nextMonth={() => goMonth(1)}
        />
      )}

      {!hidden && reviews.length > 0 && <ReviewCard reviews={reviews} onAnswer={k.answerReview} />}

      {!hidden && consult.length > 0 && k.consultDismissed !== thisMonth && (
        <Card>
          <Text style={[styles.cardTitle, { color: colors.text }]}>周期の記録について</Text>
          <Text style={[styles.detailText, { color: colors.text }]}>{consultText(consult)}</Text>
          <Button kind="secondary" label="今月はもう出さない" onPress={() => k.dismissConsult(thisMonth)} />
        </Card>
      )}

      {!hidden && <MascotSays text={mascotLine(phase, k.starts.length > 0, selected)} />}

      {k.access === 'denied' &&
        (k.calendarSkipped ? (
          <Notice
            text="カレンダーは使っていません。日付を選んで「この日に予定を入れる」から、このアプリの中だけに予定を入れられます。"
            action={{ label: 'カレンダーを使う', onPress: () => void k.enableCalendar() }}
          />
        ) : (
          <Notice
            text="カレンダーへのアクセスが許可されていないため、予定との重なりは表示できません。予定はこの端末の中で読むだけで、外には送りません。"
            action={{ label: '設定アプリで許可する', onPress: () => Linking.openSettings() }}
          />
        ))}
      {k.starts.length === 0 && !hidden && (
        <Notice text="生理が始まった日を選んで記録すると、気をつけたい時期がカレンダーに色で表示されます。" />
      )}
      {guard.prediction?.provisional && (
        <Notice text="記録がまだ少ないため、28日周期を仮定した仮の予測です。" />
      )}

      <Card style={styles.grid}>
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
                zone={guard.zones.get(day)}
                alerts={dayAlerts.get(day) ?? []}
                dots={dotsByDay.get(day) ?? []}
                inMonth={isInMonth(day, year, month)}
                isToday={day === today}
                isSelected={day === selected}
                onPress={() => setSelected(day)}
              />
            ))}
          </View>
        ))}

        {!hidden && <Legend />}
      </Card>

      <Card>
        <PillHeading text={dayTitle(selected)} />
        {!hidden && <ZoneBadge zone={selectedZone} />}
        {guard.prediction &&
          selectedZone?.predicted &&
          predictionLines(guard.prediction, nearestPeriod(guard.prediction, selected)).map((line, i) => (
            <Text key={line} style={[styles.detailText, { color: i === 0 ? colors.text : colors.muted }]}>
              {line}
            </Text>
          ))}
        {selectedEvents.length === 0 ? (
          <Text style={[styles.detailText, { color: colors.muted }]}>
            {k.access === 'granted' ? 'この日の予定はありません' : 'カレンダーは使っていません。予定はこのアプリの中だけに入れられます。'}
          </Text>
        ) : (
          selectedEvents.map((event) => {
            const found = alertFor(event.id);
            // 何日も続く予定は、押した日の重さと説明を出す。いちばんきつい日だけ、提案の文を出す
            const day = found?.series?.days.find((d) => d.date === selected);
            const dayGrade = day ? gradeOf(day.score) : found?.grade;
            const alert = found && dayGrade && dayGrade !== 'C' ? { ...found, grade: dayGrade } : undefined;
            const note = found && day && selected !== found.date ? `${day.note}。いちばんきついのは${dayTitle(found.date)}です。` : null;
            return (
              <View key={event.id} style={styles.eventRow}>
                <View style={styles.eventHead}>
                  {alert && <AlertMark strong={alert.grade === 'A'} />}
                  {event.color && <View style={[styles.eventDot, { backgroundColor: colors.event[event.color] }]} />}
                  <Text style={[styles.eventTitle, { color: colors.text }]}>{titleOf(event.title)}</Text>
                  {event.manual && <Text style={[styles.manualLabel, { color: colors.muted }]}>このアプリだけ</Text>}
                  {alert && (
                    <Text style={[styles.gradeLabel, { color: alert.grade === 'A' ? colors.alertStrong : colors.alertMild }]}>
                      {gradeLabel(alert.grade)}
                    </Text>
                  )}
                </View>
                {timeRange(event) && <Text style={[styles.detailText, { color: colors.muted }]}>{timeRange(event)}</Text>}
                {event.manual && (
                  <Confirm
                    message={`「${event.title}」を消します。元に戻せません。`}
                    label="予定を消す"
                    onConfirm={() => k.removeManualEvent(event.id)}
                    trigger={(ask) => <Button kind="danger" label={`「${event.title}」を消す`} onPress={ask} />}
                  />
                )}
                {note ? (
                  <Text style={[styles.detailText, { color: colors.text }]}>{note}</Text>
                ) : (
                  alert && (
                    <Text style={[styles.detailText, { color: alert.grade === 'A' ? colors.alertStrong : colors.alertMild }]}>
                      {alert.message}
                    </Text>
                  )
                )}
              </View>
            );
          })
        )}
        <ManualEventForm
          day={selected}
          events={k.manualEvents}
          onAdd={(event) => k.addManualEvent({ ...event, date: selected })}
        />
        {hidden ? null : isRecorded ? (
          <Confirm
            key={selected}
            message={`${dayTitle(selected)}の記録を消します。予測も変わります。`}
            label="記録を消す"
            onConfirm={() => k.removeStart(selected)}
            trigger={(ask) => <Button kind="secondary" label="この日の記録を消す" onPress={ask} />}
          />
        ) : selected <= today ? (
          <Button label="この日を生理開始日として記録" onPress={() => k.addStart(selected)} />
        ) : null}
      </Card>

      {phase && <MoodNotesCard phase={phase} />}

      {!hidden && (
        <Text style={[styles.footnote, { color: colors.muted }]}>
          予測は目安で、医療や避妊の目的には使えません。体調の判断は医師にご相談ください。データはこの端末の中だけで扱います。
        </Text>
      )}
    </ScrollView>
  );
}

/** 選んだ日の時期。生理・PMSの日はカレンダーと同じ色のカプセルで見せる */
function ZoneBadge({ zone }: { zone: ZoneDay | undefined }) {
  const colors = useColors();
  const background = zone?.zone === 'heavy' ? colors.heavy : zone?.zone === 'pms' ? colors.pms : undefined;
  if (!background) return <Text style={[styles.detailZone, { color: colors.muted }]}>{zoneLabel(zone)}</Text>;
  return (
    <Text style={[styles.detailZone, styles.zoneBadge, { color: colors.text, backgroundColor: background }]}>
      {zoneLabel(zone)}
    </Text>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  nav: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  navText: { fontSize: 26, lineHeight: 30, fontWeight: '700' },
  hideRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  gradeLabel: { fontSize: 12, fontWeight: '700' },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  hideButton: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6, minHeight: 32, justifyContent: 'center' },
  hideText: { fontSize: 13 },
  grid: { padding: 12, gap: 4 },
  weekRow: { flexDirection: 'row', gap: 4 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12 },
  detailZone: { fontSize: 13 },
  detailText: { fontSize: 14, lineHeight: 21 },
  zoneBadge: { alignSelf: 'flex-start', borderRadius: radius.pill, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 3 },
  eventRow: { gap: 2 },
  eventHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eventTitle: { fontSize: 15, fontWeight: '600' },
  manualLabel: { fontSize: 12 },
  eventDot: { width: 10, height: 10, borderRadius: 5 },
  footnote: { fontSize: 12, textAlign: 'center', marginTop: 8 },
});
