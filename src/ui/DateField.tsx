import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { DateKey, fromDateKey, toDateKey } from '../engine';
import { Text } from './components';
import { fullDate } from './format';
import { radius, useColors } from './theme';

/** 日付を選ぶ。iPhone は日付の小さなボタン（押すとカレンダー）、Android は押すと日付のダイアログ。TimeField の日付版 */
export function DateField({
  label,
  day,
  min,
  max,
  onChange,
}: {
  label: string;
  day: DateKey;
  min?: DateKey;
  max?: DateKey;
  onChange: (day: DateKey) => void;
}) {
  const colors = useColors();
  const value = fromDateKey(day);
  const limits = { minimumDate: min ? fromDateKey(min) : undefined, maximumDate: max ? fromDateKey(max) : undefined };
  const pick = (_: unknown, date: Date) => onChange(toDateKey(date));
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      {Platform.OS === 'ios' ? (
        <DateTimePicker accessibilityLabel={label} mode="date" display="compact" value={value} {...limits} onValueChange={pick} />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} ${fullDate(day)}`}
          onPress={() => DateTimePickerAndroid.open({ mode: 'date', value, ...limits, onValueChange: pick })}
          style={[styles.android, { borderColor: colors.line }]}
        >
          <Text style={[styles.label, { color: colors.text }]}>{fullDate(day)}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
  label: { fontSize: 15 },
  android: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8 },
});
