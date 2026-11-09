import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { MedicineKind } from '../data';
import { DateKey, SHIFT_AFTER_DAYS } from '../engine';
import { DateField } from './DateField';
import { Button, Text } from './components';
import { fullDate } from './format';
import { useColors } from './theme';
import type { Karenda } from './useKarenda';

const TEXT: Record<MedicineKind, { help: string; start: string; end: string; name: string }> = {
  pill: {
    help: 'ピルを飲んでいる間の生理は、ふだんの周期と分けて予測します。飲んでいる間は、生理やPMSの時期の目安が合わないことがあります。',
    start: 'この日からピルを飲んでいる',
    end: 'この日でピルをやめた',
    name: 'ピル',
  },
  shift: {
    help: `月経移動（薬で生理の時期をずらすこと）の薬を飲んだ日を記録します。飲みはじめてから、やめた日の${SHIFT_AFTER_DAYS}日後までに始まった生理は、ずらした生理として、予測の平均に入れません。`,
    start: 'この日から月経移動の薬を飲んでいる',
    end: 'この日で月経移動の薬をやめた',
    name: '月経移動',
  },
};

/** 薬を飲んでいた期間の記録。ピルは飲んでいる間の生理を分けて予測し、月経移動はその後の生理を予測の平均に入れない */
export function PillPanel({ k, today, kind = 'pill' }: { k: Karenda; today: DateKey; kind?: MedicineKind }) {
  const colors = useColors();
  const [day, setDay] = useState(today);
  const text = TEXT[kind];
  const periods = k.notes[kind];
  const current = periods.find(({ end }) => end === null);
  const past = periods.filter(({ end }) => end !== null).reverse();
  // 新しく飲みはじめた日は、前の期間が終わった次の日から
  const lastEnd = past[0]?.end ?? null;
  const tooEarly = current ? day < current.start : lastEnd !== null && day <= lastEnd;
  // 記録したあとは、次に選ぶ日（やめた日・次に飲みはじめた日）を今日に戻す
  const record = (save: Promise<void>) => save.then(() => setDay(today));

  return (
    <View style={styles.box}>
      <Text style={[styles.help, { color: colors.muted }]}>
        {text.help}
      </Text>
      {current ? (
        <>
          <Text style={[styles.status, { color: colors.text }]}>{`${fullDate(current.start)}から飲んでいます`}</Text>
          <DateField label="やめた日" day={day} min={current.start} max={today} onChange={setDay} />
          <Button label={text.end} disabled={tooEarly} onPress={() => record(k.endPill(current.start, day, kind))} />
          <Button kind="secondary" label="この記録を消す" onPress={() => k.removePill(current.start, kind)} />
        </>
      ) : (
        <>
          <DateField label="飲みはじめた日" day={day} max={today} onChange={setDay} />
          <Button label={text.start} disabled={tooEarly} onPress={() => record(k.startPill(day, kind))} />
          {tooEarly && lastEnd && (
            <Text style={[styles.help, { color: colors.muted }]}>{`${fullDate(lastEnd)}より後の日を選んでください。`}</Text>
          )}
        </>
      )}
      {past.map(({ start, end }) => (
        <View key={start} style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>{`${fullDate(start)}〜${fullDate(end!)}`}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${fullDate(start)}からの${text.name}の記録を消す`}
            onPress={() => k.removePill(start, kind)}
            hitSlop={8}
          >
            <Text style={[styles.remove, { color: colors.danger }]}>消す</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8 },
  help: { fontSize: 13, lineHeight: 19 },
  status: { fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
  rowLabel: { fontSize: 15, flexShrink: 1 },
  remove: { fontSize: 14 },
});
