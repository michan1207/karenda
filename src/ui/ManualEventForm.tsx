import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { CalendarEvent, classifyRisk, DateKey, EVENT_COLORS, EventColor, normalizeTitle, RiskKeywords, Weight } from '../engine';
import type { ManualEventInput } from '../data';
import { Button, Chip, Input, Text } from './components';
import { dayTitle, riskLabel } from './format';
import { useColors } from './theme';
import { TimeField } from './TimeField';
import { useBackButton } from './useBackButton';

const COLOR_NAMES: Record<EventColor, string> = {
  blue: 'あお',
  green: 'みどり',
  orange: 'オレンジ',
  purple: 'むらさき',
  yellow: 'きいろ',
  gray: 'グレー',
};

/** このアプリの中だけに予定を入れる。カレンダーを使わない人も、重なりのお知らせを受けられる */
export function ManualEventForm({
  day,
  events,
  keywords,
  onAdd,
}: {
  day: DateKey;
  /** 入れてある予定。同じ名前の予定は、前に選んだ色を使う（「会議」はあお、など） */
  events: CalendarEvent[];
  /** 「おまかせ」の時に、今の名前がどの重さになるかを見せる */
  keywords: RiskKeywords;
  onAdd: (event: Omit<ManualEventInput, 'date'>) => void;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [weight, setWeight] = useState<Weight | null>(null);
  const [picked, setPicked] = useState<EventColor | null>(null);
  const [timed, setTimed] = useState(false);
  const [start, setStart] = useState(10 * 60);
  const [end, setEnd] = useState(11 * 60);
  const close = () => {
    setTitle('');
    setPicked(null);
    setTimed(false);
    setOpen(false);
  };
  useBackButton(open, close);
  if (!open) return <Button kind="secondary" label="この日に予定を入れる" onPress={() => setOpen(true)} />;
  const name = normalizeTitle(title.trim());
  const remembered = [...events].reverse().find((event) => event.color && normalizeTitle(event.title) === name)?.color;
  const color = picked ?? remembered ?? 'blue';
  const changeStart = (minutes: number) => {
    setStart(minutes);
    if (end <= minutes) setEnd(Math.min(minutes + 60, 24 * 60 - 5));
  };
  const add = () => {
    if (!title.trim()) return;
    const time = timed ? { startMinutes: start, ...(end > start ? { durationMinutes: end - start } : {}) } : {};
    onAdd({ title, weight, color, ...time });
    close();
  };
  return (
    <View style={styles.manualForm}>
      <Text style={[styles.reviewHelp, { color: colors.muted }]}>このアプリの中だけに残し、端末のカレンダーには書きません。</Text>
      <Input
        accessibilityLabel={`${dayTitle(day)}に入れる予定の名前`}
        value={title}
        onChangeText={setTitle}
        placeholder="予定の名前"
        returnKeyType="done"
      />
      <View style={styles.reviewChips}>
        {(
          [
            [null, 'おまかせ'],
            ['heavy', '重い予定'],
            ['normal', 'ふつうの予定'],
          ] as const
        ).map(([value, label]) => (
          <Chip key={label} label={label} selected={weight === value} onPress={() => setWeight(value)} />
        ))}
      </View>
      {weight === null && (
        <Text style={[styles.reviewHelp, { color: colors.muted }]}>
          {title.trim()
            ? `設定の「予定の重さを決める言葉」で決めます。今は「${riskLabel(classifyRisk({ title, allDay: false }, keywords))}」です。`
            : '設定の「予定の重さを決める言葉」で決めます。'}
        </Text>
      )}
      <View style={styles.timeRow}>
        <Text style={[styles.detailText, { color: colors.text }]}>時間を入れる</Text>
        <Switch
          accessibilityLabel="時間を入れる"
          value={timed}
          onValueChange={setTimed}
          trackColor={{ true: colors.pink, false: colors.line }}
        />
      </View>
      {timed && (
        <>
          <TimeField label="開始" minutes={start} onChange={changeStart} />
          <TimeField label="終了" minutes={end} onChange={setEnd} />
        </>
      )}
      <Text style={[styles.detailText, { color: colors.text }]}>色</Text>
      <View style={styles.colorChips}>
        {EVENT_COLORS.map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={`色を${COLOR_NAMES[value]}にする`}
            accessibilityState={{ selected: color === value }}
            onPress={() => setPicked(value)}
            hitSlop={6}
            style={[styles.colorChip, { borderColor: color === value ? colors.text : 'transparent' }]}
          >
            <View style={[styles.colorFill, { backgroundColor: colors.event[value] }]} />
          </Pressable>
        ))}
      </View>
      <Button label="入れる" onPress={add} disabled={!title.trim()} />
      <Button kind="secondary" label="やめる" onPress={close} />
    </View>
  );
}

const styles = StyleSheet.create({
  manualForm: { gap: 8 },
  reviewHelp: { fontSize: 13 },
  reviewChips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  detailText: { fontSize: 14, lineHeight: 21 },
  colorChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorChip: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  colorFill: { width: 30, height: 30, borderRadius: 15 },
});
