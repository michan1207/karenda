import { StyleSheet, View } from 'react-native';

import { BIOMETRIC, Button, PASSCODE, Text } from './components';
import { useColors } from './theme';

/** ロック中の画面。何の記録かが分からないよう、アプリの中身は何も出さない */
export default function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const colors = useColors();
  return (
    <View style={styles.center}>
      <Text style={[styles.title, { color: colors.text }]}>ロックしています</Text>
      <Text style={[styles.help, { color: colors.muted }]}>{BIOMETRIC}（または{PASSCODE}）で開けます。</Text>
      <Button colors={colors} label="ロックを解除" onPress={onUnlock} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  help: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
