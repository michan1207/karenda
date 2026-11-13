import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Answer, DailyCheck, DateKey, Symptom, SYMPTOMS } from '../engine';
import { Button, Card, Chip, Text } from './components';
import { dayTitle } from './format';
import { useColors } from './theme';

const ANSWERS: [Answer, string][] = [
  ['hard', 'きつかった'],
  ['normal', 'ふつう'],
  ['easy', '元気だった'],
];

const SYMPTOM_LABELS: Record<Symptom, string> = {
  cramps: 'おなかの痛み',
  headache: '頭痛',
  backache: '腰の痛み',
  tired: 'だるさ',
  sleepy: '眠気',
  irritable: 'イライラ',
  low: '落ちこみ',
  bloating: 'むくみ',
};

/** 「ふつう・頭痛、眠気」のように1行で */
const checkText = ({ answer, symptoms }: DailyCheck) =>
  answer === null
    ? '答えなかった日'
    : [ANSWERS.find(([a]) => a === answer)![1], symptoms.map((s) => SYMPTOM_LABELS[s]).join('、')].filter(Boolean).join('・');

/** 3つから1つと、症状（いくつでも・選ばなくてもよい）を選んで「記録する」 */
function CheckForm({
  date,
  initial,
  onSave,
  closeLabel,
  onClose,
}: {
  date: DateKey;
  initial?: DailyCheck;
  onSave: (check: DailyCheck) => void;
  closeLabel: string;
  onClose: () => void;
}) {
  const colors = useColors();
  const [answer, setAnswer] = useState<Answer | null>(initial?.answer ?? null);
  const [symptoms, setSymptoms] = useState<Symptom[]>(initial?.symptoms ?? []);
  const toggle = (symptom: Symptom) =>
    setSymptoms((now) => (now.includes(symptom) ? now.filter((s) => s !== symptom) : SYMPTOMS.filter((s) => s === symptom || now.includes(s))));
  return (
    <View style={styles.form}>
      <View style={styles.chips}>
        {ANSWERS.map(([value, label]) => (
          <Chip key={value} label={label} selected={answer === value} onPress={() => setAnswer(value)} />
        ))}
      </View>
      <Text style={[styles.help, { color: colors.muted }]}>気になったことがあれば（いくつでも）</Text>
      <View style={styles.chips}>
        {SYMPTOMS.map((symptom) => (
          <Chip key={symptom} label={SYMPTOM_LABELS[symptom]} selected={symptoms.includes(symptom)} onPress={() => toggle(symptom)} />
        ))}
      </View>
      <Button label="記録する" disabled={answer === null} onPress={() => answer && onSave({ date, answer, symptoms })} />
      <Button kind="secondary" label={closeLabel} onPress={onClose} />
    </View>
  );
}

/** アプリを開いた時に、昨日の体調を1回だけ聞く。「答えない」でもその日はもう聞かない */
export function DailyCheckCard({ date, onSave }: { date: DateKey; onSave: (check: DailyCheck) => void }) {
  const colors = useColors();
  return (
    <Card>
      <Text style={[styles.title, { color: colors.text }]}>昨日（{dayTitle(date)}）の体調は？</Text>
      <Text style={[styles.help, { color: colors.muted }]}>あとからカレンダーで日を選んで直せます。</Text>
      <CheckForm date={date} onSave={onSave} closeLabel="答えない" onClose={() => onSave({ date, answer: null, symptoms: [] })} />
    </Card>
  );
}

/** カレンダーで選んだ日の体調。記録があれば1行で見せ、ボタンで入れる・直す */
export function DayCheck({ date, check, onSave }: { date: DateKey; check?: DailyCheck; onSave: (check: DailyCheck) => void }) {
  const colors = useColors();
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <CheckForm
        date={date}
        initial={check}
        onSave={(next) => {
          setEditing(false);
          onSave(next);
        }}
        closeLabel="やめる"
        onClose={() => setEditing(false)}
      />
    );
  }
  return (
    <View style={styles.form}>
      {check && <Text style={[styles.detail, { color: colors.text }]}>体調：{checkText(check)}</Text>}
      <Button kind="secondary" label={check ? 'この日の体調を直す' : 'この日の体調を記録'} onPress={() => setEditing(true)} />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: '700' },
  help: { fontSize: 13 },
  detail: { fontSize: 14, lineHeight: 21 },
  form: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
