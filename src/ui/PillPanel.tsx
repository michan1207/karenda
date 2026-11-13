import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { MedicineKind } from '../data';
import { DateKey, SHIFT_AFTER_DAYS } from '../engine';
import { DateField } from './DateField';
import { Button, Confirm, Text } from './components';
import { fullDate } from './format';
import { radius, useColors } from './theme';
import type { Karenda } from './useKarenda';

// 飲み方は医師・薬剤師の説明が先。アプリは記録と予測の目安だけで、避妊や服薬の管理には使えないことをはっきり書く
const SYMPTOMS =
  '強い頭痛、胸の痛み、息苦しさ、ふくらはぎの痛みやはれ、見え方の変化などがある時は、早めに医療機関に相談してください。';

const TEXT: Record<MedicineKind, { help: string; start: string; end: string; name: string; cautions: string[] }> = {
  pill: {
    help: 'ピルを飲んでいる間の生理は、ふだんの周期と分けて予測します。飲んでいる間は、生理やPMSの時期の目安が合わないことがあります。',
    start: 'この日からピルを飲んでいる',
    end: 'この日でピルをやめた',
    name: 'ピル',
    cautions: [
      '飲み方や、飲み忘れた時のことは、処方した医師や薬剤師の説明に従ってください。',
      'このアプリの予測は、避妊やピルを飲む日の管理には使えません。',
      SYMPTOMS,
    ],
  },
  shift: {
    help: `月経移動（薬で生理の時期をずらすこと）の薬を飲んだ日を記録します。飲みはじめてから、やめた日の${SHIFT_AFTER_DAYS}日後までに始まった生理は、ずらした生理として、予測の平均に入れません。`,
    start: 'この日から月経移動の薬を飲んでいる',
    end: 'この日で月経移動の薬をやめた',
    name: '月経移動',
    cautions: [
      '月経移動の薬は、医師に相談して、処方と説明のとおりに飲んでください。予定の日が決まったら、早めに相談すると安心です。',
      '薬をやめてから生理が来るまでの日数は、人によってちがいます。予定の前後は、ナプキンなどの用意があると安心です。',
      'このアプリの予測は、薬を飲む日を決めるのには使えません。',
      SYMPTOMS,
    ],
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
      <View style={[styles.caution, { borderColor: colors.line }]}>
        <Text style={[styles.cautionTitle, { color: colors.text }]}>注意</Text>
        {text.cautions.map((line) => (
          <Text key={line} style={[styles.help, { color: colors.text }]}>{`・${line}`}</Text>
        ))}
      </View>
      {current ? (
        <>
          <Text style={[styles.status, { color: colors.text }]}>{`${fullDate(current.start)}から飲んでいます`}</Text>
          <DateField label="やめた日" day={day} min={current.start} max={today} onChange={setDay} />
          <Button label={text.end} disabled={tooEarly} onPress={() => record(k.endPill(current.start, day, kind))} />
          <Confirm
            message={`${fullDate(current.start)}からの${text.name}の記録を消します。予測も変わります。`}
            label="記録を消す"
            onConfirm={() => k.removePill(current.start, kind)}
            trigger={(ask) => <Button kind="secondary" label="この記録を消す" onPress={ask} />}
          />
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
        <Confirm
          key={start}
          message={`${fullDate(start)}〜${fullDate(end!)}の${text.name}の記録を消します。予測も変わります。`}
          label="記録を消す"
          onConfirm={() => k.removePill(start, kind)}
          trigger={(ask) => (
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>{`${fullDate(start)}〜${fullDate(end!)}`}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`${fullDate(start)}からの${text.name}の記録を消す`} onPress={ask} hitSlop={8}>
                <Text style={[styles.remove, { color: colors.danger }]}>消す</Text>
              </Pressable>
            </View>
          )}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8 },
  help: { fontSize: 13, lineHeight: 19 },
  caution: { borderWidth: 1, borderRadius: radius.md, padding: 12, gap: 4 },
  cautionTitle: { fontSize: 14, fontWeight: '700' },
  status: { fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
  rowLabel: { fontSize: 15, flexShrink: 1 },
  remove: { fontSize: 14 },
});
