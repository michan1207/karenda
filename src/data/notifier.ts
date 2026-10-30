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
import type { DateKey } from '../engine/date';
import type { Decision, NotificationPlan } from '../engine/notifications';

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
  /** 重なる予定の通知のボタンを押した時に呼ぶ（ボタンでアプリが開いた時の分も）。止める関数を返す */
  onDecision(handler: (conflicts: { eventId: string; date: DateKey }[], decision: Decision) => void): () => void;
};

const CHANNEL_ID = 'guard';
const REVIEW_CATEGORY = 'review';
const DECIDE_CATEGORY = 'decide';
/** 動かせない予定だけの通知。別の日は勧めないので「代替日を見る」を付けない */
const DECIDE_FIXED_CATEGORY = 'decideFixed';
const DECISIONS = new Map<string, Decision>([
  ['acknowledge', 'acknowledge'],
  ['alternatives', 'alternatives'],
  ['defer', 'defer'],
]);
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
  const acknowledge = { identifier: 'acknowledge', buttonTitle: '確認した' };
  const defer = { identifier: 'defer', buttonTitle: '今日は決めない' };
  await setNotificationCategoryAsync(DECIDE_CATEGORY, [acknowledge, { identifier: 'alternatives', buttonTitle: '代替日を見る' }, defer]).catch(() => {});
  await setNotificationCategoryAsync(DECIDE_FIXED_CATEGORY, [acknowledge, defer]).catch(() => {});
  if (Platform.OS === 'android') {
    await setNotificationChannelAsync(CHANNEL_ID, { name: '予定と体調のお知らせ', importance: AndroidImportance.DEFAULT });
  }
}

/**
 * 通知への反応を受け取る。ボタンでアプリが開いた時は、聞き始める前に押されているので最後の反応も見る。
 * 最後の反応は、受け取った側だけが消す（ほかの種類の通知を待っている側に残す）
 */
function listen(handle: (response: NotificationResponse) => boolean): () => void {
  const last = getLastNotificationResponse();
  if (last && handle(last)) clearLastNotificationResponse();
  const subscription = addNotificationResponseReceivedListener(handle);
  return () => subscription.remove();
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
          : plan.decide
            ? {
                title: plan.title,
                body: plan.body,
                categoryIdentifier: plan.decide.fixed ? DECIDE_FIXED_CATEGORY : DECIDE_CATEGORY,
                data: { decide: plan.decide.conflicts },
              }
            : { title: plan.title, body: plan.body },
        trigger: { type: SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL_ID },
      });
    }
  },
  onReviewAnswer(handler) {
    return listen((response) => {
      const target = response.notification.request.content.data?.review as ReviewTarget | undefined;
      if (!target || !REVIEW_ANSWERS.has(response.actionIdentifier)) return false;
      handler(target, REVIEW_ANSWERS.get(response.actionIdentifier)!);
      return true;
    });
  },
  onDecision(handler) {
    return listen((response) => {
      const conflicts = response.notification.request.content.data?.decide as { eventId: string; date: DateKey }[] | undefined;
      if (!conflicts || !DECISIONS.has(response.actionIdentifier)) return false;
      handler(conflicts, DECISIONS.get(response.actionIdentifier)!);
      return true;
    });
  },
};
