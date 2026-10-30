import { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { ExportedData, isEncryptedBackup, OpenBackup, openBackup, readExport, RestoreMode } from '../data';
import { DateKey } from '../engine';
import { Button, Text } from './components';
import { fullDate } from './format';
import { Colors, fonts, radius, useColors } from './theme';
import type { Karenda } from './useKarenda';

const MIN_LENGTH = 8;

const REASONS: Record<Exclude<OpenBackup, { ok: true }>['reason'], string> = {
  broken: 'ファイルが壊れているため、読み込めませんでした。',
  notCocomia: 'Cocomia のバックアップではないようです。',
  notEncrypted: 'ファイルが壊れているため、読み込めませんでした。',
  newer: '新しいバージョンの Cocomia で作られたファイルです。アプリを新しくしてから読み込んでください。',
  wrongPassphrase: 'パスワードが違うか、ファイルが壊れています。',
};

type Step = 'idle' | 'export' | 'unlock' | 'preview';

/** パスワードで鍵をかけたバックアップの書き出しと、ファイルからの戻し */
export default function BackupPanel({ k, today }: { k: Karenda; today: DateKey }) {
  const colors = useColors();
  const [step, setStep] = useState<Step>('idle');
  const [passphrase, setPassphrase] = useState('');
  const [again, setAgain] = useState('');
  const [fileText, setFileText] = useState('');
  const [data, setData] = useState<ExportedData | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const reset = (next: typeof message = null) => {
    setStep('idle');
    setPassphrase('');
    setAgain('');
    setFileText('');
    setData(null);
    setMessage(next);
  };

  const length = Array.from(passphrase).length;
  const problem =
    passphrase && length < MIN_LENGTH ? '8文字以上にしてください' : again && again !== passphrase ? '2回目が1回目と違います' : null;
  const canExport = length >= MIN_LENGTH && again === passphrase;

  const exportNow = async () => {
    if (!canExport || busy) return;
    setBusy(true);
    try {
      await k.exportBackup(passphrase, today);
      reset({ text: 'バックアップを作りました。保存した場所とパスワードは、なくさないようにしてください。' });
    } catch {
      setMessage({ text: '書き出せませんでした。もう一度お試しください。', error: true });
    } finally {
      setBusy(false);
    }
  };

  const showPreview = (read: ReturnType<typeof readExport>) => {
    if (!read.ok) return setMessage({ text: REASONS[read.reason], error: true });
    setData(read.data);
    setPassphrase('');
    setMessage(null);
    setStep('preview');
  };

  const pick = async () => {
    reset();
    let text: string | null;
    try {
      text = await k.pickBackup();
    } catch (error) {
      if (__DEV__) console.warn('[backup] ファイルを読めない', error);
      return setMessage({ text: 'ファイルを読み込めませんでした。もう一度お試しください。', error: true });
    }
    if (text === null) return;
    // 鍵のかかっていない古い書き出しは、パスワードを聞かずに読む
    if (!isEncryptedBackup(text)) return showPreview(readExport(text));
    setFileText(text);
    setStep('unlock');
  };

  const unlock = async () => {
    if (!passphrase || busy) return;
    setBusy(true);
    const started = Date.now();
    const opened = await openBackup(fileText, passphrase);
    if (__DEV__) console.log(`[backup] 復号 ${Date.now() - started}ms`);
    setBusy(false);
    if (!opened.ok) return setMessage({ text: REASONS[opened.reason], error: true });
    showPreview(readExport(opened.text));
  };

  const restore = async (mode: RestoreMode) => {
    if (!data || busy) return;
    setBusy(true);
    try {
      await k.restoreBackup(data, mode);
      reset({ text: `戻しました（記録 ${data.periodStarts.length}件）。` });
    } catch {
      setMessage({ text: '戻せませんでした。今の記録は変わっていません。', error: true });
    } finally {
      setBusy(false);
    }
  };

  const starts = data ? [...data.periodStarts].sort() : [];
  const summary = `記録 ${starts.length}件${starts.length ? `（${fullDate(starts[0])}〜${fullDate(starts[starts.length - 1])}）` : ''}`;

  return (
    <View style={styles.panel}>
      <Text style={[styles.help, { color: colors.muted }]}>
        記録と設定を、パスワードで鍵をかけたファイルにします。機種変更やアプリを入れ直したときに戻せます。パスワードを忘れると戻せません。
      </Text>

      {step === 'idle' && (
        <>
          <Button colors={colors} kind="secondary" label="暗号化して書き出す" onPress={() => (reset(), setStep('export'))} />
          <Button colors={colors} kind="secondary" label="ファイルから戻す" onPress={pick} />
        </>
      )}

      {step === 'export' && (
        <>
          <Passphrase colors={colors} label="パスワード" value={passphrase} onChange={setPassphrase} isNew />
          <Passphrase colors={colors} label="パスワード（もう一度）" value={again} onChange={setAgain} isNew />
          <Text style={[styles.help, { color: problem ? colors.danger : colors.muted }]}>
            {problem ?? (length >= 12 ? '強さ：強い' : length >= MIN_LENGTH ? '強さ：ふつう（12文字以上でもっと強くなります）' : '8文字以上で決めてください')}
          </Text>
          {busy && <Busy colors={colors} text="鍵をかけています。少し時間がかかります…" />}
          <Button colors={colors} label="書き出す" onPress={exportNow} disabled={!canExport || busy} />
          <Button colors={colors} kind="secondary" label="やめる" onPress={() => reset()} />
        </>
      )}

      {step === 'unlock' && (
        <>
          <Passphrase colors={colors} label="バックアップのパスワード" value={passphrase} onChange={setPassphrase} onSubmit={unlock} />
          {busy && <Busy colors={colors} text="鍵を開けています。少し時間がかかります…" />}
          <Button colors={colors} label="開く" onPress={unlock} disabled={!passphrase || busy} />
          <Button colors={colors} kind="secondary" label="やめる" onPress={() => reset()} />
        </>
      )}

      {step === 'preview' && (
        <>
          <Text style={[styles.summary, { color: colors.text }]}>{summary}</Text>
          <Text style={[styles.help, { color: colors.muted }]}>戻し方を選んでください。</Text>
          <Button colors={colors} label="記録を足す（設定は今のまま）" onPress={() => restore('keepMine')} disabled={busy} />
          <Button colors={colors} kind="secondary" label="記録を足す（設定はファイルのもの）" onPress={() => restore('preferFile')} disabled={busy} />
          <Text style={[styles.help, { color: colors.muted }]}>置き換えると、今の記録は消えてファイルの内容だけになります。</Text>
          <Button colors={colors} kind="danger" label="ファイルの内容に置き換える" onPress={() => restore('replace')} disabled={busy} />
          <Button colors={colors} kind="secondary" label="やめる" onPress={() => reset()} />
        </>
      )}

      {message && <Text style={[styles.help, { color: message.error ? colors.danger : colors.text }]}>{message.text}</Text>}
    </View>
  );
}

function Busy({ colors, text }: { colors: Colors; text: string }) {
  return (
    <View style={styles.busy}>
      <ActivityIndicator color={colors.accent} />
      <Text style={[styles.help, { color: colors.text }]}>{text}</Text>
    </View>
  );
}

function Passphrase({
  colors,
  label,
  value,
  onChange,
  onSubmit,
  isNew = false,
}: {
  colors: Colors;
  label: string;
  value: string;
  onChange: (text: string) => void;
  onSubmit?: () => void;
  isNew?: boolean;
}) {
  return (
    <TextInput
      accessibilityLabel={label}
      placeholder={label}
      placeholderTextColor={colors.muted}
      value={value}
      onChangeText={onChange}
      onSubmitEditing={onSubmit}
      secureTextEntry
      autoCapitalize="none"
      autoCorrect={false}
      textContentType={isNew ? 'newPassword' : 'password'}
      style={[styles.input, { color: colors.text, borderColor: colors.line, backgroundColor: colors.background }]}
    />
  );
}

const styles = StyleSheet.create({
  panel: { gap: 8 },
  help: { fontSize: 13, lineHeight: 19 },
  summary: { fontSize: 15, fontWeight: '600' },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: fonts.regular,
  },
});
