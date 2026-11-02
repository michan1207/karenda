import {
  addNotificationResponseReceivedListener,
  AndroidImportance,
  AndroidNotificationVisibility,
  cancelScheduledNotificationAsync,
  clearLastNotificationResponse,
  deleteNotificationChannelAsync,
  getAllScheduledNotificationsAsync,
  getExactAlarmPermissionsAsync,
  getLastNotificationResponse,
  getPermissionsAsync,
  NotificationRequestInput,
  NotificationResponse,
  requestExactAlarmPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  SchedulableTriggerInputTypes,
  setNotificationCategoryAsync,
  setNotificationChannelAsync,
  setNotificationHandler,
} from 'expo-notifications';
import { Linking, Platform } from 'react-native';

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
  /**
   * Android の「アラームとリマインダー」（通知を時刻ちょうどに出す許可）がオンか。オフだと最大1時間ほど遅れて出る。
   * iPhone はいつも時刻どおりなので null
   */
  exactAlarm(): Promise<boolean | null>;
  /** 「アラームとリマインダー」の設定を開く。オンにするかオフにするかは使う人が決める */
  openExactAlarm(): Promise<void>;
  /** 予約を渡したものだけにする。先の分は予約し直し、時刻を過ぎてまだ出ていない予約は中身が同じなら残す */
  replaceAll(plans: NotificationPlan[], now?: Date): Promise<void>;
  /** 「どうだった？」の通知のボタンで答えた時に呼ぶ（ボタンでアプリが開いた時の分も）。止める関数を返す */
  onReviewAnswer(handler: (target: ReviewTarget, answer: Answer | null) => void): () => void;
  /** 重なる予定の通知のボタンを押した時に呼ぶ（ボタンでアプリが開いた時の分も）。止める関数を返す */
  onDecision(handler: (conflicts: { eventId: string; date: DateKey }[], decision: Decision) => void): () => void;
};

/**
 * Android の通知チャンネル。通知の文は何の予定か分からないもの（quietNotifications）だけなので、
 * 鍵のかかったロック画面でも「内容を非表示」にせず、その文を出す（2026-11-01 オーナー決定）。
 * 見せ方は作ったあとに変えられないので、前の 'guard' とは別の id で作り直す
 */
const CHANNEL_ID = 'guard-public';
const OLD_CHANNEL_ID = 'guard';
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
  date.setHours(0, plan.minutes ?? NOTIFY_HOUR * 60, 0, 0);
  return date;
}

let configuring: Promise<void> | null = null;

/** はじめの設定。何度呼んでも1回だけ行い、失敗したら（Android の通知チャンネルが作れなかった時など）次の呼び出しでやり直す */
function configure(): Promise<void> {
  configuring ??= setUp();
  configuring.catch(() => {
    configuring = null;
  });
  return configuring;
}

async function setUp() {
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
    // 前のチャンネルは設定の一覧に残らないよう消す（無ければ何もしない）
    await deleteNotificationChannelAsync(OLD_CHANNEL_ID).catch(() => {});
    await setNotificationChannelAsync(CHANNEL_ID, {
      name: '予定と体調のお知らせ',
      importance: AndroidImportance.DEFAULT,
      lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
    });
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
  async exactAlarm() {
    return Platform.OS === 'android' ? (await getExactAlarmPermissionsAsync()).granted : null;
  },
  async openExactAlarm() {
    // オンの時は許可の画面が開かずにすぐ戻るので、オフにしたい時はアプリの情報の画面を開く（そこにも項目がある）
    if ((await getExactAlarmPermissionsAsync()).granted) await Linking.openSettings();
    else await requestExactAlarmPermissionsAsync();
  },
  replaceAll(plans, now = new Date()) {
    // 組み直しが重なると、先の分が後の全取消のあとに古い予約を足してしまうので、前が終わってから行う
    const run = scheduling.then(() => schedule(plans, now));
    scheduling = run.catch(() => {});
    return run;
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

let scheduling: Promise<void> = Promise.resolve();

/** 1件の予約。出す時刻と中身から作った印（key）を data に入れ、組み直す時に、時刻を過ぎた予約が同じものかを見分ける */
function toRequest(plan: NotificationPlan) {
  const date = fireTime(plan);
  const content = plan.review
    ? { title: plan.title, body: plan.body, categoryIdentifier: REVIEW_CATEGORY, data: { review: plan.review } }
    : plan.decide
      ? {
          title: plan.title,
          body: plan.body,
          categoryIdentifier: plan.decide.fixed ? DECIDE_FIXED_CATEGORY : DECIDE_CATEGORY,
          data: { decide: plan.decide.conflicts },
        }
      : { title: plan.title, body: plan.body };
  const key = JSON.stringify([date.getTime(), content]);
  return {
    date,
    request: {
      identifier: plan.id,
      content: { ...content, data: { ...('data' in content ? content.data : {}), key } },
      trigger: { type: SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL_ID },
    } satisfies NotificationRequestInput,
  };
}

/** iOS が待たせておける通知の数。あふれた先の分は、次に組み直す時に予約する */
const MAX_PENDING = 64;

/**
 * 渡したものだけが予約されているようにする（replaceAll から1つずつ呼ぶ）。要らなくなった予約は取り消し、先の予約は
 * 近い順に64件まで、毎回予約し直す（Android は強制停止などで目覚ましを消しても一覧には残すので、残っていても鳴るとは限らない）。
 * 時刻を過ぎてまだ出ていない予約は、中身が同じならそのまま残す。Android は通知を時刻から最大1時間遅らせて出すので、
 * 取り消すと戻らないまま消える（2026-11-02、7時の「今日の予定」が7時3分にアプリを開いて消えた）
 */
async function schedule(plans: NotificationPlan[], now: Date) {
  await configure();
  const booked = await getAllScheduledNotificationsAsync();
  const bookedKeys = new Map(booked.map(({ identifier, content }) => [identifier, content.data?.key]));
  const requests = plans.map(toRequest);
  const kept = new Set(
    requests
      .filter(({ date, request }) => date <= now && bookedKeys.get(request.identifier) === request.content.data.key)
      .map(({ request }) => request.identifier),
  );
  const next = requests
    .filter(({ date }) => date > now)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, Math.max(0, MAX_PENDING - kept.size));
  const ids = new Set(next.map(({ request }) => request.identifier));
  for (const { identifier } of booked) if (!kept.has(identifier) && !ids.has(identifier)) await cancelScheduledNotificationAsync(identifier);
  // 先の予約は同じ id で置き換わる。1件予約できなくても、残りは予約する
  for (const { request } of next) await scheduleNotificationAsync(request).catch(() => {});
}
