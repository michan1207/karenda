import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { ReactNode, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { outboundCount } from '../data';
import { DateKey, fromDateKey, predictCycle, predictedPeriod, toDateKey } from '../engine';
import { Button, Card, Decorations, Heart, Mascot, MASCOT_NAME, Ribbon, Text } from './components';
import { dayTitle, predictionLines } from './format';
import { Colors, useColors } from './theme';
import type { Karenda } from './useKarenda';

const STEPS = 5;

/**
 * はじめの案内。1つの手順に1つのことだけ。
 * 何ができるか → 通信しないこと → その場で1回記録 → 予測 → 最後にカレンダーの許可（「今はしない」も同じ重さで置く）
 */
export default function OnboardingScreen({ k, today }: { k: Karenda; today: DateKey }) {
  const colors = useColors();
  const [step, setStep] = useState(0);
  const [day, setDay] = useState(today);
  const next = () => setStep((current) => current + 1);
  const prediction = predictCycle(k.starts);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Decorations colors={colors} />
      <Text style={[styles.progress, { color: colors.muted }]}>
        {step + 1} / {STEPS}
      </Text>

      {step === 0 && (
        <>
          <View style={styles.hero}>
            <Mascot colors={colors} size={150} />
            <Text style={[styles.name, { color: colors.pinkText, backgroundColor: colors.surface }]}>
              案内役の{MASCOT_NAME}だよ。よろしくね
            </Text>
            <Ribbon colors={colors} text="Cocomia" />
          </View>
          <Text style={[styles.lead, { color: colors.text }]}>生理と大事な予定がぶつかる前に、教えます</Text>
          <Button colors={colors} label="はじめる" onPress={next} />
        </>
      )}

      {step === 1 && (
        <Step colors={colors} title="通信を切っても、そのまま使えます">
          <Text style={[styles.body, { color: colors.muted }]}>
            記録も予測も、この端末の中だけで計算します。機内モードにしても同じように動きます。アカウント登録もいりません。
          </Text>
          <View style={styles.fact}>
            <Text style={[styles.body, { color: colors.text }]}>外部への送信</Text>
            <Text style={[styles.body, { color: colors.text }]}>{outboundCount()}件</Text>
          </View>
          <Button colors={colors} label="次へ" onPress={next} />
        </Step>
      )}

      {step === 2 && (
        <Step colors={colors} title="前回の生理が始まった日は？">
          <Text style={[styles.body, { color: colors.muted }]}>ここで1回記録してみましょう。あとからカレンダーで直せます。</Text>
          <DayPicker colors={colors} day={day} today={today} onChange={setDay} />
          <Text style={[styles.body, { color: colors.text }]}>選んだ日：{dayTitle(day)}</Text>
          <Button
            colors={colors}
            label="この日を記録する"
            onPress={async () => {
              await k.addStart(day);
              next();
            }}
          />
          <Button colors={colors} kind="secondary" label="まだ記録しない" onPress={next} />
        </Step>
      )}

      {step === 3 && (
        <Step colors={colors} title="次の生理の予測">
          {prediction ? (
            predictionLines(prediction, predictedPeriod(prediction, 1)).map((line, i) => (
              <Text key={line} style={[styles.body, { color: i === 0 ? colors.text : colors.muted }]}>
                {line}
              </Text>
            ))
          ) : (
            <Text style={[styles.body, { color: colors.muted }]}>記録すると、次の生理の予測がここに出ます。</Text>
          )}
          <Text style={[styles.body, { color: colors.muted }]}>予測は目安です。医療的な診断や避妊には使えません。</Text>
          <Button colors={colors} label="次へ" onPress={next} />
        </Step>
      )}

      {step === 4 && (
        <Step colors={colors} title="カレンダーと照らし合わせますか？">
          <Text style={[styles.body, { color: colors.muted }]}>
            予定と照らし合わせるために、カレンダーを読みます。書き換えはしません。外にも送りません。
          </Text>
          <Button colors={colors} kind="secondary" label="カレンダーを使う" onPress={() => k.finishOnboarding(true)} />
          <Button colors={colors} kind="secondary" label="今はしない" onPress={() => k.finishOnboarding(false)} />
          <Text style={[styles.body, { color: colors.muted }]}>
            今はしない場合も、予定をこのアプリの中だけに入れられます。設定からいつでもカレンダーを使えます。
          </Text>
        </Step>
      )}
    </ScrollView>
  );
}

function Step({ colors, title, children }: { colors: Colors; title: string; children: ReactNode }) {
  return (
    <Card colors={colors} style={styles.step}>
      <View style={styles.stepHead}>
        <Heart color={colors.heart} size={12} />
        <Text style={[styles.stepTitle, { color: colors.pinkText }]}>{title}</Text>
      </View>
      {children}
    </Card>
  );
}

/** 日付を選ぶ。iPhone はその場に小さなカレンダー、Android は押すと日付のダイアログ。今日より先は選べない */
function DayPicker({ colors, day, today, onChange }: { colors: Colors; day: DateKey; today: DateKey; onChange: (day: DateKey) => void }) {
  const value = fromDateKey(day);
  const max = fromDateKey(today);
  const pick = (date?: Date) => date && onChange(toDateKey(date));
  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        accessibilityLabel="生理が始まった日"
        mode="date"
        display="inline"
        value={value}
        maximumDate={max}
        accentColor={colors.pink}
        onChange={(_, date) => pick(date)}
      />
    );
  }
  return (
    <Button
      colors={colors}
      kind="secondary"
      label="日付を選ぶ"
      onPress={() => DateTimePickerAndroid.open({ mode: 'date', value, maximumDate: max, onChange: (_, date) => pick(date) })}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, gap: 14 },
  progress: { fontSize: 13, textAlign: 'center' },
  hero: { alignItems: 'center', gap: 8, marginTop: 16 },
  name: { fontSize: 14, fontWeight: '700', borderRadius: 999, overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 4 },
  lead: { fontSize: 17, marginBottom: 8, textAlign: 'center' },
  step: { gap: 12 },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepTitle: { fontSize: 17, fontWeight: '700', flexShrink: 1 },
  body: { fontSize: 15, lineHeight: 22 },
  fact: { flexDirection: 'row', justifyContent: 'space-between' },
});
