import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  addDays,
  AFTER_PERIOD_DAYS,
  Answer,
  computeGuard,
  ConflictAlert,
  DateKey,
  fromDateKey,
  gradeOf,
  monthlyDigest,
  Guard,
  isInMonth,
  monthGrid,
  MonthlyDigest,
  nearestPeriod,
  PeriodPhase,
  periodPhase,
  ReviewTarget,
  shiftMonth,
  ZoneDay,
} from '../engine';
import { AlertMark, Button, Card, Decorations, Heart, MascotSays, Notice, PillHeading, Ribbon, Text } from './components';
import { dayTitle, predictionLines, WEEKDAYS, zoneLabel } from './format';
import { MOOD_NOTES } from './moodNotes';
import { Colors, radius, useColors } from './theme';
import { useEvents } from './useEvents';
import type { Karenda } from './useKarenda';

type Props = { k: Karenda; today: DateKey; reviews: ReviewTarget[]; openAlerts: () => void };

/** ミアの一言。短く、やさしく、次にできることを1つだけ言う。時期は予測なので「かな」で言い切らない */
const MASCOT_LINES: Record<PeriodPhase | 'calm', { lead: string; lines: string[] }> = {
  before: {
    lead: 'そろそろPMSのころかな。',
    lines: [
      '準備は前の日にしておこうね',
      '予定、詰まりすぎていないかな？',
      '大事なことは早めにしておこうね',
      '人と会うのは短めでも大丈夫だよ',
      '甘いもの、少し用意しておこうね',
      '今夜は早めにおやすみしようね',
      'お誘いのお返事は、あとでも大丈夫',
      'もやもやはメモに書いてみてね',
    ],
  },
  during: {
    lead: '生理のころかな。',
    lines: [
      '重い予定、ずらせそうかな？',
      '移動はゆっくりめにしようね',
      '替えのナプキン、持ったかな？',
      '夜の予定は早めに帰れるといいね',
      'あったかい飲みもの、どうかな？',
      '家のこと、だれかに頼めるといいね',
      '座れる予定だと安心だね',
      'パートナーにひとこと送ってみてね',
    ],
  },
  after: {
    lead: '生理あけのころかな。',
    lines: [
      '予定は少しずつ戻していこうね',
      'のばした予定、入れ直してみる？',
      '鉄分のあるごはん、足してみてね',
      '立ちくらみに気をつけてね',
      '楽しみな予定、入れてみようね',
      '早めに寝て、元気をためようね',
      '疲れた日は予定をひとつ減らそうね',
      'お水、こまめに飲もうね',
    ],
  },
  calm: {
    lead: 'おだやかなころかな。',
    lines: [
      '予定、たのしんできてね',
      '大事な予定はこのへんがいいかも',
      '次の生理の前に、予定を見ておこうね',
      'やりたかったこと、入れてみようね',
      '友だちとの予定、どうかな？',
      '帯の日を押すと予測が見られるよ',
      '先の予定、整えておこうね',
      '気になる用事、片づけてみようね',
    ],
  },
};

// 隠すモードでは、生理に関わる色・言葉・印を何も出さず、予定だけのカレンダーにする
const HIDDEN: Guard = { prediction: null, zones: new Map(), alerts: [] };

function mascotLine(phase: PeriodPhase | undefined, recorded: boolean, day: DateKey): string {
  if (!recorded) return 'はじめまして！生理が始まった日を選んで、記録してみてね';
  const { lead, lines } = MASCOT_LINES[phase ?? 'calm'];
  // 同じ言葉が続かないよう、日付で順番に変える（8つなので月をまたいでも続けて同じにならない）
  return `${lead}${lines[fromDateKey(day).getDate() % lines.length]}`;
}

