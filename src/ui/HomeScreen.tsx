import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { DateKey, toDateKey } from '../engine/date';
import { addPeriodStart, Database, listPeriodStarts, openKarendaDatabase } from '../data';

const palette = {
  light: { background: '#f7f6f9', text: '#26222e', muted: '#6c6577', accent: '#7a4f9a', onAccent: '#ffffff' },
  dark: { background: '#17141c', text: '#ece8f1', muted: '#a59db0', accent: '#c9a3e8', onAccent: '#17141c' },
};

type Props = {
  loadDatabase?: () => Promise<Database>;
  today?: () => DateKey;
};

// フェーズ3の確認用の最小画面。記録画面はフェーズ5で作り直す
export default function HomeScreen({ loadDatabase = openKarendaDatabase, today = () => toDateKey(new Date()) }: Props) {
  const colors = palette[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const [db, setDb] = useState<Database | null>(null);
  const [starts, setStarts] = useState<DateKey[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadDatabase()
      .then(async (opened) => {
        const loaded = await listPeriodStarts(opened);
        if (!active) return;
        setDb(opened);
        setStarts(loaded);
      })
      .catch(() => active && setError('データを読み込めませんでした。アプリを開き直してください。'));
    return () => {
      active = false;
    };
  }, [loadDatabase]);

  const recordToday = useCallback(async () => {
    if (!db) return;
    await addPeriodStart(db, today());
    setStarts(await listPeriodStarts(db));
  }, [db, today]);

  const last = starts[starts.length - 1];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.accent }]}>karenda</Text>
      {error ? (
        <Text style={[styles.body, { color: colors.text }]}>{error}</Text>
      ) : (
        <>
          <Text style={[styles.body, { color: colors.text }]}>生理の記録：{starts.length}件</Text>
          <Text style={[styles.note, { color: colors.muted }]}>
            {last ? `最後の開始日：${last}` : 'まだ記録がありません'}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={!db}
            onPress={recordToday}
            style={({ pressed }) => [styles.button, { backgroundColor: colors.accent, opacity: !db || pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.buttonLabel, { color: colors.onAccent }]}>今日を生理開始日として記録</Text>
          </Pressable>
        </>
      )}
      <Text style={[styles.note, { color: colors.muted }]}>データはこのiPhoneの中だけで扱います</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  title: { fontSize: 32, fontWeight: '700' },
  body: { fontSize: 20, textAlign: 'center' },
  note: { fontSize: 14, textAlign: 'center' },
  button: { marginTop: 8, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 999 },
  buttonLabel: { fontSize: 16, fontWeight: '600' },
});
