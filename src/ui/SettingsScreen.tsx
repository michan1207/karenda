import { useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { RiskKeywords, ZoneSettings } from '../engine';
import { Button, Notice, Section } from './components';
import { dayTitle } from './format';
import { Colors, radius, useColors } from './theme';
import type { Karenda } from './useKarenda';

type Props = { k: Karenda };

export default function SettingsScreen({ k }: Props) {
  const colors = useColors();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exportError, setExportError] = useState(false);

  const updateSettings = (patch: Partial<ZoneSettings>) => k.setSettings({ ...k.settings, ...patch });

  const exportData = async () => {
    try {
      setExportError(false);
      await Share.share({ message: await k.exportJson() });
    } catch {
      setExportError(true);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        設定
      </Text>

      <Section colors={colors} title="お知らせ通知">
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>重なる予定の前に通知する</Text>
          <Switch
            accessibilityLabel="重なる予定の前に通知する"
            value={k.notifyEnabled}
            onValueChange={k.setNotify}
            trackColor={{ true: colors.accent, false: colors.line }}
          />
        </View>
        <Text style={[styles.help, { color: colors.muted }]}>
          しっかり注意の予定は7日前と3日前、少し注意の予定は3日前の朝9時に、この端末から通知します。同じ日の通知は1件にまとめます。
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
          onChange={(heavyDays) => updateSettings({ heavyDays })}
        />
        <Stepper
          colors={colors}
          label="PMS警戒期（予定日の何日前から）"
          unit="日前"
          value={k.settings.pmsDays}
          min={0}
          max={14}
          onChange={(pmsDays) => updateSettings({ pmsDays })}
        />
      </Section>

      <Section colors={colors} title="予定の重さを決める言葉">
        <Text style={[styles.help, { color: colors.muted }]}>
          予定のタイトルにこの言葉が入っていると、重い予定として扱います。終日の予定は「重い」になります。
        </Text>
        <KeywordList colors={colors} level="high" label="重い予定" keywords={k.keywords} onChange={k.setKeywords} />
        <KeywordList colors={colors} level="medium" label="ふつうの予定" keywords={k.keywords} onChange={k.setKeywords} />
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

      <Section colors={colors} title="データ">
        <Text style={[styles.help, { color: colors.muted }]}>
          データはこの端末の中だけに保存しています。機種変更のときは書き出して保管してください。
        </Text>
        <Button colors={colors} kind="secondary" label="データを書き出す" onPress={exportData} />
        {exportError && <Text style={[styles.help, { color: colors.danger }]}>書き出せませんでした。もう一度お試しください。</Text>}
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
          style={[styles.stepButton, { backgroundColor: value <= min ? colors.disabledSurface : colors.pms }]}
        >
          <Text style={[styles.stepText, { color: value <= min ? colors.muted : colors.accent }]}>－</Text>
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
          style={[styles.stepButton, { backgroundColor: value >= max ? colors.disabledSurface : colors.pms }]}
        >
          <Text style={[styles.stepText, { color: value >= max ? colors.muted : colors.accent }]}>＋</Text>
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
  level: keyof RiskKeywords;
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
            style={[styles.chip, { backgroundColor: colors.roseSoft }]}
          >
            <Text style={[styles.chipText, { color: colors.text }]}>{word} ×</Text>
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
          <Text style={[styles.addLabel, { color: colors.accent }]}>追加</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '700', marginTop: 8 },
  help: { fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowLabel: { fontSize: 15, flexShrink: 1 },
  remove: { fontSize: 14, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepButton: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 20, fontWeight: '700' },
  stepValue: { fontSize: 15, minWidth: 48, textAlign: 'center' },
  keywordBlock: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 13 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  addLabel: { fontSize: 15, fontWeight: '600' },
  confirm: { gap: 8 },
});