export default function CalendarScreen({ k, today, reviews, openAlerts }: Props) {
  const colors = useColors();
  const [{ year, month }, setMonth] = useState(() => {
    const date = fromDateKey(today);
    return { year: date.getFullYear(), month: date.getMonth() + 1 };
  });
  const [selected, setSelected] = useState<DateKey>(today);

  const grid = useMemo(() => monthGrid(year, month), [year, month]);
  const events = useEvents(k.calendar, k.access, grid.from, grid.until);

  const computed = useMemo(
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
  const hidden = k.hideMode;
  const guard = hidden ? HIDDEN : computed;

  const alertsByDay = useMemo(() => {
    const map = new Map<DateKey, ConflictAlert[]>();
    const add = (day: DateKey, alert: ConflictAlert) => map.set(day, [...(map.get(day) ?? []), alert]);
    for (const alert of guard.alerts) {
      // 何日も続く予定は、いちばんきつい日だけでなく、注意したい日（A/B）すべてに、その日の重さで印を付ける
      const days = alert.series?.days ?? [{ date: alert.date, score: alert.score }];
      for (const day of days) {
        const grade = gradeOf(day.score);
        if (grade !== 'C') add(day.date, { ...alert, grade });
      }
    }
    return map;
  }, [guard.alerts]);

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
          colors={colors}
          digest={monthlyDigest(guard.alerts, `${year}-${String(month).padStart(2, '0')}`, k.statuses)}
          isThisMonth={today.startsWith(`${year}-${String(month).padStart(2, '0')}-`)}
          month={month}
          onPick={setSelected}
          openAlerts={openAlerts}
          nextMonth={() => goMonth(1)}
        />
      )}

      {!hidden && reviews.length > 0 && <ReviewCard colors={colors} reviews={reviews} onAnswer={k.answerReview} />}

      {!hidden && <MascotSays colors={colors} text={mascotLine(phase, k.starts.length > 0, selected)} />}

      {k.access === 'denied' && (
        <Notice
          colors={colors}
          text="カレンダーへのアクセスが許可されていないため、予定との重なりは表示できません。予定はこの端末の中で読むだけで、外には送りません。"
          action={{ label: '設定アプリで許可する', onPress: () => Linking.openSettings() }}
        />
      )}
      {k.starts.length === 0 && !hidden && (
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

        {!hidden && (
          <View style={styles.legend}>
            <LegendItem color={colors.heavy} label="生理ヘビー期" textColor={colors.muted} />
            <LegendItem color={colors.heavyEdge} label="生理かもしれない日" textColor={colors.muted} />
            <LegendItem color={colors.pms} label="PMS警戒期" textColor={colors.muted} />
            <View style={styles.legendItem}>
              <AlertMark colors={colors} strong size={12} />
              <Text style={[styles.legendText, { color: colors.muted }]}>予定と重なる日</Text>
            </View>
          </View>
        )}
      </Card>

      <Card colors={colors}>
        <PillHeading colors={colors} text={dayTitle(selected)} />
        {!hidden && <ZoneBadge colors={colors} zone={selectedZone} />}
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
            const found = alertFor(event.id);
            // 何日も続く予定は、押した日の重さと説明を出す。いちばんきつい日だけ、提案の文を出す
            const day = found?.series?.days.find((d) => d.date === selected);
            const dayGrade = day ? gradeOf(day.score) : found?.grade;
            const alert = found && dayGrade && dayGrade !== 'C' ? { ...found, grade: dayGrade } : undefined;
            const note = found && day && selected !== found.date ? `${day.note}。いちばんきついのは${dayTitle(found.date)}です。` : null;
            return (
              <View key={event.id} style={styles.eventRow}>
                <View style={styles.eventHead}>
                  {alert && <AlertMark colors={colors} strong={alert.grade === 'A'} />}
                  <Text style={[styles.eventTitle, { color: colors.text }]}>{event.title || '（タイトルなし）'}</Text>
                  {alert && (
                    <Text style={[styles.gradeLabel, { color: alert.grade === 'A' ? colors.alertStrong : colors.alertMild }]}>
                      {alert.grade === 'A' ? 'A 要注意' : 'B 注意'}
                    </Text>
                  )}
                </View>
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
        {hidden ? null : isRecorded ? (
          <Button colors={colors} kind="secondary" label="この日の記録を消す" onPress={() => k.removeStart(selected)} />
        ) : selected <= today ? (
          <Button colors={colors} label="この日を生理開始日として記録" onPress={() => k.addStart(selected)} />
        ) : null}
      </Card>

      {phase && <MoodNotes phase={phase} colors={colors} />}

      {!hidden && (
        <Text style={[styles.footnote, { color: colors.muted }]}>
          予測は目安です。医療的な診断や避妊には使えません。データはこの端末の中だけで扱います。
        </Text>
      )}
    </ScrollView>
  );
}

const ANSWERS: [Answer, string][] = [
  ['hard', 'きつかった'],
  ['normal', 'ふつう'],
  ['easy', '平気だった'],
];

/** 終わった予定に「どうだった？」と聞く（3件まで）。答えから予定の重さを覚えていく */
function ReviewCard({
  colors,
  reviews,
  onAnswer,
}: {
  colors: Colors;
  reviews: ReviewTarget[];
  onAnswer: (target: ReviewTarget, answer: Answer | null) => void;
}) {
  return (
    <Card colors={colors}>
      <Text style={[styles.digestTitle, { color: colors.text }]}>予定、どうだった？</Text>
      <Text style={[styles.reviewHelp, { color: colors.muted }]}>答えると予定の重さを覚えて、次のお知らせに生かします。</Text>
      {reviews.map((target) => {
        const name = `${dayTitle(target.date)}「${target.title || '（タイトルなし）'}」`;
        return (
          <View key={`${target.eventId}|${target.date}`} style={styles.review}>
            <Text style={[styles.detailText, { color: colors.text }]}>{name}</Text>
            <View style={styles.reviewChips}>
              {ANSWERS.map(([answer, label]) => (
                <Pressable
                  key={answer}
                  accessibilityRole="button"
                  accessibilityLabel={`${name}は${label}`}
                  onPress={() => onAnswer(target, answer)}
                  style={[styles.reviewChip, { borderColor: colors.pink }]}
                >
                  <Text style={[styles.reviewChipText, { color: colors.text }]}>{label}</Text>
                </Pressable>
              ))}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${name}は答えない`}
                onPress={() => onAnswer(target, null)}
                hitSlop={8}
                style={styles.reviewSkip}
              >
                <Text style={[styles.reviewChipText, { color: colors.muted }]}>答えない</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

/** その月の要注意のまとめ。上位3件を押すとその日を開き、ボタンでお知らせに移る */
function DigestCard({
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
  const red = alerts.some((alert) => alert.grade === 'A');
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
  hideRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  gradeLabel: { fontSize: 12, fontWeight: '700' },
  digestHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  digestTitle: { fontSize: 16, fontWeight: '700' },
  digestBadge: { fontSize: 12, fontWeight: '700', borderRadius: radius.pill, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 2 },
  digestRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  reviewHelp: { fontSize: 13 },
  review: { gap: 6 },
  reviewChips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  reviewChip: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  reviewChipText: { fontSize: 13 },
  reviewSkip: { paddingHorizontal: 8, paddingVertical: 6 },
  digestGrade: { fontSize: 14, fontWeight: '700' },
  digestText: { flexShrink: 1 },
  hideButton: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6, minHeight: 32, justifyContent: 'center' },
  hideText: { fontSize: 13 },
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
