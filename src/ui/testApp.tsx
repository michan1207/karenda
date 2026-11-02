// App の画面テストで共通に使う偽物・データ・setup。各テストファイルは、これをいちばん先に読み込む
// （中の jest.mock を、アプリのコードより先に効かせるため）
import { act, render } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  addPeriodStart,
  Authenticator,
  BackupFiles,
  CalendarSource,
  Database,
  migrate,
  Notifier,
  setLockEnabled,
  setOnboarded,
} from '../data';
import { createTestDatabase } from '../data/testDatabase';
import { type CalendarEvent, type NotificationPlan } from '../engine';
import { Main } from './App';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('expo-calendar/legacy', () => ({}));
jest.mock('expo-store-review', () => ({}));
jest.mock('expo-file-system', () => ({}));
jest.mock('expo-sharing', () => ({}));
jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-local-authentication', () => ({}));
// 時刻を回して選ぶ部品の代わりに、「14:00」と打てる欄にする
jest.mock('@react-native-community/datetimepicker', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { TextInput } = jest.requireActual<typeof import('react-native')>('react-native');
  // 日付は「2026-10-05」、時刻は「14:00」と打つ
  const Picker = ({
    accessibilityLabel,
    mode,
    onChange,
  }: {
    accessibilityLabel: string;
    mode: 'date' | 'time';
    onChange: (event: unknown, date?: Date) => void;
  }) =>
    createElement(TextInput, {
      accessibilityLabel,
      onChangeText: (text: string) => {
        const [a, b, c] = text.split(/[-:]/).map(Number);
        onChange({}, mode === 'date' ? new Date(a, b - 1, c) : new Date(2000, 0, 1, a, b));
      },
    });
  return { __esModule: true, default: Picker, DateTimePickerAndroid: { open: jest.fn() } };
});
jest.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => new Uint8Array(jest.requireActual('node:crypto').randomBytes(n)) }));
// 最初の1件は画面全体の読み込みを含むため、遅いPCでは既定の5秒を超える
jest.setTimeout(20_000);

// 次の生理は 10-26（ヘビー期 10-26〜28）、PMS期 10-19〜25。今日は 10-24
export const REGULAR = ['2026-07-06', '2026-08-03', '2026-08-31', '2026-09-28'];
export const EVENTS: CalendarEvent[] = [
  { id: 'trip', title: '福岡出張', start: '2026-10-27', end: '2026-10-27', allDay: false },
  { id: 'shop', title: '買い物', start: '2026-10-27', end: '2026-10-27', allDay: false },
  { id: 'talk', title: '企画プレゼン', start: '2026-11-20', end: '2026-11-20', allDay: false },
];

export function fakeCalendar(granted: boolean, events: CalendarEvent[] = EVENTS) {
  return {
    requestAccess: jest.fn(async () => granted),
    hasAccess: jest.fn(async () => granted),
    getEvents: jest.fn(async (from: string, until: string) =>
      events.filter((event) => event.end >= from && event.start <= until),
    ),
  } satisfies CalendarSource;
}

/** exact は Android の「アラームとリマインダー」。iPhone は null */
export function fakeNotifier(granted = true, exact: boolean | null = null) {
  return {
    requestAccess: jest.fn(async () => granted),
    hasAccess: jest.fn(async () => granted),
    exactAlarm: jest.fn(async () => exact),
    openExactAlarm: jest.fn(async () => {}),
    replaceAll: jest.fn(async (_plans: NotificationPlan[]) => {}),
    onReviewAnswer: jest.fn((_handler: Parameters<Notifier['onReviewAnswer']>[0]) => () => {}),
    onDecision: jest.fn((_handler: Parameters<Notifier['onDecision']>[0]) => () => {}),
  } satisfies Notifier;
}

/** アプリの状態が変わった時の動き。AppState は jest の偽物なので、外されていない受け取り口を直接呼ぶ */
export async function sendAppState(state: 'active' | 'background') {
  const { calls, results } = jest.mocked(AppState.addEventListener).mock;
  const handlers = calls.filter((_, i) => !results[i].value.remove.mock.calls.length).map(([, handler]) => handler);
  await act(async () => {
    for (const handler of handlers) await handler(state);
  });
}

/** ホームから戻った時の動き */
export const returnToApp = () => sendAppState('active');

/** 本人確認の偽物。results の順に成功・失敗を返し、使い切ったら成功 */
export function fakeAuthenticator(available = true, results: boolean[] = []) {
  return {
    isAvailable: jest.fn(async () => available),
    authenticate: jest.fn(async () => results.shift() ?? true),
  } satisfies Authenticator;
}

export function fakeFiles(picked: string | null = null) {
  return {
    share: jest.fn(async (_text: string, _name: string) => {}),
    pick: jest.fn(async () => picked),
  } satisfies BackupFiles;
}

export const lastPlanDates = (notifier: ReturnType<typeof fakeNotifier>) =>
  notifier.replaceAll.mock.calls
    .at(-1)?.[0]
    .filter((plan) => !plan.review)
    .map((plan) => plan.date);

export const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

export async function setup({
  starts = REGULAR,
  onboarded = true,
  calendar = fakeCalendar(true),
  notifier = fakeNotifier(),
  askReview = jest.fn(async () => {}),
  today = () => '2026-10-24',
  files = fakeFiles(),
  authenticator = fakeAuthenticator(),
  lock = false,
  prepare,
}: {
  starts?: string[];
  onboarded?: boolean;
  calendar?: ReturnType<typeof fakeCalendar>;
  notifier?: ReturnType<typeof fakeNotifier>;
  askReview?: jest.Mock;
  today?: () => string;
  files?: ReturnType<typeof fakeFiles>;
  authenticator?: ReturnType<typeof fakeAuthenticator>;
  lock?: boolean;
  prepare?: (db: Database) => Promise<void>;
} = {}) {
  const db: Database = createTestDatabase();
  await migrate(db);
  if (onboarded) await setOnboarded(db);
  for (const start of starts) await addPeriodStart(db, start);
  if (lock) await setLockEnabled(db, true);
  await prepare?.(db);
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <Main
        loadDatabase={async () => db}
        calendar={calendar}
        notifier={notifier}
        askReview={askReview}
        today={today}
        files={files}
        authenticator={authenticator}
      />
    </SafeAreaProvider>,
  );
  return { db, calendar, notifier, askReview, files, authenticator };
}
