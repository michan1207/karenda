import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import {
  CalendarSource,
  Database,
  deviceCalendar,
  deviceNotifier,
  isDismissed,
  Notifier,
  openKarendaDatabase,
} from '../data';
import { DateKey, toDateKey } from '../engine';
import AlertsScreen from './AlertsScreen';
import CalendarScreen from './CalendarScreen';
import { Notice } from './components';
import OnboardingScreen from './OnboardingScreen';
import SettingsScreen from './SettingsScreen';
import { useColors } from './theme';
import { useKarenda } from './useKarenda';
import { useNotificationSync } from './useNotificationSync';
import { useUpcomingAlerts } from './useUpcomingAlerts';

type Tab = 'calendar' | 'alerts' | 'settings';

type Props = {
  loadDatabase?: () => Promise<Database>;
  calendar?: CalendarSource;
  notifier?: Notifier;
  today?: () => DateKey;
};

const currentDay = () => toDateKey(new Date());

export default function App(props: Props) {
  return (
    <SafeAreaProvider>
      <Main {...props} />
    </SafeAreaProvider>
  );
}

export function Main({
  loadDatabase = openKarendaDatabase,
  calendar = deviceCalendar,
  notifier = deviceNotifier,
  today = currentDay,
}: Props) {
  const colors = useColors();
  const k = useKarenda({ loadDatabase, calendar, notifier });
  const [tab, setTab] = useState<Tab>('calendar');
  const [day] = useState(today);
  const upcoming = useUpcomingAlerts(k, day).filter((alert) => !isDismissed(k.dismissed, alert.eventId, alert.date));
  useNotificationSync(k, upcoming, day);

  let body;
  if (k.status === 'loading') {
    body = <ActivityIndicator style={styles.center} color={colors.accent} />;
  } else if (k.status === 'error') {
    body = (
      <View style={styles.padded}>
        <Notice colors={colors} text="データを読み込めませんでした。アプリを開き直してください。" />
      </View>
    );
  } else if (!k.onboarded) {
    body = <OnboardingScreen onDone={k.finishOnboarding} />;
  } else {
    body = (
      <>
        <View style={styles.flex}>
          {tab === 'calendar' && <CalendarScreen k={k} today={day} />}
          {tab === 'alerts' && <AlertsScreen k={k} today={day} alerts={upcoming} />}
          {tab === 'settings' && <SettingsScreen k={k} />}
        </View>
        <View accessibilityRole="tablist" style={[styles.tabs, { borderColor: colors.line, backgroundColor: colors.surface }]}>
          <TabButton label="カレンダー" active={tab === 'calendar'} onPress={() => setTab('calendar')} />
          <TabButton
            label={upcoming.length ? `お知らせ（${upcoming.length}）` : 'お知らせ'}
            active={tab === 'alerts'}
            onPress={() => setTab('alerts')}
          />
          <TabButton label="設定" active={tab === 'settings'} onPress={() => setTab('settings')} />
        </View>
      </>
    );
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]}>
      {body}
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={styles.tab}
    >
      <Text
        maxFontSizeMultiplier={1.6}
        style={[styles.tabLabel, { color: active ? colors.accent : colors.muted }, active && styles.tabActive]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1 },
  padded: { padding: 16 },
  tabs: { flexDirection: 'row', borderTopWidth: 1 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabLabel: { fontSize: 14 },
  tabActive: { fontWeight: '700' },
});
