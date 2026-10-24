import { fireEvent, render, screen } from '@testing-library/react-native';

import { addPeriodStart, migrate } from '../data';
import { createTestDatabase } from '../data/testDatabase';
import HomeScreen from './HomeScreen';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));

async function setup(starts: string[] = []) {
  const db = createTestDatabase();
  await migrate(db);
  for (const start of starts) await addPeriodStart(db, start);
  await render(<HomeScreen loadDatabase={async () => db} today={() => '2026-10-24'} />);
  return db;
}

it('shows saved records and the on-device promise', async () => {
  await setup(['2026-09-01', '2026-09-29']);
  expect(await screen.findByText('生理の記録：2件')).toBeTruthy();
  expect(screen.getByText('最後の開始日：2026-09-29')).toBeTruthy();
  expect(screen.getByText('データはこのiPhoneの中だけで扱います')).toBeTruthy();
});

it('records today as a period start', async () => {
  await setup();
  expect(await screen.findByText('まだ記録がありません')).toBeTruthy();
  await fireEvent.press(screen.getByText('今日を生理開始日として記録'));
  expect(await screen.findByText('生理の記録：1件')).toBeTruthy();
  expect(screen.getByText('最後の開始日：2026-10-24')).toBeTruthy();
});

it('explains when the data cannot be loaded', async () => {
  await render(<HomeScreen loadDatabase={() => Promise.reject(new Error('no'))} />);
  expect(await screen.findByText('データを読み込めませんでした。アプリを開き直してください。')).toBeTruthy();
});
