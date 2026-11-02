import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { ConflictAlert, DateKey, Guard, planNotifications, planReviewNotifications, quietNotifications, ReviewTarget } from '../engine';
import { useEventReminders } from './useEventReminders';
import type { Karenda } from './useKarenda';

/**
 * アプリを開くたび・予定や記録が変わるたびに、通知の予約を組み直す。
 * 通知を切っているときは予約をすべて消す。
 */
export function useNotificationSync(
  k: Karenda,
  alerts: ConflictAlert[],
  actionsOf: Guard['actionsOf'],
  reviews: ReviewTarget[],
  today: DateKey,
): void {
  const { status, onboarded, access, notifyEnabled, notifyAccess, exactAlarm, notifier, reviewed, deferrals } = k;
  const ready = status === 'ready' && onboarded && access !== 'checking';
  // 時間帯が変わったら（旅先など）、戻った時にその土地の朝9時で予約し直す
  const [offset, setOffset] = useState(() => new Date().getTimezoneOffset());
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setOffset(new Date().getTimezoneOffset());
    });
    return () => subscription.remove();
  }, []);
  const reminders = useEventReminders(k, today);
  // iOS が待たせておける通知は64件までなので、予約する側（notifier）が近い順に64件まで予約する
  const all = notifyEnabled
    ? [
        ...planNotifications(alerts, today, actionsOf, deferrals),
        ...planReviewNotifications(reviews, reviewed, today),
        ...reminders,
      ]
    : [];
  // Android はロック画面にも中身がそのまま出るので、やわらかい文だけにする
  const plans = JSON.stringify(Platform.OS === 'android' ? quietNotifications(all) : all);

  useEffect(() => {
    // 通知を切った時は、端末の許可が外れていても予約を消す（消すのに許可は要らない）
    if (!ready || (notifyEnabled && notifyAccess !== 'granted')) return;
    notifier.replaceAll(JSON.parse(plans)).catch(() => {});
    // 「アラームとリマインダー」を変えた時も予約し直す（時刻ちょうどに出すかは、予約した時の許可で決まる）
  }, [ready, notifyEnabled, notifyAccess, notifier, plans, offset, exactAlarm]);
}
