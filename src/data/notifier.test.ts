import * as Notifications from 'expo-notifications';

import { deviceNotifier, fireTime } from './notifier';

/** 端末に予約されている通知の偽物。予約・取り消し・一覧を、この Map で真似る */
const mockBooked = new Map<string, Notifications.NotificationRequestInput>();

jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  clearLastNotificationResponse: jest.fn(),
  deleteNotificationChannelAsync: jest.fn(async () => {}),
  getLastNotificationResponse: jest.fn(() => null),
  setNotificationCategoryAsync: jest.fn(async () => ({})),
  AndroidImportance: { DEFAULT: 3 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  cancelAllScheduledNotificationsAsync: jest.fn(async () => mockBooked.clear()),
  cancelScheduledNotificationAsync: jest.fn(async (identifier: string) => {
    mockBooked.delete(identifier);
  }),
  getAllScheduledNotificationsAsync: jest.fn(async () => [...mockBooked.values()]),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(async (request: Notifications.NotificationRequestInput) => {
    mockBooked.set(request.identifier!, request);
    return request.identifier;
  }),
  setNotificationChannelAsync: jest.fn(async () => null),
  setNotificationHandler: jest.fn(),
}));

const mocked = jest.mocked(Notifications);

beforeEach(() => {
  jest.clearAllMocks();
  mockBooked.clear();
});

describe('deviceNotifier.replaceAll', () => {
  it('replaces old reminders and schedules future ones at 9:00', async () => {
    // 前の版の予約（印が無い）も、新しい中身に置き換える
    mockBooked.set('guard-2026-10-26', { identifier: 'guard-2026-10-26', content: { title: '前の文' }, trigger: null });
    mockBooked.set('guard-2026-10-20', { identifier: 'guard-2026-10-20', content: { title: 'もう要らない' }, trigger: null });
    await deviceNotifier.replaceAll(
      [
        { id: 'guard-2026-10-24', date: '2026-10-24', title: 'past', body: '' },
        { id: 'guard-2026-10-26', date: '2026-10-26', title: '出張の前に', body: '本文' },
      ],
      new Date(2026, 9, 24, 10, 0),
    );
    expect([...mockBooked.keys()]).toEqual(['guard-2026-10-26']);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: 'guard-2026-10-26',
      content: { title: '出張の前に', body: '本文', data: { key: expect.any(String) } },
      trigger: { type: 'date', date: new Date(2026, 9, 26, 9, 0), channelId: 'guard-public' },
    });
  });

  it('keeps a notice that is due but not shown yet when the app opens again', async () => {
    // Android は7時の通知を8時ごろまで遅らせて出すことがある。7時3分に開いた時に、まだ出ていない7時の通知を消さない（2026-11-02）
    const plans = [
      { id: 'day-2026-11-02', date: '2026-11-02', minutes: 420, title: '今日の予定', body: '今日は10時から会議の予定です。' },
      { id: 'guard-2026-11-03', date: '2026-11-03', title: 't', body: 'b' },
    ];
    await deviceNotifier.replaceAll(plans, new Date(2026, 10, 2, 5, 34));
    await deviceNotifier.replaceAll(plans, new Date(2026, 10, 2, 7, 3));
    expect([...mockBooked.keys()]).toEqual(['day-2026-11-02', 'guard-2026-11-03']);
  });

  it('books the future ones again even when nothing changed', async () => {
    // Android は強制停止や「アラームとリマインダー」をオフにした時に予約の目覚ましを消すが、一覧には残る。開くたびに予約し直して戻す
    const plans = [{ id: 'guard-2026-11-03', date: '2026-11-03', title: 't', body: 'b' }];
    await deviceNotifier.replaceAll(plans, new Date(2026, 10, 2, 5, 34));
    await deviceNotifier.replaceAll(plans, new Date(2026, 10, 2, 7, 3));
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  });

  it('drops a notice that is due but not shown yet when its text changed', async () => {
    const day = { id: 'day-2026-11-02', date: '2026-11-02', minutes: 420, title: '今日の予定', body: '今日は10時から会議の予定です。' };
    await deviceNotifier.replaceAll([day], new Date(2026, 10, 2, 5, 34));
    await deviceNotifier.replaceAll([{ ...day, body: '今日は10時から会議、14時から歯医者の予定です。' }], new Date(2026, 10, 2, 7, 3));
    expect(mockBooked.size).toBe(0);
  });

  it('cancels a notice that is no longer planned, and replaces one whose text changed', async () => {
    const now = new Date(2026, 10, 2, 5, 0);
    await deviceNotifier.replaceAll(
      [
        { id: 'a', date: '2026-11-03', title: 'a', body: '前' },
        { id: 'b', date: '2026-11-04', title: 'b', body: '' },
      ],
      now,
    );
    await deviceNotifier.replaceAll([{ id: 'a', date: '2026-11-03', title: 'a', body: '後' }], now);
    expect([...mockBooked.values()].map((request) => request.content.body)).toEqual(['後']);
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
    expect([...mockBooked.keys()]).toEqual(['new']);
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
      expect.objectContaining({ content: { title: 't', body: 'b', categoryIdentifier: 'review', data: { review, key: expect.any(String) } } }),
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
      { title: 't', body: 'b', categoryIdentifier: 'decide', data: { decide: conflicts, key: expect.any(String) } },
      { title: 't', body: 'b', categoryIdentifier: 'decideFixed', data: { decide: conflicts, key: expect.any(String) } },
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

describe('the Android channel', () => {
  it('shows the quiet text on a locked screen, in a new channel that replaces the old one', async () => {
    // Android として読み込み直す（はじめの設定は一度きりなので、ほかのテストとは別に読み込む）
    let notifications!: typeof mocked;
    let notifier!: typeof deviceNotifier;
    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({ Platform: { OS: 'android' } }));
      notifications = jest.requireMock('expo-notifications');
      notifier = jest.requireActual<typeof import('./notifier')>('./notifier').deviceNotifier;
    });
    await notifier.replaceAll([{ id: 'a', date: '2026-10-26', title: 't', body: 'b' }], new Date(2026, 9, 24));
    expect(notifications.deleteNotificationChannelAsync).toHaveBeenCalledWith('guard');
    expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith('guard-public', expect.objectContaining({ lockscreenVisibility: 1 }));
    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: expect.objectContaining({ channelId: 'guard-public' }) }),
    );
  });
});

describe('fireTime', () => {
  it('uses the plan\u2019s own time when it has one, and 9:00 otherwise', () => {
    expect(fireTime({ id: 'd', date: '2026-10-26', minutes: 330, title: 't', body: 'b' })).toEqual(new Date(2026, 9, 26, 5, 30));
    expect(fireTime({ id: 'd', date: '2026-10-26', title: 't', body: 'b' })).toEqual(new Date(2026, 9, 26, 9, 0));
  });
});
