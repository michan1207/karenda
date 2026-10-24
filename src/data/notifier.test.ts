import * as Notifications from 'expo-notifications';

import { deviceNotifier } from './notifier';

jest.mock('expo-notifications', () => ({
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
