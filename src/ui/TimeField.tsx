import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Text } from './components';
import { clock } from './format';
import { Colors, radius } from './theme';

/** 時刻を選ぶ。iPhone は時刻の小さなボタン（押すと回して選ぶ）、Android は押すと時刻のダイアログ */
export default function TimeField({
  colors,
  label,
  minutes,
  onChange,
}: {
  colors: Colors;
  label: string;
  /** 0時からの分 */
  minutes: number;
  onChange: (minutes: number) => void;
}) {
  const value = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  const pick = (date?: Date) => date && onChange(date.getHours() * 60 + date.getMinutes());
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      {Platform.OS === 'ios' ? (
        <DateTimePicker
          accessibilityLabel={label}
          mode="time"
          display="compact"
          minuteInterval={5}
          value={value}
          onChange={(_, date) => pick(date)}
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} ${clock(minutes)}`}
          onPress={() => DateTimePickerAndroid.open({ mode: 'time', is24Hour: true, value, onChange: (_, date) => pick(date) })}
          style={[styles.android, { borderColor: colors.line }]}
        >
          <Text style={[styles.label, { color: colors.text }]}>{clock(minutes)}</Text>
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
