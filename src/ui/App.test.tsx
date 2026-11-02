import { METRICS, EVENTS, fakeCalendar, fakeNotifier, sendAppState, returnToApp, fakeAuthenticator, setup } from './testApp';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  isLockEnabled,
  isMetricsEnabled,
  listMetricEvents,
  listPeriodStarts,
  loadState,
  setCalendarSkipped,
} from '../data';
import { type CalendarEvent } from '../engine';
import { Main } from './App';

describe('first run', () => {
  it('shows one step at a time, has a start recorded, and asks for the calendar only at the end', async () => {
    const { calendar, notifier, db } = await setup({ onboarded: false, starts: [] });
    expect(await screen.findByText('生理と大事な予定がぶつかる前に、教えます')).toBeTruthy();
    await fireEvent.press(screen.getByText('はじめる'));
    expect(screen.getByText('通信を切っても、そのまま使えます')).toBeTruthy();
    expect(screen.getByText('0件')).toBeTruthy();
    await fireEvent.press(screen.getByText('次へ'));

    await fireEvent.changeText(screen.getByLabelText('生理が始まった日'), '2026-10-05');
    expect(screen.getByText('選んだ日：10月5日（月）')).toBeTruthy();
    await fireEvent.press(screen.getByText('この日を記録する'));
    expect(await screen.findByText('次の生理は10/31〜11/4ごろ（確信度：低）')).toBeTruthy();
    expect(screen.getByText('予測は目安で、医療や避妊の目的には使えません。体調の判断は医師にご相談ください。')).toBeTruthy();
    expect(await listPeriodStarts(db)).toEqual(['2026-10-05']);
    expect(calendar.requestAccess).not.toHaveBeenCalled();
    expect(notifier.requestAccess).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('次へ'));
    expect(screen.getByText('今はしない')).toBeTruthy();
    await fireEvent.press(screen.getByText('カレンダーを使う'));
    expect(await screen.findByText('2026年10月')).toBeTruthy();
    expect(calendar.requestAccess).toHaveBeenCalled();
    expect(notifier.requestAccess).toHaveBeenCalled();
  });

  it('finishes without the calendar, and lets the user turn it on later in settings', async () => {
    const { calendar, notifier, db } = await setup({ onboarded: false, starts: [] });
    await fireEvent.press(await screen.findByText('はじめる'));
    await fireEvent.press(screen.getByText('次へ'));
    await fireEvent.press(screen.getByText('まだ記録しない'));
    expect(screen.getByText('記録すると、次の生理の予測がここに出ます。')).toBeTruthy();
    await fireEvent.press(screen.getByText('次へ'));
    await fireEvent.press(screen.getByText('今はしない'));

    expect(await screen.findByText(/カレンダーは使っていません。日付を選んで/)).toBeTruthy();
    expect(calendar.requestAccess).not.toHaveBeenCalled();
    expect(notifier.requestAccess).toHaveBeenCalled();
    expect((await loadState(db)).calendarSkipped).toBe(true);

    await fireEvent.press(screen.getByText('設定'));
    await fireEvent.press(screen.getByText('カレンダーを使う'));
    await waitFor(() => expect(calendar.requestAccess).toHaveBeenCalled());
    expect(await screen.findByText(/カレンダーの予定を読んで/)).toBeTruthy();
    expect((await loadState(db)).calendarSkipped).toBe(false);
  });

  it('does not ask for the calendar each time the app opens after "今はしない"', async () => {
    const calendar = fakeCalendar(false);
    await setup({ calendar, prepare: (db) => setCalendarSkipped(db, true) });
    expect(await screen.findByText(/カレンダーは使っていません。日付を選んで/)).toBeTruthy();
    expect(calendar.requestAccess).not.toHaveBeenCalled();
    expect(calendar.hasAccess).toHaveBeenCalled();
  });

  it('offers the calendar on the alerts tab too after "今はしない", not the Settings app', async () => {
    const calendar = fakeCalendar(false);
    await setup({ calendar, prepare: (db) => setCalendarSkipped(db, true) });
    await fireEvent.press(await screen.findByText('お知らせ'));
    expect(screen.queryByText('設定アプリで許可する')).toBeNull();
    await fireEvent.press(screen.getByText('カレンダーを使う'));
    await waitFor(() => expect(calendar.requestAccess).toHaveBeenCalled());
  });
});

describe('usage records', () => {
  it('counts a recorded period start on this phone', async () => {
    const { db } = await setup({ starts: [] });
    await fireEvent.press(await screen.findByLabelText(/^10月20日（火）/));
    await fireEvent.press(screen.getByText('この日を生理開始日として記録'));
    await waitFor(async () => expect((await listMetricEvents(db)).map((e) => e.name)).toContain('period_recorded'));
  });

  it('can be turned off in settings', async () => {
    const { db } = await setup();
    await fireEvent.press(await screen.findByText('設定'));
    await fireEvent(screen.getByLabelText('利用状況をこの端末に記録する'), 'valueChange', false);
    await waitFor(async () => expect(await isMetricsEnabled(db)).toBe(false));
  });
});

