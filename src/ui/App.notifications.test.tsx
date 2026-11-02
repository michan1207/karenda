import { EVENTS, fakeCalendar, fakeNotifier, sendAppState, returnToApp, lastPlanDates, setup } from './testApp';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { loadState, setNotifyEnabled } from '../data';

describe('notifications', () => {
  it('schedules reminders before clashing events', async () => {
    const { notifier } = await setup();
    await screen.findByText('お知らせ（2）');
    // 10-27の出張（A）は7日前が過ぎているので3日前の今日だけ、11-20のプレゼン（A）は7日前の11-13と3日前の11-17
    expect(lastPlanDates(notifier)).toEqual(['2026-10-24', '2026-11-13', '2026-11-17']);
  });

  it('tells the day\u2019s timed events in the morning, for the next 7 days', async () => {
    const dentist = { id: 'dentist', title: '歯医者', start: '2026-10-26', end: '2026-10-26', allDay: false, startMinutes: 600, durationMinutes: 60 };
    const { notifier } = await setup({ calendar: fakeCalendar(true, [...EVENTS, dentist]) });
    await screen.findByText('お知らせ（2）');
    await waitFor(() =>
      expect(notifier.replaceAll.mock.calls.at(-1)![0].filter((plan) => plan.id.startsWith('day-'))).toEqual([
        { id: 'day-2026-10-26', date: '2026-10-26', minutes: 420, title: '今日の予定', body: '今日は10時から歯医者の予定です。' },
      ]),
    );
  });

  it('also tells 30 minutes before a timed event, and stops when that is turned off in settings', async () => {
    const dentist = { id: 'dentist', title: '歯医者', start: '2026-10-26', end: '2026-10-26', allDay: false, startMinutes: 600, durationMinutes: 60 };
    const { notifier } = await setup({ calendar: fakeCalendar(true, [...EVENTS, dentist]) });
    await screen.findByText('お知らせ（2）');
    const last = () => notifier.replaceAll.mock.calls.at(-1)![0];
    const soon = () => last().filter((plan) => plan.id.startsWith('soon-'));
    await waitFor(() =>
      expect(soon()).toEqual([
        { id: 'soon-2026-10-26-600', date: '2026-10-26', minutes: 570, title: '10時からの予定', body: '歯医者の予定です。', optional: true },
      ]),
    );
    await fireEvent.press(screen.getByText('設定'));
    await fireEvent(screen.getByLabelText('予定の30分前にも知らせる'), 'valueChange', false);
    await waitFor(() => expect(soon()).toEqual([]));
    // 朝の「今日の予定」はそのまま
    expect(last().map((plan) => plan.id)).toContain('day-2026-10-26');
  });

  it('says on Android that the 30-minute notice can be late without exact times, and hides it when notifications are off', async () => {
    await setup({ notifier: fakeNotifier(true, false) });
    await fireEvent.press(await screen.findByText('設定'));
    expect(screen.getByText(/「時刻ちょうどに知らせる」がオフだと、予定に間に合わないことがあります。/)).toBeTruthy();
    await fireEvent(screen.getByLabelText('通知を使う'), 'valueChange', false);
    await waitFor(() => expect(screen.queryByLabelText('予定の30分前にも知らせる')).toBeNull());
  });

  it('drops the reminder of a dismissed alert', async () => {
    const { notifier } = await setup();
    await fireEvent.press(await screen.findByText('お知らせ（2）'));
    await fireEvent.press(screen.getAllByText('確認した')[0]);
    await screen.findByText('お知らせ（1）');
    expect(lastPlanDates(notifier)).toEqual(['2026-11-13', '2026-11-17']);
  });

  it('writes the decision deadline and a concrete step, with buttons for the event', async () => {
    const { notifier } = await setup();
    await screen.findByText('お知らせ（2）');
    const today = notifier.replaceAll.mock.calls.at(-1)![0].find((plan) => plan.date === '2026-10-24')!;
    expect(today.title).toBe('10/27「福岡出張」の前に');
    expect(today.body).toMatch(/^今日中に.+間に合います（.+）$/);
    expect(today.decide).toEqual({ conflicts: [{ eventId: 'trip', date: '2026-10-27' }], fixed: false });
  });

  it('acts on the notification buttons: checked, see other days, and not today', async () => {
    const { notifier, db } = await setup();
    await screen.findByText('お知らせ（2）');
    const decide = notifier.onDecision.mock.calls.at(-1)![0];
    await act(async () => decide([{ eventId: 'trip', date: '2026-10-27' }], 'acknowledge'));
    expect(await screen.findByText('お知らせ（1）')).toBeTruthy();

    await act(async () => decide([{ eventId: 'talk', date: '2026-11-20' }], 'defer'));
    await waitFor(async () => expect([...(await loadState(db)).deferrals.keys()]).toEqual(['talk']));

    expect(screen.queryByText('これから30日のお知らせ')).toBeNull();
    await act(async () => decide([{ eventId: 'talk', date: '2026-11-20' }], 'alternatives'));
    expect(await screen.findByText('これから30日のお知らせ')).toBeTruthy();
  });

  it('schedules again at 9:00 local time after the time zone changes', async () => {
    const { notifier } = await setup();
    await screen.findByText('お知らせ（2）');
    const before = notifier.replaceAll.mock.calls.length;
    const offset = jest.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-540);
    await act(async () => sendAppState('active'));
    offset.mockRestore();
    expect(notifier.replaceAll.mock.calls.length).toBeGreaterThan(before);
  });

  it('clears all reminders when turned off in settings', async () => {
    const { notifier } = await setup();
    await fireEvent.press(await screen.findByText('設定'));
    await fireEvent(screen.getByLabelText('通知を使う'), 'valueChange', false);
    expect(await screen.findByText('お知らせ（2）')).toBeTruthy();
    expect(lastPlanDates(notifier)).toEqual([]);
  });

  it('clears scheduled reminders when turned off here, even if the device took the permission away', async () => {
    const notifier = fakeNotifier(false);
    await setup({ notifier, prepare: (db) => setNotifyEnabled(db, false) });
    await waitFor(() => expect(notifier.replaceAll).toHaveBeenCalledWith([]));
  });

  it('lets the person choose exact times on Android in the Settings app, and books again when it changes', async () => {
    const notifier = fakeNotifier(true, false);
    await setup({ notifier });
    await fireEvent.press(await screen.findByText('設定'));
    expect((await screen.findByLabelText('時刻ちょうどに知らせる')).props.value).toBe(false);
    const before = notifier.replaceAll.mock.calls.length;
    notifier.exactAlarm.mockResolvedValue(true);
    await fireEvent(screen.getByLabelText('時刻ちょうどに知らせる'), 'valueChange', true);
    expect(notifier.openExactAlarm).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText('時刻ちょうどに知らせる').props.value).toBe(true));
    expect(notifier.replaceAll.mock.calls.length).toBeGreaterThan(before);
    // オフにした時は設定アプリからすぐには戻らないので、アプリに戻った時に読み直す
    notifier.exactAlarm.mockResolvedValue(false);
    await returnToApp();
    expect(screen.getByLabelText('時刻ちょうどに知らせる').props.value).toBe(false);
  });

  it('does not show the exact-time switch where notices always come on time', async () => {
    await setup();
    await fireEvent.press(await screen.findByText('設定'));
    expect(screen.getByLabelText('通知を使う')).toBeTruthy();
    expect(screen.queryByLabelText('時刻ちょうどに知らせる')).toBeNull();
  });

  it('does not schedule when the device has notifications off, and says so', async () => {
    const notifier = fakeNotifier(false);
    await setup({ notifier });
    await fireEvent.press(await screen.findByText('設定'));
    expect(screen.getByText('端末の設定で通知がオフになっています。')).toBeTruthy();
    expect(notifier.replaceAll).not.toHaveBeenCalled();
  });
});
