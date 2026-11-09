import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import {
  AccuracyReport,
  cycleSummary,
  CycleStats,
  DateKey,
  DAY_REMINDER_AT,
  DEFAULT_PMS,
  ExcludedInterval,
  LEAD_DAYS,
  LEARN_AFTER,
  MAX_PER_ALERT,
  MAX_PLAUSIBLE,
  MIN_PLAUSIBLE,
  PMS_CYCLES,
  RECENT_CYCLES,
  PmsEstimate,
  predictCycle,
  RiskKeywords,
  SOON_MINUTES,
} from '../engine';
import { CALENDAR_NOTE, NOTIFY_HOUR, outboundCount, PRIVACY_FACTS, STORED_DATA } from '../data';
import { BackupPanel } from './BackupPanel';
import { PillPanel } from './PillPanel';
import { BIOMETRIC, Button, Chip, Confirm, Decorations, Input, Notice, PASSCODE, Ribbon, Section, Text } from './components';
import { dayTitle, fullDate, shortDate } from './format';
import { radius, useColors } from './theme';
import type { Karenda } from './useKarenda';

type Props = { k: Karenda; today: DateKey };

export function SettingsScreen({ k, today }: Props) {
  const colors = useColors();
  const learned = k.titleWeights.filter((entry) => entry.weight);
  const { n, meanAbsErrorDays: mean, within1DayRate: rate, latest } = k.accuracy;
  const excluded = predictCycle(k.starts, k.notes)?.excluded ?? [];
  const summary = cycleSummary(k.starts, k.notes, k.ends);
  // ずらした生理は、ふだんの周期より何日長かった（短かった）か
  const shiftedGap = summary.shifted && summary.natural ? summary.shifted.average - summary.natural.average : null;
  const summaryRows: [string, CycleStats | null, string?][] = [
    ['ふだんの周期', summary.natural],
    ['ピルを飲んでいた間の周期', summary.pill],
    [
      '薬でずらした生理までの間隔',
      summary.shifted,
      shiftedGap ? `ふだんより平均${Math.abs(shiftedGap)}日${shiftedGap > 0 ? '長い' : '短い'}` : undefined,
    ],
    ['生理の日数（終わりの日を記録した回）', summary.periodDays],
  ];
  const reasonName = (reason: ExcludedInterval['reason']) =>
    ({
      tooShort: '間隔が短すぎる',
      tooLong: '間隔が長すぎる',
      shifted: '薬で時期をずらした',
      pill: 'ピルを飲んでいた間',
      offPill: 'ピルを飲む前',
    })[reason];
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
      <Decorations />
      <View style={styles.title}>
        <Ribbon text="設定" />
      </View>

      <Section title="カレンダー">
        {k.access === 'granted' ? (
          <Text style={[styles.help, { color: colors.muted }]}>
            カレンダーの予定を読んで、生理の時期との重なりを見ています。書き換えはしません。
          </Text>
        ) : k.calendarSkipped ? (
          <>
            <Text style={[styles.help, { color: colors.muted }]}>
              カレンダーは使っていません。予定はカレンダー画面から、このアプリの中だけに入れられます。
            </Text>
            <Button kind="secondary" label="カレンダーを使う" onPress={() => void k.enableCalendar()} />
          </>
        ) : (
          <Notice
            text="端末の設定でカレンダーがオフになっています。"
            action={{ label: '設定アプリで許可する', onPress: () => Linking.openSettings() }}
          />
        )}
      </Section>

      <Section title="お知らせ通知">
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>通知を使う</Text>
          <Switch
            accessibilityLabel="通知を使う"
            value={k.notifyEnabled}
            onValueChange={k.setNotify}
            trackColor={{ true: colors.pink, false: colors.line }}
          />
        </View>
        <Text style={[styles.help, { color: colors.muted }]}>
          {`重なる予定は、要注意（A）なら${leadDays('A')}、注意（B）なら${leadDays('B')}、どちらも決める目安の日にも、朝${NOTIFY_HOUR}時にこの端末から通知します。1つの予定の通知は${MAX_PER_ALERT}回まで、同じ日の通知は1件にまとめます。「今日は決めない」を押すと、次の日にもう一度だけ知らせます。重い予定・ふつうの予定のあとは、次の朝${NOTIFY_HOUR}時に「どうだった？」と1件だけ聞きます。時刻のある予定がある日は、朝${DAY_REMINDER_AT / 60}時（${DAY_REMINDER_AT / 60 + 1}時より前に始まる日はその1時間前）に「今日の予定」を知らせます。`}
        </Text>
        {k.notifyEnabled && k.notifyAccess === 'denied' && (
          <Notice
            text="端末の設定で通知がオフになっています。"
            action={{ label: '設定アプリで許可する', onPress: () => Linking.openSettings() }}
          />
        )}
        {k.notifyEnabled && (
          <>
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>{`予定の${SOON_MINUTES}分前にも知らせる`}</Text>
              <Switch
                accessibilityLabel={`予定の${SOON_MINUTES}分前にも知らせる`}
                value={k.soonEnabled}
                onValueChange={k.setSoon}
                trackColor={{ true: colors.pink, false: colors.line }}
              />
            </View>
            <Text style={[styles.help, { color: colors.muted }]}>
              時刻のある予定が始まる{SOON_MINUTES}分前に、もう一度知らせます。カレンダーで予定を変えた時は、Cocomia を開くと通知も変わります。
              {k.soonEnabled && k.exactAlarm === false && '下の「時刻ちょうどに知らせる」がオフだと、予定に間に合わないことがあります。'}
            </Text>
          </>
        )}
        {k.notifyEnabled && k.exactAlarm !== null && (
          <>
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>時刻ちょうどに知らせる</Text>
              <Switch
                accessibilityLabel="時刻ちょうどに知らせる"
                value={k.exactAlarm}
                onValueChange={() => void k.openExactAlarm()}
                trackColor={{ true: colors.pink, false: colors.line }}
              />
            </View>
            <Text style={[styles.help, { color: colors.muted }]}>
              オフの時は、通知が決まった時刻より最大1時間ほど遅れて届くことがあります。切り替えると設定アプリが開くので、「アラームとリマインダー」でオンかオフを選んでください。
            </Text>
          </>
        )}
      </Section>

      <Section title="気をつける時期">
        <Stepper
          label="生理ヘビー期"
          unit="日間"
          value={k.settings.heavyDays}
          min={1}
          max={7}
          onChange={(heavyDays) => k.setSettings({ heavyDays })}
        />
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>PMSの時期</Text>
          <View style={styles.chips}>
            {([false, true] as const).map((manual) => {
              const selected = (k.pms.source === 'manual') === manual;
              return (
                <Chip
                  key={String(manual)}
                  label={manual ? '手動で指定' : '自動（推定）'}
                  selected={selected}
                  onPress={() => !selected && k.setPmsManual(manual)}
                />
              );
            })}
          </View>
        </View>
        {k.pms.source === 'manual' ? (
          <Stepper
            label="PMSの時期（予定日の何日前から）"
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

      <Section title="予定の重さを決める言葉">
        <Text style={[styles.help, { color: colors.muted }]}>
          予定のタイトルにこの言葉が入っていると、重い予定として扱います。終日の予定は「重い」になります（有給・休暇・代休・OFF の予定と祝日は除きます）。
        </Text>
        <KeywordList level="high" label="重い予定" keywords={k.keywords} onChange={k.setKeywords} />
        <KeywordList level="medium" label="ふつうの予定" keywords={k.keywords} onChange={k.setKeywords} />
      </Section>

      <Section title="覚えた予定">
        <Text style={[styles.help, { color: colors.muted }]}>
          {`予定のあとの「どうだった？」で同じ答えが${LEARN_AFTER}回続くと、その予定の重さを覚えて、上の言葉より優先します。重さを押すと直せます。`}
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
                <Chip
                  soft
                  label={now}
                  accessibilityLabel={`「${entry.label}」は${now}。押すと${next === 'heavy' ? '重い' : 'ふつう'}にする`}
                  onPress={() => k.setTitleWeight(entry, next)}
                />
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

      <Section title="生理の記録">
        {k.starts.length === 0 ? (
          <Text style={[styles.help, { color: colors.muted }]}>まだ記録がありません。カレンダーで日付を選んで記録できます。</Text>
        ) : (
          [...k.starts].reverse().map((start) => (
            <Confirm
              key={start}
              message={`${dayTitle(start)}の記録を消します。予測も変わります。`}
              label="記録を消す"
              onConfirm={() => k.removeStart(start)}
              trigger={(ask) => (
                <View style={styles.row}>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>{dayTitle(start)}〜</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={`${dayTitle(start)}の記録を消す`} onPress={ask} hitSlop={8}>
                    <Text style={[styles.remove, { color: colors.danger }]}>消す</Text>
                  </Pressable>
                </View>
              )}
            />
          ))
        )}
      </Section>

      <Section title="周期のまとめ">
        {summaryRows.every(([, stats]) => !stats) ? (
          <Text style={[styles.help, { color: colors.muted }]}>
            まだありません。生理の始まりの日を2回以上記録すると、周期の日数をまとめます。
          </Text>
        ) : (
          summaryRows.map(([label, stats, note]) =>
            stats ? (
              <View key={label} style={styles.summaryRow}>
                <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
                <Text style={[styles.help, { color: colors.muted }]}>
                  {`平均${stats.average}日（${stats.shortest}〜${stats.longest}日、${stats.count}回）${note ? `。${note}` : ''}`}
                </Text>
              </View>
            ) : null,
          )
        )}
        <Text style={[styles.help, { color: colors.muted }]}>
          これまでの記録全部からのまとめです（予測は最近の{RECENT_CYCLES}回から）。{MIN_PLAUSIBLE}日より短い・{MAX_PLAUSIBLE}
          日より長い間隔は、記録の抜けかもしれないので入れていません。薬でずらした生理には、月経移動の薬のあとの生理も入ります。
        </Text>
      </Section>

      <Section title="ピル">
        <PillPanel k={k} today={today} />
      </Section>

      <Section title="月経移動">
        <PillPanel k={k} today={today} kind="shift" />
      </Section>

      {excluded.length > 0 && (
        <Section title="予測に使っていない間隔">
          <Text style={[styles.help, { color: colors.muted }]}>
            {excluded.length}件を予測の計算から外しました（{[...new Set(excluded.map((gap) => reasonName(gap.reason)))].join('／')}
            ）。{MIN_PLAUSIBLE}日より短い・{MAX_PLAUSIBLE}日より長い間隔は、記録の抜けや重なりかもしれないので使っていません。薬で時期をずらした生理（月経移動の薬のあとの生理も）までの間隔も使っていません。ピルを飲んでいる間と飲んでいない間は、分けて予測しています。記録は消えていません。
          </Text>
          {excluded.map((gap) => (
            <Text key={gap.from} style={[styles.rowLabel, { color: colors.text }]}>
              {fullDate(gap.from)}〜{fullDate(gap.to)}　{gap.days}日（{reasonName(gap.reason)}）
            </Text>
          ))}
        </Section>
      )}

      <Section title="予測の当たり具合">
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
                {n}回中{Math.round(rate * n)}回
              </Text>
            </View>
            <Text style={[styles.help, { color: colors.muted }]}>直近{n}回（n={n}）の予測と、実際の開始日を比べています。</Text>
          </>
        )}
        <Text style={[styles.help, { color: colors.muted }]}>予測は目安です。体調の判断は医師にご相談ください。</Text>
      </Section>

      <Section title="アプリのロック">
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>{BIOMETRIC}でロックする</Text>
          <Switch
            accessibilityLabel={`${BIOMETRIC}でロックする`}
            value={k.lockEnabled}
            onValueChange={changeLock}
            disabled={lockAvailable === false}
            trackColor={{ true: colors.pink, false: colors.line }}
          />
        </View>
        <Text style={[styles.help, { color: colors.muted }]}>
          アプリを開いた時と、ホームから戻った時に{BIOMETRIC}（または{PASSCODE}）を求めます。何度失敗しても、記録は消えません。
        </Text>
        {lockAvailable === false && (
          <Text style={[styles.help, { color: colors.danger }]}>
            この端末に{PASSCODE}が設定されていないため、ロックは使えません。
          </Text>
        )}
        {lockFailed && (
          <Text style={[styles.help, { color: colors.danger }]}>
            {BIOMETRIC}で確かめられなかったため、ロックはオンにしていません。
          </Text>
        )}
      </Section>

      <Section title="利用状況の記録">
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>利用状況をこの端末に記録する</Text>
          <Switch
            accessibilityLabel="利用状況をこの端末に記録する"
            value={k.metricsEnabled}
            onValueChange={k.setMetrics}
            trackColor={{ true: colors.pink, false: colors.line }}
          />
        </View>
        <Text style={[styles.help, { color: colors.muted }]}>
          記録した回数などを、この端末の中だけで数えます。外には送りません。オフにしても、アプリの使い方は変わりません。
        </Text>
      </Section>

      <Section title="プライバシー">
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>外部への送信</Text>
          <Text style={[styles.rowLabel, { color: colors.text }]}>{outboundCount()}件</Text>
        </View>
        <Text style={[styles.help, { color: colors.muted }]}>アプリを開いてから、外へ通信しようとした回数を、アプリの中で数えています。</Text>
        {PRIVACY_FACTS.map(({ label, value, note }) => (
          <View key={label}>
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
              <Text style={[styles.rowLabel, { color: colors.text }]}>{value}</Text>
            </View>
            <Text style={[styles.help, { color: colors.muted }]}>{note}</Text>
          </View>
        ))}
        <Text style={[styles.rowLabel, { color: colors.text }]}>この端末に残すもの</Text>
        {STORED_DATA.map(({ table, what, why }) => (
          <Text key={table} style={[styles.help, { color: colors.muted }]}>
            ・{what}：{why}
          </Text>
        ))}
        <Text style={[styles.help, { color: colors.muted }]}>{CALENDAR_NOTE}</Text>
      </Section>

      <Section title="データ">
        <Text style={[styles.help, { color: colors.muted }]}>データはこの端末の中だけに保存しています。</Text>
        <BackupPanel k={k} today={today} />
        <Confirm
          message="記録・設定・閉じたお知らせをすべて消します。元に戻せません。"
          label="すべて削除する"
          onConfirm={k.deleteAll}
          trigger={(ask) => <Button kind="danger" label="すべてのデータを削除" onPress={ask} />}
        />
      </Section>
    </ScrollView>
  );
}

