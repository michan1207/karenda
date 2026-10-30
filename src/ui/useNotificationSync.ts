import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { ConflictAlert, DateKey, planActions, planNotifications, planReviewNotifications, ReviewTarget } from '../engine';
import type { Karenda } from './useKarenda';

/**
 * アプリを開くたび・予定や記録が変わるたびに、通知の予約を組み直す。
 * 通知を切っているときは予約をすべて消す。
 */
export function useNotificationSync(k: Karenda, alerts: ConflictAlert[], reviews: ReviewTarget[], today: DateKey): void {
  const { status, onboarded, access, notifyEnabled, notifyAccess, notifier, reviewed, deferrals, starts, settings, keywords } = k;
  const ready = status === 'ready' && onboarded && access !== 'checking';
  // 時間帯が変わったら（旅先など）、戻った時にその土地の朝9時で予約し直す
  const [offset, setOffset] = useState(() => new Date().getTimezoneOffset());
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setOffset(new Date().getTimezoneOffset());
    });
    return () => subscription.remove();
  }, []);
  // iOS が待たせておける通知は64件まで。重なる予定と「どうだった？」は、どちらも30日で1日1件までなので収まる
  const plans = JSON.stringify(
    notifyEnabled
      ? [
          ...planNotifications(
            alerts,
            today,
            (alert) => planActions({ alert, event: alert.event, starts, settings, keywords, today }),
            deferrals,
          ),
          ...planReviewNotifications(reviews, reviewed, today),
        ]
      : [],
  );

  useEffect(() => {
    if (!ready || notifyAccess !== 'granted') return;
    notifier.replaceAll(JSON.parse(plans)).catch(() => {});
  }, [ready, notifyAccess, notifier, plans, offset]);
}