describe('app lock', () => {
  it('asks for Face ID when opened with the lock on, and shows nothing until it succeeds', async () => {
    const authenticator = fakeAuthenticator(true, [false, true]);
    await setup({ lock: true, authenticator });
    expect(await screen.findByText('ロックしています')).toBeTruthy();
    expect(screen.queryByText('2026年10月')).toBeNull();
    expect(authenticator.authenticate).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('ロックを解除'));
    expect(await screen.findByText('2026年10月')).toBeTruthy();
  });

  it('locks again when the app goes to the background, and asks when it comes back', async () => {
    const authenticator = fakeAuthenticator(true, [true, false]);
    await setup({ lock: true, authenticator });
    expect(await screen.findByText('2026年10月')).toBeTruthy();
    await sendAppState('background');
    expect(await screen.findByText('ロックしています')).toBeTruthy();
    await sendAppState('active');
    expect(authenticator.authenticate).toHaveBeenCalledTimes(2);
    expect(screen.getByText('ロックしています')).toBeTruthy();
  });

  it('lets you in when the iPhone no longer has a passcode, rather than locking you out', async () => {
    const authenticator = fakeAuthenticator(false);
    await setup({ lock: true, authenticator });
    expect(await screen.findByText('2026年10月')).toBeTruthy();
    expect(authenticator.authenticate).not.toHaveBeenCalled();
  });

  it('turns the lock on only after Face ID succeeds, and can turn it off', async () => {
    const authenticator = fakeAuthenticator(true, [false, true]);
    const { db } = await setup({ authenticator });
    await fireEvent.press(await screen.findByText('設定'));
    await fireEvent(screen.getByLabelText('Face IDでロックする'), 'valueChange', true);
    expect(await screen.findByText('Face IDで確かめられなかったため、ロックはオンにしていません。')).toBeTruthy();
    expect(await isLockEnabled(db)).toBe(false);
    await fireEvent(screen.getByLabelText('Face IDでロックする'), 'valueChange', true);
    await waitFor(async () => expect(await isLockEnabled(db)).toBe(true));
    // オンにした直後は、自分で開いているのでロックしない
    expect(screen.queryByText('ロックしています')).toBeNull();
    await fireEvent(screen.getByLabelText('Face IDでロックする'), 'valueChange', false);
    await waitFor(async () => expect(await isLockEnabled(db)).toBe(false));
  });

  it('cannot turn the lock on when the iPhone has no passcode', async () => {
    await setup({ authenticator: fakeAuthenticator(false) });
    await fireEvent.press(await screen.findByText('設定'));
    expect(await screen.findByText('この端末にパスコードが設定されていないため、ロックは使えません。')).toBeTruthy();
    expect(screen.getByLabelText('Face IDでロックする').props.disabled).toBe(true);
  });
});

describe('coming back to the app', () => {
  it('moves "today" forward after the date changed, so the real day can be recorded', async () => {
    let day = '2026-10-24';
    await setup({ today: () => day });
    await screen.findByText('2026年10月');
    day = '2026-10-26';
    await returnToApp();
    await fireEvent.press(screen.getByLabelText('10月26日（月）、生理1日目（予測）'));
    expect(screen.getByText('この日を生理開始日として記録')).toBeTruthy();
  });

  it('reads the calendar again, so an event added while away is checked', async () => {
    const calendar = fakeCalendar(true);
    await setup({ calendar });
    expect(await screen.findByLabelText('10月26日（月）、生理1日目（予測）')).toBeTruthy();
    const added: CalendarEvent = { id: 'interview', title: '面接', start: '2026-10-26', end: '2026-10-26', allDay: false };
    calendar.getEvents.mockImplementation(async (from, until) =>
      [...EVENTS, added].filter((event) => event.end >= from && event.start <= until),
    );
    await returnToApp();
    expect(await screen.findByLabelText('10月26日（月）、生理1日目（予測）、予定と重なっています')).toBeTruthy();
  });

  it('notices calendar access granted in the Settings app without asking again', async () => {
    const calendar = fakeCalendar(false);
    await setup({ calendar });
    expect(await screen.findByText(/カレンダーへのアクセスが許可されていない/)).toBeTruthy();
    calendar.hasAccess.mockResolvedValue(true);
    await returnToApp();
    expect(screen.queryByText(/カレンダーへのアクセスが許可されていない/)).toBeNull();
    expect(calendar.getEvents).toHaveBeenCalled();
    expect(calendar.requestAccess).toHaveBeenCalledTimes(1);
  });

  it('notices notifications turned on in the Settings app and schedules them', async () => {
    const notifier = fakeNotifier(false);
    await setup({ notifier });
    await fireEvent.press(await screen.findByText('設定'));
    expect(screen.getByText('端末の設定で通知がオフになっています。')).toBeTruthy();
    notifier.hasAccess.mockResolvedValue(true);
    await returnToApp();
    expect(screen.queryByText('端末の設定で通知がオフになっています。')).toBeNull();
    expect(notifier.replaceAll).toHaveBeenCalled();
    expect(notifier.requestAccess).toHaveBeenCalledTimes(1);
  });
});

it('explains when the data cannot be loaded', async () => {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <Main
        loadDatabase={() => Promise.reject(new Error('no'))}
        calendar={fakeCalendar(true)}
        notifier={fakeNotifier()}
        today={() => '2026-10-24'}
      />
    </SafeAreaProvider>,
  );
  expect(await screen.findByText('データを読み込めませんでした。アプリを開き直してください。')).toBeTruthy();
});
