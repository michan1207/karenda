import { useEffect } from 'react';

import { ConflictAlert, DateKey, planNotifications, planReviewNotifications, ReviewTarget } from '../engine';
import type { Karenda } from './useKarenda';

/**
 * アプリを開くたび・予定や記録が変わるたびに、通知の予約を組み直す。
 * 通知を切っているときは予約をすべて消す。
 */
export function useNotificationSync(k: Karenda, alerts: ConflictAlert[], reviews: ReviewTarget[], today: DateKey): void {
  const { status, onboarded, access, notifyEnabled, notifyAccess, notifier, reviewed } = k;
  const ready = status === 'ready' && onboarded && access !== 'checking';
  // iOS が待たせておける通知は64件まで。警告は30日で最大28件、「どうだった？」は朝1件なので収まる
  const plans = JSON.stringify(
    notifyEnabled ? [...planNotifications(alerts, today), ...planReviewNotifications(reviews, reviewed, today)] : [],
  );

  useEffect(() => {
    if (!ready || notifyAccess !== 'granted') return;
    notifier.replaceAll(JSON.parse(plans)).catch(() => {});
  }, [ready, notifyAccess, notifier, plans]);
}
