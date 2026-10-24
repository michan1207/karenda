import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  addPeriodStart,
  CalendarSource,
  Database,
  deviceCalendar,
  getKeywords,
  getZoneSettings,
  listPeriodStarts,
  openKarendaDatabase,
} from '../data';
import {
  CalendarEvent,
  computeGuard,
  ConflictAlert,
  DateKey,
  DEFAULT_KEYWORDS,
  DEFAULT_ZONE_SETTINGS,
  fromDateKey,
  isInMonth,
  monthGrid,
  RiskKeywords,
  shiftMonth,
  toDateKey,
  ZoneDay,
  ZoneSettings,
} from '../engine';
import { Colors, useColors } from './theme';

type Props = {
  loadDatabase?: () => Promise<Database>;
  calendar?: CalendarSource;
  today?: () => DateKey;
};

type Access = 'checking' | 'granted' | 'denied';

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];

function zoneLabel(zone: ZoneDay | undefined): string {
  if (!zone) return '通常';
  if (zone.zone === 'pms') return 'PMS警戒期（予測）';
  const name = zone.periodDay ? `生理${zone.periodDay}日目` : '生理の時期';
  return zone.predicted ? `${name}（予測）` : name;
}

function dayTitle(day: DateKey): string {
  const date = fromDateKey(day);
  return `${date.getMonth() + 1}月${date.getDate()}日（${WEEKDAYS[(date.getDay() + 6) % 7]}）`;
}

const todayKey = () => toDateKey(new Date());

export default function CalendarScreen({
  loadDatabase = openKarendaDatabase,
  calendar = deviceCalendar,
  today = todayKey,
}: Props) {
  const colors = useColors();
  const [initialToday] = useState(today);
  const [{ year, month }, setMonth] = useState(() => {
    const date = fromDateKey(initialToday);
    return { year: date.getFullYear(), month: date.getMonth() + 1 };
  });
  const [selected, setSelected] = useState<DateKey>(initialToday);

  const [db, setDb] = useState<Database | null>(null);
  const [starts, setStarts] = useState<DateKey[]>([]);
  const [settings, setSettings] = useState<ZoneSettings>(DEFAULT_ZONE_SETTINGS);
  const [keywords, setKeywords] = useState<RiskKeywords>(DEFAULT_KEYWORDS);
  const [loadError, setLoadError] = useState(false);
  const [access, setAccess] = useState<Access>('checking');
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    let active = true;
    loadDatabase()
      .then(async (opened) => {
        const [loadedStarts, loadedSettings, loadedKeywords] = await Promise.all([
          listPeriodStarts(opened),
          getZoneSettings(opened),
          getKeywords(opened),
        ]);
        if (!active) return;
        setDb(opened);
        setStarts(loadedStarts);
        setSettings(loadedSettings);
        setKeywords(loadedKeywords);
      })
      .catch(() => active && setLoadError(true));
    calendar
      .requestAccess()
      .then((granted) => active && setAccess(granted ? 'granted' : 'denied'))
      .catch(() => active && setAccess('denied'));
    return () => {
      active = false;
    };
  }, [loadDatabase, calendar]);

  const grid = useMemo(() => monthGrid(year, month), [year, month]);

  useEffect(() => {
    if (access !== 'granted') return;
    let active = true;
    calendar
      .getEvents(grid.from, grid.until)
      .then((loaded) => active && setEvents(loaded))
      .catch(() => active && setEvents([]));
    return () => {
      active = false;
    };
  }, [access, calendar, grid]);

  const guard = useMemo(
    () => computeGuard({ starts, settings, keywords, events, range: { from: grid.from, until: grid.until } }),
    [starts, settings, keywords, events, grid],
  );

  const alertsByDay = useMemo(() => {
    const map = new Map<DateKey, ConflictAlert[]>();
    for (const alert of guard.alerts) map.set(alert.date, [...(map.get(alert.date) ?? []), alert]);
    return map;
  }, [guard.alerts]);

  const recordToday = useCallback(async () => {
    if (!db) return;
    await addPeriodStart(db, today());
    setStarts(await listPeriodStarts(db));
  }, [db, today]);

  const goMonth = (delta: number) => setMonth(shiftMonth(year, month, delta));

  const selectedEvents = events.filter((event) => event.start <= selected && event.end >= selected);
  const alertFor = (eventId: string) => guard.alerts.find((alert) => alert.eventId === eventId);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
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

        {loadError && <Notice colors={colors} text="データを読み込めませんでした。アプリを開き直してください。" />}
        {access === 'denied' && (
          <Notice
            colors={colors}
            text="カレンダーへのアクセスが許可されていないため、予定との重なりは表示できません。予定はこのiPhoneの中で読むだけで、外には送りません。"
            action={{ label: '設定アプリで許可する', onPress: () => Linking.openSettings() }}
          />
        )}
        {!loadError && db && starts.length === 0 && (
          <Notice colors={colors} text="生理が始まった日を記録すると、気をつけたい時期がカレンダーに色で表示されます。" />
        )}
        {guard.prediction?.provisional && (
          <Notice colors={colors} text="記録がまだ少ないため、28日周期を仮定した仮の予測です。" />
        )}

        <View style={styles.weekRow}>
          {WEEKDAYS.map((label) => (
            <Text key={label} style={[styles.weekday, { color: colors.muted }]}>
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
                isToday={day === initialToday}
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
              {access === 'granted' ? 'この日の予定はありません' : '予定は表示できません'}
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
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={!db}
          onPress={recordToday}
          style={({ pressed }) => [styles.button, { backgroundColor: colors.accent, opacity: !db || pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.buttonLabel, { color: colors.onAccent }]}>今日を生理開始日として記録</Text>
        </Pressable>
        <Text style={[styles.footnote, { color: colors.muted }]}>
          予測は目安です。医療的な診断には使えません。データはこのiPhoneの中だけで扱います。
        </Text>
      </ScrollView>
      <StatusBar style="auto" />
    </SafeAreaView>
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
      <Text style={[styles.cellDay, { color: colors.text }, isToday && { color: colors.accent, fontWeight: '700' }]}>
        {fromDateKey(day).getDate()}
      </Text>
      <Text style={[styles.cellMark, { color: red ? colors.red : colors.yellow }]}>{alerts.length ? '⚠' : ' '}</Text>
    </Pressable>
  );
}

function Notice({
  colors,
  text,
  action,
}: {
  colors: Colors;
  text: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <Text style={[styles.detailText, { color: colors.text }]}>{text}</Text>
      {action && (
        <Pressable accessibilityRole="button" onPress={action.onPress}>
          <Text style={[styles.link, { color: colors.accent }]}>{action.label}</Text>
        </Pressable>
      )}
    </View>
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
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
  notice: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 6 },
  link: { fontSize: 15, fontWeight: '600' },
  detail: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 6, marginTop: 8 },
  detailTitle: { fontSize: 17, fontWeight: '700' },
  detailZone: { fontSize: 13 },
  detailText: { fontSize: 14, lineHeight: 21 },
  eventRow: { gap: 2, marginTop: 6 },
  eventTitle: { fontSize: 15, fontWeight: '600' },
  button: { marginTop: 12, paddingVertical: 12, borderRadius: 999, alignItems: 'center' },
  buttonLabel: { fontSize: 16, fontWeight: '600' },
  footnote: { fontSize: 12, textAlign: 'center', marginTop: 4 },
});