/** 最後に比べた回。なぐさめも言い訳も付けず、ズレた日数と日付だけ書く */
function latestLine({ predictedStart, actualStart, errorDays }: NonNullable<AccuracyReport['latest']>): string {
  if (errorDays === 0) return `前回は予測どおりでした（${shortDate(actualStart)}）。`;
  return `前回の予測は${Math.abs(errorDays)}日ズレました（予測 ${shortDate(predictedStart)} → 実際 ${shortDate(actualStart)}）。`;
}

/** 「7日前と3日前」のように、重なる予定の通知が何日前に来るか */
const leadDays = (grade: keyof typeof LEAD_DAYS) => LEAD_DAYS[grade].map((days) => `${days}日前`).join('と');

/** 推定の根拠。推定できない間は、あと何がそろえば変わるか */
function pmsBasis({ source, observations }: PmsEstimate): string {
  if (source === 'auto') return `過去${PMS_CYCLES}周期の体調評価から推定しています。変わるのはこれからの予測だけです。`;
  if (observations >= PMS_CYCLES) return `周期ごとの差が大きいので、${DEFAULT_PMS.daysBefore}日前のままにしています。`;
  return `最近の約1年で、予定のあとの「どうだった？」から始まりが読めた周期：${observations}／${PMS_CYCLES}。そろうと、あなたに合わせた日数に変わります。`;
}

