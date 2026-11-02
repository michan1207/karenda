import { Pressable, StyleSheet, View } from 'react-native';

import { ConflictAlert, DateKey, EventColor, fromDateKey, ZoneDay } from '../engine';
import { AlertMark, Text } from './components';
import { dayTitle, zoneLabel } from './format';
import { radius, useColors } from './theme';

/** カレンダーの日のマス。生理・PMSの色、重なりの印、このアプリの予定の色の点を出す */
export function DayCell({
  day,
  zone,
  alerts,
  dots,
  inMonth,
  isToday,
  isSelected,
  onPress,
}: {
  day: DateKey;
  zone: ZoneDay | undefined;
  alerts: ConflictAlert[];
  /** このアプリに入れた予定の色 */
  dots: EventColor[];
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const red = alerts.some((alert) => alert.grade === 'A');
  // 予測の幅のはし（中心の日からずれた日）は薄くする
  const heavyColor = zone?.zone === 'heavy' && zone.predicted && !zone.periodDay ? colors.heavyEdge : colors.heavy;
  const zoneColor = zone?.zone === 'heavy' ? heavyColor : zone?.zone === 'pms' ? colors.pms : 'transparent';
  const background = isToday ? colors.pink : zoneColor;
  const label = [dayTitle(day), zone ? zoneLabel(zone) : null, alerts.length ? '予定と重なっています' : dots.length ? 'このアプリの予定あり' : null]
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
      <View style={styles.cellMark}>
        {alerts.length > 0 ? (
          <AlertMark strong={red} size={12} />
        ) : (
          <View style={styles.cellDots}>
            {dots.map((dot, i) => (
              <View key={i} style={[styles.cellDot, { backgroundColor: colors.event[dot] }]} />
            ))}
          </View>
        )}
      </View>
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

/** カレンダーの下の色の説明 */
export function Legend() {
  const colors = useColors();
  return (
    <View style={styles.legend}>
      <LegendItem color={colors.heavy} label="生理ヘビー期" textColor={colors.muted} />
      <LegendItem color={colors.heavyEdge} label="生理かもしれない日" textColor={colors.muted} />
      <LegendItem color={colors.pms} label="PMSの時期" textColor={colors.muted} />
      <View style={styles.legendItem}>
        <AlertMark strong size={12} />
        <Text style={[styles.legendText, { color: colors.muted }]}>予定と重なる日</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  cellDots: { flexDirection: 'row', gap: 2 },
  cellDot: { width: 5, height: 5, borderRadius: 2.5 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: radius.pill },
  legendText: { fontSize: 12 },
});
