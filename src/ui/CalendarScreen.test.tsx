import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { addPeriodStart, CalendarSource, migrate } from '../data';
import { createTestDatabase } from '../data/testDatabase';
import type { CalendarEvent } from '../engine';
import CalendarScreen from './CalendarScreen';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('expo-calendar/legacy', () => ({}));

// 次の生理は 10-26（ヘビー期 10-26〜28）、PMS期 10-19〜25
const REGULAR = ['2026-07-06', '2026-08-03', '2026-08-31', '2026-09-28'];
const EVENTS: CalendarEvent[] = [
  { id: 'trip', title: '福岡出張', start: '2026-10-27', end: '2026-10-27', allDay: false },
  { id: 'shop', title: '買い物', start: '2026-10-27', end: '2026-10-27', allDay: false },
];

function fakeCalendar(granted: boolean, events: CalendarEvent[] = EVENTS): CalendarSource & { getEvents: jest.Mock } {
  return {
    requestAccess: async () => granted,
    getEvents: jest.fn(async (from: string, until: string) =>
      events.filter((event) => event.end >= from && event.start <= until),
    ),
  };
}

async function setup({ starts = REGULAR, calendar = fakeCalendar(true) } = {}) {
  const db = createTestDatabase();
  await migrate(db);
  for (const start of starts) await addPeriodStart(db, start);
  await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <CalendarScreen loadDatabase={async () => db} calendar={calendar} today={() => '2026-10-24'} />
    </SafeAreaProvider>,
  );
  return { db, calendar };
}

it('colors the zones and marks days where events clash', async () => {
  const { calendar } = await setup();
  expect(screen.getByText('2026年10月')).toBeTruthy();
  expect(await screen.findByLabelText('10月27日（火）、生理2日目（予測）、予定と重なっています')).toBeTruthy();
  expect(screen.getByLabelText('10月20日（火）、PMS警戒期（予測）')).toBeTruthy();
  expect(screen.getByLabelText('10月5日（月）')).toBeTruthy();
  expect(calendar.getEvents).toHaveBeenCalledWith('2026-09-28', '2026-11-01');
});

it('shows the events and advice for a tapped day', async () => {
  await setup();
  await fireEvent.press(await screen.findByLabelText('10月27日（火）、生理2日目（予測）、予定と重なっています'));
  expect(screen.getByText('10月27日（火）')).toBeTruthy();
  expect(screen.getByText('⚠ 福岡出張')).toBeTruthy();
  expect(screen.getByText(/生理2日目と重なる見込みです/)).toBeTruthy();
  expect(screen.getByText('買い物')).toBeTruthy();
});

it('explains a denied calendar and links to Settings, still showing zones', async () => {
  const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  const calendar = fakeCalendar(false);
  await setup({ calendar });
  expect(await screen.findByText(/カレンダーへのアクセスが許可されていない/)).toBeTruthy();
  await fireEvent.press(screen.getByText('設定アプリで許可する'));
  expect(openSettings).toHaveBeenCalled();
  expect(calendar.getEvents).not.toHaveBeenCalled();
  expect(await screen.findByLabelText('10月26日（月）、生理1日目（予測）')).toBeTruthy();
});

it('moves between months and loads that month', async () => {
  const { calendar } = await setup();
  await fireEvent.press(screen.getByLabelText('次の月'));
  expect(screen.getByText('2026年11月')).toBeTruthy();
  expect(calendar.getEvents).toHaveBeenLastCalledWith('2026-10-26', '2026-12-06');
});

it('invites the first record and marks a provisional prediction', async () => {
  await setup({ starts: [] });
  expect(await screen.findByText(/生理が始まった日を記録すると/)).toBeTruthy();
  await fireEvent.press(screen.getByText('今日を生理開始日として記録'));
  expect(await screen.findByText(/28日周期を仮定した仮の予測/)).toBeTruthy();
  expect(screen.getByLabelText('10月24日（土）、生理1日目')).toBeTruthy();
});