function Stepper({
  label,
  unit,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const colors = useColors();
  const step = (delta: number) => onChange(Math.min(max, Math.max(min, value + delta)));
  return (
    // 読み上げでは1つのまとまりにして、今の値を読み、上下のスワイプで増減する
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: `${value}${unit}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={({ nativeEvent }) => step(nativeEvent.actionName === 'increment' ? 1 : -1)}
      style={styles.row}
    >
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
  level,
  label,
  keywords,
  onChange,
}: {
  level: 'high' | 'medium';
  label: string;
  keywords: RiskKeywords;
  onChange: (keywords: RiskKeywords) => void;
}) {
  const colors = useColors();
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
          <Chip
            key={word}
            soft
            label={`${word} ×`}
            accessibilityLabel={`「${word}」を${label}から外す`}
            onPress={() => onChange({ ...keywords, [level]: words.filter((existing) => existing !== word) })}
          />
        ))}
      </View>
      <View style={styles.addRow}>
        <Input
          accessibilityLabel={`${label}に言葉を追加`}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          placeholder="言葉を追加"
          returnKeyType="done"
          style={styles.addInput}
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
  summaryRow: { gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowLabel: { fontSize: 15, flexShrink: 1 },
  learnedLabel: { flex: 1 },
  remove: { fontSize: 14, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepButton: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 20, fontWeight: '700' },
  stepValue: { fontSize: 15, minWidth: 48, textAlign: 'center' },
  keywordBlock: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flexShrink: 1 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addInput: { flex: 1 },
  addLabel: { fontSize: 15, fontWeight: '600' },
});
