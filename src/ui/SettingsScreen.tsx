import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { AccuracyReport, DateKey, PMS_CYCLES, PmsEstimate, RiskKeywords } from '../engine';
import BackupPanel from './BackupPanel';
import { Button, Decorations, Notice, Ribbon, Section, Text } from './components';
import { dayTitle, shortDate } from './format';
import { Colors, fonts, radius, useColors } from './theme';
import type { Karenda } from './useKarenda';

type Props = { k: Karenda; today: DateKey };

export default function SettingsScreen({ k, today }: Props) {
  const colors = useColors();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const learned = k.titleWeights.filter((entry) => entry.weight);
  const { n, meanAbsErrorDays: mean, within1DayRate: rate, latest } = k.accuracy;
  const [lockAvailable, setLockAvailable] = useState<boolean | null>(null);
  const [lockFailed, setLockFailed] = useState(false);

  useEffect(() => {
    k.authenticator
      .isAvailable()
      .catch(() => false)
      .then(setLockAvailable);
  }, [k.authenticator]);

  const changeLock = async (on: boolean) => {
    setLockFailed(false);
    if (!(await k.setLock(on))) setLockFailed(true);
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Decorations colors={colors} />
      <View style={styles.title}>
        <Ribbon colors={colors} text="設定" />
      </View>

      <Section colors={colors} title="お知らせ通知">
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>重なる予定の前に通知する</Text>
          <Switch
            accessibilityLabel="重なる予定の前に通知する"
            value={k.notifyEnabled}
            onValueChange={k.setNotify}
            trackColor={{ true: colors.pink, false: colors.line }}
          />
        </View>
        <Text style={[styles.help, { color: colors.muted }]}>
          要注意（A）の予定は7日前と3日前、注意（B）の予定は3日前の朝9時に、この端末から通知します。同じ日の通知は1件にまとめます。重い予定・ふつうの予定のあとは、次の朝9時に「どうだった？」と1件だけ聞きます。
        </Text>
        {k.notifyEnabled && k.notifyAccess === 'denied' && (
          <Notice
            colors={colors}
            text="端末の設定で通知がオフになっています。"
            action={{ label: '設定アプリで許可する', onPress: () => Linking.openSettings() }}
          />
        )}
      </Section>

      <Section colors={colors} title="気をつける時期">
        <Stepper
          colors={colors}
          label="生理ヘビー期"
          unit="日間"
          value={k.settings.heavyDays}
          min={1}
          max={7}
          onChange={(heavyDays) => k.setSettings({ heavyDays })}
        />
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>PMS警戒期</Text>
          <View style={styles.chips}>
            {([false, true] as const).map((manual) => {
              const selected = (k.pms.source === 'manual') === manual;
              return (
                <Pressable
                  key={String(manual)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => !selected && k.setPmsManual(manual)}
                  hitSlop={4}
                  style={[
                    styles.chip,
                    styles.choice,
                    selected
                      ? { borderColor: colors.pink, backgroundColor: colors.pinkSoft }
                      : { borderColor: colors.line, backgroundColor: colors.surface },
                  ]}
                >
                  <Text style={[styles.chipText, { color: selected ? colors.pinkText : colors.muted }]}>
                    {manual ? '手動で指定' : '自動（推定）'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        {k.pms.source === 'manual' ? (
          <Stepper
            colors={colors}
            label="PMS警戒期（予定日の何日前から）"
            unit="日前"
            value={k.pms.daysBefore}
            min={0}
            max={14}
            onChange={(pmsDays) => k.setSettings({ pmsDays })}
          />
        ) : (
          <View>
            <Text style={[styles.rowLabel, { color: colors.text }]}>
              PMS は生理予定日の{k.pms.daysBefore}日前から（{k.pms.source === 'auto' ? 'あなたの記録から推定' : '記録がたまるまでの目安'}）
            </Text>
            <Text style={[styles.help, { color: colors.muted }]}>{pmsBasis(k.pms)}</Text>
          </View>
        )}
      </Section>

      <Section colors={colors} title="予定の重さを決める言葉">
        <Text style={[styles.help, { color: colors.muted }]}>
          予定のタイトルにこの言葉が入っていると、重い予定として扱います。終日の予定は「重い」になります（有給・休暇・代休・OFF の予定と祝日は除きます）。
        </Text>
        <KeywordList colors={colors} level="high" label="重い予定" keywords={k.keywords} onChange={k.setKeywords} />
        <KeywordList colors={colors} level="medium" label="ふつうの予定" keywords={k.keywords} onChange={k.setKeywords} />
      </Section>

      <Section colors={colors} title="覚えた予定">
        <Text style={[styles.help, { color: colors.muted }]}>
          予定のあとの「どうだった？」で同じ答えが2回続くと、その予定の重さを覚えて、上の言葉より優先します。重さを押すと直せます。
        </Text>
        {learned.length === 0 ? (
          <Text style={[styles.help, { color: colors.muted }]}>まだありません。</Text>
        ) : (
          learned.map((entry) => {
            const now = entry.weight === 'heavy' ? '重い' : 'ふつう';
            const next = entry.weight === 'heavy' ? 'normal' : 'heavy';
            return (
              <View key={entry.term} style={styles.row}>
                <View style={styles.learnedLabel}>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>{entry.label}</Text>
                  <Text style={[styles.help, { color: colors.muted }]}>
                    {entry.source === 'user' ? '自分で決めた' : `${entry.observations}回の答えから`}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`「${entry.label}」は${now}。押すと${next === 'heavy' ? '重い' : 'ふつう'}にする`}
                  onPress={() => k.setTitleWeight(entry, next)}
                  style={[styles.chip, { backgroundColor: colors.pinkSoft }]}
                >
                  <Text style={[styles.chipText, { color: colors.pinkText }]}>{now}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`「${entry.label}」の重さを忘れる`}
                  onPress={() => k.removeTitleWeight(entry.term)}
                  hitSlop={8}
                >
                  <Text style={[styles.remove, { color: colors.danger }]}>消す</Text>
                </Pressable>
              </View>
            );
          })
        )}
      </Section>

      <Section colors={colors} title="生理の記録">
        {k.starts.length === 0 ? (
          <Text style={[styles.help, { color: colors.muted }]}>まだ記録がありません。カレンダーで日付を選んで記録できます。</Text>
        ) : (
          [...k.starts].reverse().map((start) => (
            <View key={start} style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>{dayTitle(start)}〜</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${dayTitle(start)}の記録を消す`}
                onPress={() => k.removeStart(start)}
                hitSlop={8}
              >
                <Text style={[styles.remove, { color: colors.danger }]}>消す</Text>
              </Pressable>
            </View>
          ))
        )}
      </Section>

      <Section colors={colors} title="予測の当たり具合">
        {latest && <Text style={[styles.rowLabel, { color: colors.text }]}>{latestLine(latest)}</Text>}
        {mean === null || rate === null ? (
          <Text style={[styles.help, { color: colors.muted }]}>
            まだ評価できるデータが足りません（n={n}）。生理開始日を記録すると、その前に出していた予測と比べます。
          </Text>
        ) : (
          <>
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>平均のズレ</Text>
              <Text style={[styles.rowLabel, { color: colors.text }]}>{mean.toFixed(1)}日</Text>
            </View>
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>±1日以内</Text>
              <Text style={[styles.rowLabel, { color: colors.text }]}>
                {n}回中{Math.round(rate * n)}回（{Math.round(rate * 100)}%）
              </Text>
            </View>
            <Text style={[styles.help, { color: colors.muted }]}>直近{n}回（n={n}）の予測と、実際の開始日を比べています。</Text>
          </>
        )}
      </Section>

      <Section colors={colors} title="アプリのロック">
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>Face ID でロックする</Text>
          <Switch
            accessibilityLabel="Face ID でロックする"
            value={k.lockEnabled}
            onValueChange={changeLock}
            disabled={lockAvailable === false}
            trackColor={{ true: colors.pink, false: colors.line }}
          />
        </View>
        <Text style={[styles.help, { color: colors.muted }]}>
          アプリを開いた時と、ホームから戻った時に Face ID（またはパスコード）を求めます。何度失敗しても、記録は消えません。
        </Text>
        {lockAvailable === false && (
          <Text style={[styles.help, { color: colors.danger }]}>
            この iPhone にパスコードが設定されていないため、ロックは使えません。
          </Text>
        )}
        {lockFailed && (
          <Text style={[styles.help, { color: colors.danger }]}>
            Face ID で確かめられなかったため、ロックはオンにしていません。
          </Text>
        )}
      </Section>

      <Section colors={colors} title="利用状況の記録">
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>利用状況をこの iPhone に記録する</Text>
          <Switch
            accessibilityLabel="利用状況をこの iPhone に記録する"
            value={k.metricsEnabled}
            onValueChange={k.setMetrics}
            trackColor={{ true: colors.pink, false: colors.line }}
          />
        </View>
        <Text style={[styles.help, { color: colors.muted }]}>
          記録した回数などを、この iPhone の中だけで数えます。外には送りません。オフにしても、アプリの使い方は変わりません。
        </Text>
      </Section>

      <Section colors={colors} title="データ">
        <Text style={[styles.help, { color: colors.muted }]}>データはこの端末の中だけに保存しています。</Text>
        <BackupPanel k={k} today={today} />
        {confirmDelete ? (
          <View style={styles.confirm}>
            <Text style={[styles.help, { color: colors.text }]}>
              記録・設定・閉じたお知らせをすべて消します。元に戻せません。
            </Text>
            <Button
              colors={colors}
              kind="danger"
              label="すべて削除する"
              onPress={async () => {
                setConfirmDelete(false);
                await k.deleteAll();
              }}
            />
            <Button colors={colors} kind="secondary" label="やめる" onPress={() => setConfirmDelete(false)} />
          </View>
        ) : (
          <Button colors={colors} kind="danger" label="すべてのデータを削除" onPress={() => setConfirmDelete(true)} />
        )}
      </Section>
    </ScrollView>
  );
}

/** 最後に比べた回。なぐさめも言い訳も付けず、ズレた日数と日付だけ書く */
function latestLine({ predictedStart, actualStart, errorDays }: NonNullable<AccuracyReport['latest']>): string {
  if (errorDays === 0) return `前回は予測どおりでした（${shortDate(actualStart)}）。`;
  return `前回の予測は${Math.abs(errorDays)}日ズレました（予測 ${shortDate(predictedStart)} → 実際 ${shortDate(actualStart)}）。`;
}

/** 推定の根拠。推定できない間は、あと何がそろえば変わるか */
function pmsBasis({ source, observations }: PmsEstimate): string {
  if (source === 'auto') return `過去${PMS_CYCLES}周期の体調評価から推定しています。変わるのはこれからの予測だけです。`;
  if (observations >= PMS_CYCLES) return '周期ごとの差が大きいので、7日前のままにしています。';
  return `予定のあとの「どうだった？」から始まりが読めた周期：${observations}／${PMS_CYCLES}。そろうと、あなたに合わせた日数に変わります。`;
}

function Stepper({
  colors,
  label,
  unit,
  value,
  min,
  max,
  onChange,
}: {
  colors: Colors;
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const step = (delta: number) => onChange(Math.min(max, Math.max(min, value + delta)));
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}を減らす`}
          disabled={value <= min}
          onPress={() => step(-1)}
          hitSlop={8}
          style={[styles.stepButton, { backgroundColor: value <= min ? colors.disabledSurface : colors.pinkSoft }]}
        >
          <Text style={[styles.stepText, { color: value <= min ? colors.muted : colors.pinkText }]}>－</Text>
        </Pressable>
        <Text style={[styles.stepValue, { color: colors.text }]}>
          {value}
          {unit}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}を増やす`}
          disabled={value >= max}
          onPress={() => step(1)}
          hitSlop={8}
          style={[styles.stepButton, { backgroundColor: value >= max ? colors.disabledSurface : colors.pinkSoft }]}
        >
          <Text style={[styles.stepText, { color: value >= max ? colors.muted : colors.pinkText }]}>＋</Text>
        </Pressable>
      </View>
    </View>
  );
}

function KeywordList({
  colors,
  level,
  label,
  keywords,
  onChange,
}: {
  colors: Colors;
  level: 'high' | 'medium';
  label: string;
  keywords: RiskKeywords;
  onChange: (keywords: RiskKeywords) => void;
}) {
  const [draft, setDraft] = useState('');
  const words = keywords[level];

  const add = () => {
    const word = draft.trim();
    if (!word) return;
    const other = level === 'high' ? 'medium' : 'high';
    onChange({
      ...keywords,
      [level]: words.includes(word) ? words : [...words, word],
      [other]: keywords[other].filter((existing) => existing !== word),
    });
    setDraft('');
  };

  return (
    <View style={styles.keywordBlock}>
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      <View style={styles.chips}>
        {words.map((word) => (
          <Pressable
            key={word}
            accessibilityRole="button"
            accessibilityLabel={`「${word}」を${label}から外す`}
            onPress={() => onChange({ ...keywords, [level]: words.filter((existing) => existing !== word) })}
            style={[styles.chip, { backgroundColor: colors.pinkSoft }]}
          >
            <Text style={[styles.chipText, { color: colors.pinkText }]}>{word} ×</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.addRow}>
        <TextInput
          accessibilityLabel={`${label}に言葉を追加`}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          placeholder="言葉を追加"
          placeholderTextColor={colors.muted}
          returnKeyType="done"
          style={[styles.input, { color: colors.text, borderColor: colors.line, backgroundColor: colors.background }]}
        />
        <Pressable accessibilityRole="button" accessibilityLabel={`${label}に追加`} onPress={add} hitSlop={8}>
          <Text style={[styles.addLabel, { color: colors.pinkText }]}>追加</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  title: { marginTop: 8, marginBottom: 4 },
  help: { fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowLabel: { fontSize: 15, flexShrink: 1 },
  learnedLabel: { flex: 1 },
  remove: { fontSize: 14, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepButton: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 20, fontWeight: '700' },
  stepValue: { fontSize: 15, minWidth: 48, textAlign: 'center' },
  keywordBlock: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { borderWidth: 1 },
  chip: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 13 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: fonts.regular,
  },
  addLabel: { fontSize: 15, fontWeight: '600' },
  confirm: { gap: 8 },
});
