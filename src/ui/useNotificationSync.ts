import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { ConflictAlert, DateKey, Guard, planNotifications, planReviewNotifications, quietNotifications, ReviewTarget } from '../engine';
import { useDayReminders } from './useDayReminders';
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
  const { status, onboarded, access, notifyEnabled, notifyAccess, notifier, reviewed, deferrals } = k;
  const ready = status === 'ready' && onboarded && access !== 'checking';
  // 時間帯が変わったら（旅先など）、戻った時にその土地の朝9時で予約し直す
  const [offset, setOffset] = useState(() => new Date().getTimezoneOffset());
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setOffset(new Date().getTimezoneOffset());
    });
    return () => subscription.remove();
  }, []);
  const reminders = useDayReminders(k, today);
  // iOS が待たせておける通知は64件まで。重なる予定と「どうだった？」は30日で1日1件まで、その日の予定は7日分。
  // 全部そろうと少し超えるが、iOS は近い順に64件を残すので、あふれるのは先の分だけ（アプリを開けば組み直す）
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
  }, [ready, notifyEnabled, notifyAccess, notifier, plans, offset]);
}
