import {
  addNotificationResponseReceivedListener,
  AndroidImportance,
  cancelAllScheduledNotificationsAsync,
  clearLastNotificationResponse,
  getLastNotificationResponse,
  getPermissionsAsync,
  NotificationResponse,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  SchedulableTriggerInputTypes,
  setNotificationCategoryAsync,
  setNotificationChannelAsync,
  setNotificationHandler,
} from 'expo-notifications';
import { Platform } from 'react-native';

import { fromDateKey } from '../engine/date';
import type { Answer, ReviewTarget } from '../engine/learning';
import type { NotificationPlan } from '../engine/notifications';

/** 端末内で予約するローカル通知だけを扱う（サーバーからの通知は使わない） */
export type Notifier = {
  /** すでに許可されていれば確認画面を出さずに true */
  requestAccess(): Promise<boolean>;
  /** 確認画面を出さずに、いまの許可だけを返す */
  hasAccess(): Promise<boolean>;
  /** 予約済みの通知をすべて消して、渡したものだけを予約し直す */
  replaceAll(plans: NotificationPlan[], now?: Date): Promise<void>;
  /** 「どうだった？」の通知のボタンで答えた時に呼ぶ（ボタンでアプリが開いた時の分も）。止める関数を返す */
  onReviewAnswer(handler: (target: ReviewTarget, answer: Answer | null) => void): () => void;
};

const CHANNEL_ID = 'guard';
const REVIEW_CATEGORY = 'review';
/** ボタンの id と答え。null は「答えない」 */
const REVIEW_ANSWERS = new Map<string, Answer | null>([
  ['hard', 'hard'],
  ['normal', 'normal'],
  ['easy', 'easy'],
  ['skip', null],
]);
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
  // アプリを開かないボタンは、アプリが終了していると答えを受け取れない（expo-notifications の制限）ので、押すと開く
  await setNotificationCategoryAsync(REVIEW_CATEGORY, [
    { identifier: 'hard', buttonTitle: 'きつかった' },
    { identifier: 'normal', buttonTitle: 'ふつう' },
    { identifier: 'easy', buttonTitle: '平気だった' },
    { identifier: 'skip', buttonTitle: '答えない' },
    // ボタンが付けられなくても、ほかの通知は止めない（答えはホームでも聞く）
  ]).catch(() => {});
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
  async hasAccess() {
    return (await getPermissionsAsync()).granted;
  },
  async replaceAll(plans, now = new Date()) {
    await configure();
    await cancelAllScheduledNotificationsAsync();
    for (const plan of plans) {
      const date = fireTime(plan);
      if (date <= now) continue;
      await scheduleNotificationAsync({
        identifier: plan.id,
        content: plan.review
          ? { title: plan.title, body: plan.body, categoryIdentifier: REVIEW_CATEGORY, data: { review: plan.review } }
          : { title: plan.title, body: plan.body },
        trigger: { type: SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL_ID },
      });
    }
  },
  onReviewAnswer(handler) {
    const handle = (response: NotificationResponse | null) => {
      const target = response?.notification.request.content.data?.review as ReviewTarget | undefined;
      const action = response?.actionIdentifier ?? '';
      if (target && REVIEW_ANSWERS.has(action)) handler(target, REVIEW_ANSWERS.get(action)!);
    };
    // ボタンでアプリが開いた時は、聞き始める前に押されている
    handle(getLastNotificationResponse());
    clearLastNotificationResponse();
    const subscription = addNotificationResponseReceivedListener(handle);
    return () => subscription.remove();
  },
};
