import * as Notifications from 'expo-notifications';

import { deviceNotifier } from './notifier';

jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  clearLastNotificationResponse: jest.fn(),
  getLastNotificationResponse: jest.fn(() => null),
  setNotificationCategoryAsync: jest.fn(async () => ({})),
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {}),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  setNotificationChannelAsync: jest.fn(async () => null),
  setNotificationHandler: jest.fn(),
}));

const mocked = jest.mocked(Notifications);

beforeEach(() => jest.clearAllMocks());

describe('deviceNotifier.replaceAll', () => {
  it('cancels old reminders and schedules future ones at 9:00', async () => {
    await deviceNotifier.replaceAll(
      [
        { id: 'guard-2026-10-24', date: '2026-10-24', title: 'past', body: '' },
        { id: 'guard-2026-10-26', date: '2026-10-26', title: '出張の前に', body: '本文' },
      ],
      new Date(2026, 9, 24, 10, 0),
    );
    expect(mocked.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: 'guard-2026-10-26',
      content: { title: '出張の前に', body: '本文' },
      trigger: { type: 'date', date: new Date(2026, 9, 26, 9, 0), channelId: 'guard' },
    });
  });

  it('keeps a reminder due later today', async () => {
    await deviceNotifier.replaceAll(
      [{ id: 'guard-2026-10-24', date: '2026-10-24', title: 't', body: 'b' }],
      new Date(2026, 9, 24, 7, 30),
    );
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('runs overlapping calls one after the other, so an older plan is not added after a newer one', async () => {
    const now = new Date(2026, 9, 24);
    await Promise.all([
      deviceNotifier.replaceAll([{ id: 'old', date: '2026-10-26', title: 'old', body: '' }], now),
      deviceNotifier.replaceAll([{ id: 'new', date: '2026-10-27', title: 'new', body: '' }], now),
    ]);
    const lastCancel = Math.max(...mocked.cancelAllScheduledNotificationsAsync.mock.invocationCallOrder);
    const { calls, invocationCallOrder } = mocked.scheduleNotificationAsync.mock;
    const kept = calls.filter((_, i) => invocationCallOrder[i] > lastCancel).map(([request]) => request.identifier);
    expect(kept).toEqual(['new']);
  });

  it('schedules the rest when one reminder cannot be scheduled', async () => {
    mocked.scheduleNotificationAsync.mockRejectedValueOnce(new Error('full'));
    await deviceNotifier.replaceAll(
      [
        { id: 'a', date: '2026-10-26', title: 'a', body: '' },
        { id: 'b', date: '2026-10-27', title: 'b', body: '' },
      ],
      new Date(2026, 9, 24),
    );
    expect(mocked.scheduleNotificationAsync).toHaveBeenLastCalledWith(expect.objectContaining({ identifier: 'b' }));
  });

  it('creates the Android channel again when the first try failed', async () => {
    // Android として読み込み直す（はじめの設定は一度きりなので、ほかのテストとは別に読み込む）
    let notifications!: typeof mocked;
    let notifier!: typeof deviceNotifier;
    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({ Platform: { OS: 'android' } }));
      notifications = jest.requireMock('expo-notifications');
      notifier = jest.requireActual<typeof import('./notifier')>('./notifier').deviceNotifier;
    });
    notifications.setNotificationChannelAsync.mockRejectedValueOnce(new Error('busy'));
    await expect(notifier.replaceAll([], new Date(2026, 9, 24))).rejects.toThrow('busy');
    await notifier.replaceAll([], new Date(2026, 9, 24));
    expect(notifications.setNotificationChannelAsync).toHaveBeenCalledTimes(2);
  });
});

describe('asking how an event went', () => {
  const review = { eventId: 'ev', title: '役員会議', date: '2026-10-24', phase: 'pms' as const, risk: 'medium' as const };
  const response = (actionIdentifier: string) =>
    ({ actionIdentifier, notification: { request: { content: { data: { review } } } } }) as never;

  it('schedules it with the answer buttons', async () => {
    await deviceNotifier.replaceAll([{ id: 'review-2026-10-25', date: '2026-10-25', title: 't', body: 'b', review }], new Date(2026, 9, 24));
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({ content: { title: 't', body: 'b', categoryIdentifier: 'review', data: { review } } }),
    );
  });

  it('passes on the button pressed, including the one that opened the app, but not a plain tap', () => {
    mocked.getLastNotificationResponse.mockReturnValueOnce(response('skip'));
    const handler = jest.fn();
    deviceNotifier.onReviewAnswer(handler);
    const listener = mocked.addNotificationResponseReceivedListener.mock.calls[0][0];
    listener(response('hard'));
    listener(response('expo.modules.notifications.actions.DEFAULT'));
    expect(handler.mock.calls).toEqual([
      [review, null],
      [review, 'hard'],
    ]);
    expect(mocked.clearLastNotificationResponse).toHaveBeenCalled();
  });
});

describe('deciding about an overlapping event', () => {
  const conflicts = [{ eventId: 'trip', date: '2026-10-27' }];
  const response = (actionIdentifier: string) =>
    ({ actionIdentifier, notification: { request: { content: { data: { decide: conflicts } } } } }) as never;

  it('schedules it with the decision buttons, without "代替日を見る" when nothing can move', async () => {
    await deviceNotifier.replaceAll(
      [
        { id: 'guard-2026-10-25', date: '2026-10-25', title: 't', body: 'b', decide: { conflicts, fixed: false } },
        { id: 'guard-2026-10-26', date: '2026-10-26', title: 't', body: 'b', decide: { conflicts, fixed: true } },
      ],
      new Date(2026, 9, 24),
    );
    const contents = mocked.scheduleNotificationAsync.mock.calls.map(([request]) => request.content);
    expect(contents).toEqual([
      { title: 't', body: 'b', categoryIdentifier: 'decide', data: { decide: conflicts } },
      { title: 't', body: 'b', categoryIdentifier: 'decideFixed', data: { decide: conflicts } },
    ]);
  });

  it('passes on the button pressed, even when the review listener saw the opening response first', () => {
    mocked.getLastNotificationResponse.mockReturnValue(response('defer'));
    deviceNotifier.onReviewAnswer(jest.fn());
    expect(mocked.clearLastNotificationResponse).not.toHaveBeenCalled();
    const handler = jest.fn();
    deviceNotifier.onDecision(handler);
    expect(mocked.clearLastNotificationResponse).toHaveBeenCalled();
    mocked.getLastNotificationResponse.mockReturnValue(null);

    const listener = mocked.addNotificationResponseReceivedListener.mock.calls[1][0];
    listener(response('alternatives'));
    listener(response('expo.modules.notifications.actions.DEFAULT'));
    expect(handler.mock.calls).toEqual([
      [conflicts, 'defer'],
      [conflicts, 'alternatives'],
    ]);
  });
});

describe('deviceNotifier.requestAccess', () => {
  it('does not ask again when already granted', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true } as never);
    expect(await deviceNotifier.requestAccess()).toBe(true);
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('asks when it still can', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as never);
    mocked.requestPermissionsAsync.mockResolvedValue({ granted: true } as never);
    expect(await deviceNotifier.requestAccess()).toBe(true);
  });

  it('reports false when the user turned notifications off', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false } as never);
    expect(await deviceNotifier.requestAccess()).toBe(false);
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});
