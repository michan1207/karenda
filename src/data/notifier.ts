import {
  AndroidImportance,
  cancelAllScheduledNotificationsAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  SchedulableTriggerInputTypes,
  setNotificationChannelAsync,
  setNotificationHandler,
} from 'expo-notifications';
import { Platform } from 'react-native';

import { fromDateKey } from '../engine/date';
import type { NotificationPlan } from '../engine/notifications';

/** 端末内で予約するローカル通知だけを扱う（サーバーからの通知は使わない） */
export type Notifier = {
  /** すでに許可されていれば確認画面を出さずに true */
  requestAccess(): Promise<boolean>;
  /** 予約済みの通知をすべて消して、渡したものだけを予約し直す */
  replaceAll(plans: NotificationPlan[], now?: Date): Promise<void>;
};

const CHANNEL_ID = 'guard';
/** 通知を出す時刻（朝のうちに予定を見直せるように） */
export const NOTIFY_HOUR = 9;

export function fireTime(plan: NotificationPlan): Date {
  const date = fromDateKey(plan.date);
  date.setHours(NOTIFY_HOUR, 0, 0, 0);
  return date;
}

let configured = false;

async function configure() {
  if (configured) return;
  configured = true;
  setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await setNotificationChannelAsync(CHANNEL_ID, { name: '予定と体調のお知らせ', importance: AndroidImportance.DEFAULT });
  }
}

export const deviceNotifier: Notifier = {
  async requestAccess() {
    await configure();
    const current = await getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await requestPermissionsAsync()).granted;
  },
  async replaceAll(plans, now = new Date()) {
    await configure();
    await cancelAllScheduledNotificationsAsync();
    for (const plan of plans) {
      const date = fireTime(plan);
      if (date <= now) continue;
      await scheduleNotificationAsync({
        identifier: plan.id,
        content: { title: plan.title, body: plan.body },
        trigger: { type: SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL_ID },
      });
    }
  },
};
