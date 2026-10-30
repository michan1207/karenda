import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import {
  Authenticator,
  BackupFiles,
  CalendarSource,
  Database,
  deviceAuthenticator,
  deviceBackupFiles,
  deviceCalendar,
  deviceNotifier,
  deviceReview,
  Notifier,
  openKarendaDatabase,
  ReviewPrompt,
} from '../data';
import { ConflictAlert, DateKey, pendingReviews, statusOf, toDateKey } from '../engine';
import AlertsScreen from './AlertsScreen';
import CalendarScreen from './CalendarScreen';
import LockScreen from './LockScreen';
import { Heart, Notice, Text } from './components';
import OnboardingScreen from './OnboardingScreen';
import SettingsScreen from './SettingsScreen';
import { fonts, radius, useColors } from './theme';
import { useKarenda } from './useKarenda';
import { useNotificationSync } from './useNotificationSync';
import { useReviewTargets } from './useReviewTargets';
import { useUpcomingAlerts } from './useUpcomingAlerts';

type Tab = 'calendar' | 'alerts' | 'settings';

type Props = {
  loadDatabase?: () => Promise<Database>;
  calendar?: CalendarSource;
  notifier?: Notifier;
  askReview?: ReviewPrompt;
  today?: () => DateKey;
  files?: BackupFiles;
  authenticator?: Authenticator;
};

const currentDay = () => toDateKey(new Date());

export default function App(props: Props) {
  // 同梱の丸ゴシックを読む。読めなかった時は端末の標準フォントのまま進める
  const [fontsLoaded, fontError] = useFonts({
    [fonts.regular]: require('../../assets/fonts/ZenMaruGothic-Regular.ttf'),
    [fonts.bold]: require('../../assets/fonts/ZenMaruGothic-Bold.ttf'),
  });
  return <SafeAreaProvider>{(fontsLoaded || fontError) && <Main {...props} />}</SafeAreaProvider>;
}

export function Main({
  loadDatabase = openKarendaDatabase,
  calendar = deviceCalendar,
  notifier = deviceNotifier,
  askReview = deviceReview,
  today = currentDay,
  files = deviceBackupFiles,
  authenticator = deviceAuthenticator,
}: Props) {
  const colors = useColors();
  const k = useKarenda({ loadDatabase, calendar, notifier, askReview, files, authenticator });
  const [tab, setTab] = useState<Tab>('calendar');
  const [day, setDay] = useState(today);
  // 開いたまま日をまたいで戻った時に「今日」を進める（iPhone はアプリを何日もメモリに残す）
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setDay(today());
    });
    return () => subscription.remove();
  }, [today]);
  const stateOf = (alert: ConflictAlert) => statusOf(k.statuses, alert.eventId, alert.date).state;
  // 対応済みは一覧から外す。確認済みは一覧に残し、通知とタブの数は未確認のものだけにする
  const upcoming = useUpcomingAlerts(k, day).filter((alert) => stateOf(alert) !== 'resolved');
  const unreviewed = upcoming.filter((alert) => stateOf(alert) === 'unreviewed');
  const reviewTargets = useReviewTargets(k, day);
  useNotificationSync(k, unreviewed, reviewTargets, day);

  let body;
  if (k.status === 'loading') {
    body = <ActivityIndicator style={styles.center} color={colors.accent} />;
  } else if (k.status === 'error') {
    body = (
      <View style={styles.padded}>
        <Notice colors={colors} text="データを読み込めませんでした。アプリを開き直してください。" />
      </View>
    );
  } else if (k.locked) {
    body = <LockScreen onUnlock={k.unlock} />;
  } else if (!k.onboarded) {
    body = <OnboardingScreen onDone={k.finishOnboarding} />;
  } else {
    body = (
      <>
        <View style={styles.flex}>
          {tab === 'calendar' && (
            <CalendarScreen
              k={k}
              today={day}
              reviews={pendingReviews(reviewTargets, k.reviewed, day)}
              openAlerts={() => setTab('alerts')}
            />
          )}
          {tab === 'alerts' && <AlertsScreen k={k} today={day} alerts={upcoming} />}
          {tab === 'settings' && <SettingsScreen k={k} today={day} />}
        </View>
        <View accessibilityRole="tablist" style={[styles.tabs, { backgroundColor: colors.surface, boxShadow: colors.shadow }]}>
          <TabButton label="カレンダー" active={tab === 'calendar'} onPress={() => setTab('calendar')} />
          <TabButton
            label={unreviewed.length ? `お知らせ（${unreviewed.length}）` : 'お知らせ'}
            active={tab === 'alerts'}
            onPress={() => setTab('alerts')}
          />
          <TabButton label="設定" active={tab === 'settings'} onPress={() => setTab('settings')} />
        </View>
      </>
    );
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background, backgroundImage: colors.backdrop }]}>
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
      <View style={[styles.tabPill, active && { backgroundColor: colors.pinkSoft }]}>
        {active && <Heart color={colors.heart} />}
        <Text
          maxFontSizeMultiplier={1.6}
          style={[styles.tabLabel, { color: active ? colors.pinkText : colors.muted }, active && styles.tabActive]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1 },
  padded: { padding: 16 },
  tabs: { flexDirection: 'row', paddingVertical: 8, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  tabPill: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  tabLabel: { fontSize: 14, flexShrink: 1 },
  tabActive: { fontWeight: '700' },
});
