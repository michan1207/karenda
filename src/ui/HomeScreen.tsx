import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';

const palette = {
  light: { background: '#f7f6f9', text: '#26222e', muted: '#6c6577', accent: '#7a4f9a' },
  dark: { background: '#17141c', text: '#ece8f1', muted: '#a59db0', accent: '#c9a3e8' },
};

export default function HomeScreen() {
  const colors = palette[useColorScheme() === 'dark' ? 'dark' : 'light'];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.accent }]}>karenda</Text>
      <Text style={[styles.body, { color: colors.text }]}>こんにちは</Text>
      <Text style={[styles.note, { color: colors.muted }]}>
        データはこのiPhoneの中だけで扱います
      </Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  title: { fontSize: 32, fontWeight: '700' },
  body: { fontSize: 20 },
  note: { fontSize: 14, textAlign: 'center' },
});
